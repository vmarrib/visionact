"""
Checagem de Risco — conectores de fontes estruturadas (amostra de portfólio).

Generalizado a partir do código real: os nomes e endpoints reais das fontes
públicas foram substituídos por exemplos genéricos ("registry",
"sanctions_list", "court_records"). O que se mantém é a estratégia de
paralelismo e tratamento de falha parcial, que é a mesma usada em produção
(ali implementada em TypeScript com Promise.allSettled; aqui expressa em
PySpark para o cenário de checagem em lote).

Decisão de arquitetura: por que mapPartitions e não um UDF comum?

Um UDF do Spark roda uma vez POR LINHA. Se cada linha abrir sua própria
conexão HTTP, um lote de 10.000 contrapartes abre 10.000 conexões —
desperdício de handshake TLS repetido e risco real de estourar limite de
conexões simultâneas do lado da fonte externa. `mapPartitions` roda uma vez
POR PARTIÇÃO: a conexão (ou sessão HTTP com keep-alive) é criada uma vez no
início da partição e reaproveitada para todas as linhas dali, com o
paralelismo vindo do número de partições processadas simultaneamente pelo
cluster, não do número de linhas.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Iterator

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.types import StringType, StructField, StructType

# ---------------------------------------------------------------------------
# Schema comum de sinal — o MESMO formato usado por sources.py e por
# media_check.py, para que rules_engine.py nunca precise saber de onde um
# sinal veio.
# ---------------------------------------------------------------------------
SIGNAL_SCHEMA = StructType(
    [
        StructField("document_id", StringType(), nullable=False),
        StructField("signal_id", StringType(), nullable=False),
        StructField("kind", StringType(), nullable=False),  # "structured" | "media"
        StructField("status", StringType(), nullable=False),  # "hit" | "no_hit" | "unavailable"
        StructField("detail", StringType(), nullable=True),
    ]
)


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


def _query_source_with_retry(session, source: StructuredSource, document_id: str) -> dict:
    """
    Consulta uma fonte para um único documento, com retry exponencial.

    Isolar o retry aqui (e não no chamador) significa que uma falha
    transitória de rede em UMA linha de uma partição não precisa derrubar o
    processamento das outras linhas da mesma partição.
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
                # Convenção observada nas fontes reais: "não encontrado" às
                # vezes vem como erro de autorização, não como 200 vazio.
                return {"status": "no_hit", "detail": None}
            last_error = RuntimeError(f"status inesperado: {response.status_code}")
        except Exception as exc:  # noqa: BLE001 - queremos capturar qualquer falha de rede aqui
            last_error = exc
            time.sleep(0.5 * (2**attempt))

    return {"status": "unavailable", "detail": str(last_error)}


def _process_partition(source: StructuredSource):
    """
    Fábrica de função para `mapPartitions`: cria UMA sessão HTTP por
    partição (não por linha) e a reaproveita para todas as linhas.
    """

    def process(rows: Iterator) -> Iterator[dict]:
        import requests  # import local: só necessário nos workers, não no driver

        session = requests.Session()
        try:
            for row in rows:
                result = _query_source_with_retry(session, source, row.document_id)
                yield {
                    "document_id": row.document_id,
                    "signal_id": source.signal_id,
                    "kind": "structured",
                    "status": result["status"],
                    "detail": result["detail"],
                }
        finally:
            session.close()

    return process


def fetch_structured_signals(
    spark: SparkSession,
    batch: DataFrame,
    sources: list[StructuredSource] = EXAMPLE_SOURCES,
) -> DataFrame:
    """
    Consulta todas as fontes estruturadas configuradas para o lote inteiro.

    Cada fonte gera seu próprio DataFrame de sinais (via mapPartitions) e os
    resultados são unidos — falha em uma fonte não afeta as demais, e o
    dossiê final ainda é gerado com o que estiver disponível.
    """
    all_signals: DataFrame | None = None

    for source in sources:
        partial = batch.select("document_id").rdd.mapPartitions(_process_partition(source))
        partial_df = spark.createDataFrame(partial, schema=SIGNAL_SCHEMA)
        all_signals = partial_df if all_signals is None else all_signals.unionByName(partial_df)

    assert all_signals is not None, "nenhuma fonte configurada"
    return all_signals
