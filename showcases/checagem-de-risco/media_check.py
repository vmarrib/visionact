"""
Checagem de Risco — checagem de mídia adversa (amostra de portfólio).

Este NÃO é um bureau: não existe uma API oficial que responda "esta empresa
teve notícia negativa?" com uma resposta estruturada e confiável. Em vez
disso, este módulo varre a web por menções à contraparte e sinaliza
correspondências contra uma lista configurável de palavras-chave de risco.

Por não vir de uma fonte oficial, o resultado deste módulo carrega uma
`intensity` (0 a 1) proporcional a QUANTOS artigos independentes corroboram
o sinal — uma única menção isolada pesa menos que três reportagens
diferentes sobre o mesmo assunto. Isso é tratado no motor de regras como um
sinal ponderado por intensidade, nunca como um veto automático isolado: uma
notícia mencionando uma palavra-chave não é, por si só, prova de
irregularidade.

Arquitetura deste módulo (do fetch ao sinal):
    fetch_articles()      → busca artigos brutos para uma contraparte
    normalize_text()       → normaliza para casamento robusto em PT-BR
    deduplicate_articles() → remove notícias republicadas/idênticas
    match_keyword_rules()  → casa artigos contra as regras de palavra-chave
    score_media_hits()     → converte contagem de artigos em intensidade
    build_media_signal()   → consolida em sinais no schema comum
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol


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


EXAMPLE_MEDIA_RULES: tuple[MediaKeywordRule, ...] = (
    MediaKeywordRule(signal_id="media_fraud_mention", keywords=("fraude", "esquema")),
    MediaKeywordRule(signal_id="media_investigation_mention", keywords=("investigacao", "apuracao")),
)

# Artigos mais antigos que isso são ignorados — reputação recente pesa mais
# do que uma menção de anos atrás, e limitar a janela também limita o custo
# de cada busca.
MEDIA_LOOKBACK_DAYS = 365

# Número de artigos corroborantes a partir do qual a intensidade satura em
# 1.0. Escolhido para que UM artigo isolado nunca pese como prova definitiva
# (intensidade 1/3 ≈ 0.33), mas 3+ fontes independentes sobre o mesmo tema
# já sejam tratadas com peso máximo.
CORROBORATION_CEILING = 3


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
    única notícia negativa infla artificialmente a contagem de artigos
    corroborantes (e, por consequência, a intensidade do sinal).
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


def score_media_hits(matching_article_count: int) -> float:
    """
    Converte a contagem de artigos corroborantes numa intensidade de 0 a 1.

    Crescimento linear até `CORROBORATION_CEILING`, depois satura em 1.0 —
    dobrar de 6 para 12 artigos corroborantes não deveria dobrar o peso do
    sinal outra vez; a partir de um certo ponto, mais repetição da mesma
    informação não é mais evidência adicional.
    """
    if matching_article_count <= 0:
        return 0.0
    return min(1.0, matching_article_count / CORROBORATION_CEILING)


class NewsSearchClient(Protocol):
    """
    Interface mínima que `fetch_articles` precisa do provedor de busca —
    descrita como Protocol para que os testes injetem um fake sem depender
    de rede real ou de uma biblioteca HTTP específica.
    """

    def search(self, query: str) -> list[dict]: ...


def fetch_articles(client: NewsSearchClient, counterparty_name: str) -> list[Article]:
    """
    Busca artigos recentes mencionando a contraparte.

    Implementação ilustrativa: na versão real, `client` consulta um feed de
    busca de notícias (ex.: RSS) e faz parsing do XML retornado. Aqui o
    parsing foi abstraído atrás de `NewsSearchClient.search` — o ponto
    central deste arquivo é o pipeline de normalização + dedup + casamento
    de regras que roda sobre os artigos, não o parser de um formato de
    resposta específico.
    """
    raw_results = client.search(counterparty_name)
    return [
        Article(
            title=r["title"],
            snippet=r.get("snippet", ""),
            url=r["url"],
            published_at=datetime.fromisoformat(r["published_at"]),
        )
        for r in raw_results
    ]


def build_media_signals(
    document_id: str,
    counterparty_name: str,
    client: NewsSearchClient,
    rules: tuple[MediaKeywordRule, ...] = EXAMPLE_MEDIA_RULES,
    now: datetime | None = None,
) -> list[dict]:
    """
    Pipeline completo para uma contraparte: busca, filtra por janela de
    tempo, deduplica, casa regras e consolida em sinais no schema comum.

    Se nenhuma regra casar, ainda emite um sinal "no_hit" para o
    `document_id` — importante para que o dossiê final registre
    explicitamente que a checagem de mídia RODOU e não encontrou nada,
    distinguindo isso de "a checagem de mídia falhou/não rodou".
    """
    reference_time = now or datetime.now(timezone.utc)
    cutoff = reference_time - timedelta(days=MEDIA_LOOKBACK_DAYS)

    try:
        articles = [a for a in fetch_articles(client, counterparty_name) if a.published_at >= cutoff]
        articles = deduplicate_articles(articles)
    except Exception as exc:  # noqa: BLE001
        return [
            {
                "document_id": document_id,
                "signal_id": "media_check",
                "kind": "media",
                "status": "unavailable",
                "intensity": 0.0,
                "detail": str(exc),
            }
        ]

    matches_per_rule: dict[str, int] = {}
    for article in articles:
        for signal_id in match_keyword_rules(article, rules):
            matches_per_rule[signal_id] = matches_per_rule.get(signal_id, 0) + 1

    if not matches_per_rule:
        return [
            {
                "document_id": document_id,
                "signal_id": "media_check",
                "kind": "media",
                "status": "no_hit",
                "intensity": 0.0,
                "detail": None,
            }
        ]

    return [
        {
            "document_id": document_id,
            "signal_id": signal_id,
            "kind": "media",
            "status": "hit",
            "intensity": score_media_hits(count),
            "detail": f"{count} artigo(s) corroborante(s)",
        }
        for signal_id, count in matches_per_rule.items()
    ]


# ---------------------------------------------------------------------------
# A partir daqui, tudo depende de PySpark — mesma separação usada em
# sources.py, e pelo mesmo motivo: tudo acima é testável com pytest comum,
# sem precisar de PySpark instalado.
#
# Correção registrada: a primeira versão usava `df.rdd.mapPartitions(...)`,
# que falha em compute serverless (Databricks bloqueia a API de RDD nesse
# modo — ver o mesmo aviso, mais detalhado, em sources.py). Trocado por
# `mapInPandas`, DataFrame-native e compatível com serverless.
# ---------------------------------------------------------------------------


def _process_partition_pandas(rules: tuple[MediaKeywordRule, ...]):
    """
    Mesma estratégia de `sources.py`: um cliente de busca por partição, não
    por linha, para reaproveitar conexões ao consultar o provedor de busca —
    agora expressa via `mapInPandas` em vez de `mapPartitions` de RDD.
    """

    def process(batches):
        import pandas as pd
        import requests

        class RequestsSearchClient:
            def __init__(self, session):
                self._session = session

            def search(self, query: str) -> list[dict]:
                # Implementação real faria a chamada HTTP e parsing aqui;
                # omitido para focar no pipeline de normalização/scoring.
                raise NotImplementedError

        session = requests.Session()
        client = RequestsSearchClient(session)
        try:
            for batch_df in batches:
                rows = []
                for document_id, counterparty_name in zip(
                    batch_df["document_id"], batch_df["counterparty_name"]
                ):
                    rows.extend(build_media_signals(document_id, counterparty_name, client, rules))
                yield pd.DataFrame(rows)
        finally:
            session.close()

    return process


def fetch_media_signals(spark, batch, rules: tuple[MediaKeywordRule, ...] = EXAMPLE_MEDIA_RULES):
    """Ponto de entrada usado por `pyspark_pipeline.py` — mesmo formato de saída que `sources.py`."""
    from signal_schema import SIGNAL_SCHEMA

    return batch.select("document_id", "counterparty_name").mapInPandas(
        _process_partition_pandas(rules), schema=SIGNAL_SCHEMA
    )
