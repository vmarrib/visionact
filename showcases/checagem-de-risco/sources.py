"""
Checagem de Risco — conectores de fontes estruturadas (amostra de portfólio).

Generalizado a partir do código real: os nomes e endpoints reais das fontes
públicas foram substituídos por exemplos genéricos ("registry",
"sanctions_list", "court_records"). O que se mantém é a estratégia de
paralelismo e tratamento de falha parcial, que é a mesma usada em produção
(ali implementada em TypeScript com Promise.allSettled; aqui expressa em
PySpark para o cenário de checagem em lote).

Decisão de arquitetura, parte 1 — por que mapInPandas e não um UDF comum?

Um UDF do Spark roda uma vez POR LINHA. Se cada linha abrir sua própria
conexão HTTP, um lote de 10.000 contrapartes abre 10.000 conexões —
desperdício de handshake TLS repetido e risco real de estourar limite de
conexões simultâneas do lado da fonte externa. `mapInPandas` roda uma vez
POR PARTIÇÃO (recebendo um iterador de lotes pandas, não linha a linha): a
conexão (ou sessão HTTP com keep-alive) é criada uma vez no início da
partição e reaproveitada para todas as linhas dali, com o paralelismo
vindo do número de partições processadas simultaneamente pelo cluster, não
do número de linhas.

Correção registrada: a primeira versão deste arquivo usava
`df.rdd.mapPartitions(...)` (API de RDD "crua"). Rodando de verdade num
workspace Databricks com compute **serverless**, isso falhou com
`[NOT_IMPLEMENTED] Using custom code using PySpark RDDs is not allowed on
serverless compute` — serverless não expõe a API de RDD, só a de
DataFrame. `mapInPandas` (DataFrame-native, mesma ideia de "uma função por
partição") é o substituto sugerido pela própria mensagem de erro, funciona
em serverless, e não perde nada da estratégia original de reaproveitar
conexão por partição.

Decisão de arquitetura, parte 2 — por que PySpark só é importado DENTRO das
funções que o usam, e não no topo do arquivo?

`_query_source_with_retry` é a parte que importa de verdade revisar num code
review: é ela que decide o que conta como "não encontrado" vs "fonte fora
do ar", e é ela que tem casos de borda (timeout, retry, códigos HTTP
inesperados) que merecem teste unitário. Ela não usa NADA do PySpark — só
`time` e o `session` que recebe por parâmetro. Colocando o `import pyspark`
apenas dentro de `fetch_structured_signals` (que só existe para orquestrar
Spark), esta função pura continua importável e testável com pytest comum,
sem precisar de um cluster Spark instalado só para rodar `pytest`.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Iterator, Protocol


@dataclass(frozen=True)
class StructuredSource:
    """
    Descreve uma fonte estruturada a consultar.

    `signal_id` identifica a fonte no resultado final (ex.: "registry",
    "sanctions_list") — os nomes reais das fontes de produção foram
    substituídos por exemplos aqui de propósito.
    """

    signal_id: str
    base_url: str
    timeout_seconds: float = 8.0
    max_retries: int = 2


# Lista de exemplo — na configuração real, isso vem de um arquivo de
# configuração por organização, não hardcoded.
EXAMPLE_SOURCES: list[StructuredSource] = [
    StructuredSource(signal_id="registry", base_url="https://example-registry.invalid"),
    StructuredSource(signal_id="sanctions_list", base_url="https://example-sanctions.invalid"),
    StructuredSource(signal_id="court_records", base_url="https://example-courts.invalid"),
]


class HttpResponse(Protocol):
    """
    Formato mínimo de resposta HTTP que `_query_source_with_retry` precisa —
    descrito como Protocol (não importando `requests.Response` diretamente)
    para que os testes possam passar um objeto fake sem precisar da
    biblioteca `requests` instalada nem de rede real.
    """

    status_code: int

    def json(self) -> dict: ...


class HttpSession(Protocol):
    def get(self, url: str, timeout: float) -> HttpResponse: ...


def _query_source_with_retry(session: HttpSession, source: StructuredSource, document_id: str) -> dict:
    """
    Consulta uma fonte para um único documento, com retry exponencial.

    Isolar o retry aqui (e não no chamador) significa que uma falha
    transitória de rede em UMA linha de uma partição não precisa derrubar o
    processamento das outras linhas da mesma partição.

    Regras de interpretação de resposta (documentadas aqui porque são o tipo
    de detalhe que se perde se não for escrito):
      - 200 com corpo `{"match": true|false}` → resultado definitivo.
      - 403 ou 404 → tratado como "não encontrado", não como erro. Convenção
        observada nas fontes reais: "não encontrado" às vezes vem como erro
        de autorização, não como 200 vazio.
      - Qualquer outro código, ou exceção de rede → tenta de novo com
        backoff exponencial (0.5s, 1s, 2s, ...) até `max_retries`; esgotadas
        as tentativas, o sinal final é "unavailable" com o motivo anexado.
    """
    last_error: Exception | None = None

    for attempt in range(source.max_retries + 1):
        try:
            response = session.get(
                f"{source.base_url}/check/{document_id}",
                timeout=source.timeout_seconds,
            )
            if response.status_code == 200:
                return {"status": "hit" if response.json().get("match") else "no_hit", "detail": None}
            if response.status_code in (403, 404):
                return {"status": "no_hit", "detail": None}
            last_error = RuntimeError(f"status inesperado: {response.status_code}")
        except Exception as exc:  # noqa: BLE001 - queremos capturar qualquer falha de rede aqui
            last_error = exc
            if attempt < source.max_retries:
                time.sleep(0.5 * (2**attempt))

    return {"status": "unavailable", "detail": str(last_error)}


def _to_signal_row(source: StructuredSource, document_id: str, result: dict) -> dict:
    """
    Converte o resultado de `_query_source_with_retry` para o schema comum
    de sinal. Fontes estruturadas são binárias por natureza — uma resposta
    "hit" tem confiança máxima (`intensity=1.0`), diferente de um sinal de
    mídia, cuja confiança é proporcional ao número de artigos corroborantes.
    """
    return {
        "document_id": document_id,
        "signal_id": source.signal_id,
        "kind": "structured",
        "status": result["status"],
        "intensity": 1.0 if result["status"] == "hit" else 0.0,
        "detail": result["detail"],
    }


# ---------------------------------------------------------------------------
# A partir daqui, tudo depende de PySpark — só usado por quem de fato roda o
# pipeline num cluster (ou Spark local), não por quem só quer rodar
# `pytest` sobre a lógica de `_query_source_with_retry` acima.
# ---------------------------------------------------------------------------


def _process_partition_pandas(source: StructuredSource):
    """
    Fábrica de função para `mapInPandas`: cria UMA sessão HTTP por
    partição (não por linha) e a reaproveita para todas as linhas — mesma
    ideia de um `mapPartitions` de RDD, só que operando sobre lotes
    pandas, o que a torna compatível com compute serverless.
    """

    def process(batches: Iterator) -> Iterator:
        import pandas as pd
        import requests  # import local: só necessário nos workers, não no driver

        session = requests.Session()
        try:
            for batch_df in batches:
                rows = [
                    _to_signal_row(source, document_id, _query_source_with_retry(session, source, document_id))
                    for document_id in batch_df["document_id"]
                ]
                yield pd.DataFrame(rows)
        finally:
            session.close()

    return process


def fetch_structured_signals(spark, batch, sources: list[StructuredSource] = EXAMPLE_SOURCES):
    """
    Consulta todas as fontes estruturadas configuradas para o lote inteiro.

    Cada fonte gera seu próprio DataFrame de sinais (via mapInPandas) e os
    resultados são unidos — falha em uma fonte não afeta as demais, e o
    dossiê final ainda é gerado com o que estiver disponível.
    """
    from signal_schema import SIGNAL_SCHEMA

    all_signals = None

    for source in sources:
        partial_df = batch.select("document_id").mapInPandas(
            _process_partition_pandas(source), schema=SIGNAL_SCHEMA
        )
        all_signals = partial_df if all_signals is None else all_signals.unionByName(partial_df)

    assert all_signals is not None, "nenhuma fonte configurada"
    return all_signals
