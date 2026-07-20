"""
Checagem de Risco — checagem de mídia adversa (amostra de portfólio).

Este NÃO é um bureau: não existe uma API oficial que responda "esta empresa
teve notícia negativa?" com uma resposta estruturada e confiável. Em vez
disso, este módulo varre a web por menções à contraparte e sinaliza
correspondências contra uma lista configurável de palavras-chave de risco.

Por não vir de uma fonte oficial, o resultado deste módulo é tratado no
motor de regras como um SINAL DE INTENSIDADE (quantas correspondências, de
qual severidade), nunca como um veto automático isolado — uma notícia
mencionando uma palavra-chave não é, por si só, prova de irregularidade.

Arquitetura deste módulo (do fetch ao sinal):
    fetch_articles()      → busca artigos brutos para uma contraparte
    normalize_text()       → normaliza para casamento robusto em PT-BR
    deduplicate_articles() → remove notícias republicadas/idênticas
    match_keyword_rules()  → casa artigos contra as regras de palavra-chave
    build_media_signal()   → consolida em um sinal por regra correspondida
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Iterator

from pyspark.sql import DataFrame, SparkSession

from sources import SIGNAL_SCHEMA


@dataclass(frozen=True)
class MediaKeywordRule:
    """
    Uma regra de checagem de mídia: um conjunto de palavras-chave que, se
    encontradas no título ou resumo de um artigo, sinalizam risco de
    reputação sob um determinado `signal_id`.

    A lista de palavras real usada em produção foi omitida de propósito —
    os exemplos abaixo ilustram a estrutura, não o conteúdo real.
    """

    signal_id: str
    keywords: tuple[str, ...]
    severity_hint: float  # 0 a 1, usado como peso relativo pelo motor de regras


EXAMPLE_MEDIA_RULES: tuple[MediaKeywordRule, ...] = (
    MediaKeywordRule(signal_id="media_fraud_mention", keywords=("fraude", "esquema"), severity_hint=0.8),
    MediaKeywordRule(signal_id="media_investigation_mention", keywords=("investigacao", "apuracao"), severity_hint=0.5),
)

# Artigos mais antigos que isso são ignorados — reputação recente pesa mais
# do que uma menção de anos atrás, e limitar a janela também limita o custo
# de cada busca.
MEDIA_LOOKBACK_DAYS = 365


@dataclass
class Article:
    title: str
    snippet: str
    url: str
    published_at: datetime


def normalize_text(text: str) -> str:
    """
    Normaliza texto em PT-BR para casamento robusto: minúsculas e remoção de
    acentos, para que "investigação" e "investigacao" (ou variações de
    grafia em fontes diferentes) casem contra a mesma palavra-chave.
    """
    decomposed = unicodedata.normalize("NFKD", text.lower())
    without_accents = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", without_accents).strip()


def deduplicate_articles(articles: list[Article]) -> list[Article]:
    """
    Remove artigos republicados/idênticos por título normalizado.

    Fontes de notícia frequentemente republicam a mesma matéria (agências,
    sindicação) com o mesmo título em veículos diferentes — sem dedup, uma
    única notícia negativa infla artificialmente a contagem de sinais.
    """
    seen_titles: set[str] = set()
    unique: list[Article] = []

    for article in articles:
        key = normalize_text(article.title)
        if key in seen_titles:
            continue
        seen_titles.add(key)
        unique.append(article)

    return unique


def match_keyword_rules(article: Article, rules: tuple[MediaKeywordRule, ...]) -> list[str]:
    """Retorna os `signal_id` de todas as regras cujas palavras-chave aparecem no artigo."""
    haystack = normalize_text(f"{article.title} {article.snippet}")

    matched = []
    for rule in rules:
        if any(normalize_text(keyword) in haystack for keyword in rule.keywords):
            matched.append(rule.signal_id)

    return matched


def fetch_articles(session, counterparty_name: str, timeout_seconds: float = 8.0) -> list[Article]:
    """
    Busca artigos recentes mencionando a contraparte.

    Implementação ilustrativa: na versão real, isso consulta um feed de
    busca de notícias (ex.: RSS) e faz parsing do XML retornado. Aqui o
    parsing foi omitido — o ponto central deste arquivo é o pipeline de
    normalização + dedup + casamento de regras que roda sobre os artigos,
    não o parser de um formato de resposta específico.
    """
    raise NotImplementedError(
        "Substituir por uma chamada real a um provedor de busca de notícias; "
        "retornar Article(title, snippet, url, published_at) por resultado."
    )


def build_media_signals(
    document_id: str,
    counterparty_name: str,
    session,
    rules: tuple[MediaKeywordRule, ...] = EXAMPLE_MEDIA_RULES,
) -> list[dict]:
    """
    Pipeline completo para uma contraparte: busca, deduplica, casa regras e
    consolida em sinais no MESMO schema usado pelas fontes estruturadas.

    Se nenhuma regra casar, ainda emite um sinal "no_hit" para o
    `document_id` — importante para que o dossiê final registre
    explicitamente que a checagem de mídia RODOU e não encontrou nada,
    distinguindo isso de "a checagem de mídia falhou/não rodou".
    """
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=MEDIA_LOOKBACK_DAYS)
        articles = [a for a in fetch_articles(session, counterparty_name) if a.published_at >= cutoff]
        articles = deduplicate_articles(articles)
    except Exception as exc:  # noqa: BLE001
        return [
            {
                "document_id": document_id,
                "signal_id": "media_check",
                "kind": "media",
                "status": "unavailable",
                "detail": str(exc),
            }
        ]

    matched_signal_ids: set[str] = set()
    for article in articles:
        matched_signal_ids.update(match_keyword_rules(article, rules))

    if not matched_signal_ids:
        return [
            {
                "document_id": document_id,
                "signal_id": "media_check",
                "kind": "media",
                "status": "no_hit",
                "detail": None,
            }
        ]

    return [
        {
            "document_id": document_id,
            "signal_id": signal_id,
            "kind": "media",
            "status": "hit",
            "detail": f"{len(articles)} artigo(s) analisado(s)",
        }
        for signal_id in matched_signal_ids
    ]


def _process_partition(rules: tuple[MediaKeywordRule, ...]):
    """
    Mesma estratégia de `sources.py`: uma sessão HTTP por partição, não por
    linha, para reaproveitar conexões ao consultar o provedor de busca.
    """

    def process(rows: Iterator) -> Iterator[dict]:
        import requests

        session = requests.Session()
        try:
            for row in rows:
                yield from build_media_signals(row.document_id, row.counterparty_name, session, rules)
        finally:
            session.close()

    return process


def fetch_media_signals(
    spark: SparkSession,
    batch: DataFrame,
    rules: tuple[MediaKeywordRule, ...] = EXAMPLE_MEDIA_RULES,
) -> DataFrame:
    """Ponto de entrada usado por `pyspark_pipeline.py` — mesmo formato de saída que `sources.py`."""
    partial = batch.select("document_id", "counterparty_name").rdd.mapPartitions(_process_partition(rules))
    return spark.createDataFrame(partial, schema=SIGNAL_SCHEMA)
