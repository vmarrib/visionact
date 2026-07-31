"""
Checagem de Risco — pipeline PySpark orquestrador: bureau + checagem de
mídia + motor de compliance, produzindo 3 DataFrames (um por matriz).

`run_kys_analysis`, `run_kye_analysis` e `run_kyc_analysis` recebem cada
uma um DataFrame de lote (`documento`, `nome`) e devolvem um DataFrame no
schema de saída daquela matriz (`pipeline_schemas.py`), um registro por
CNPJ/CPF de entrada.

A execução de verdade de uma busca de mídia (rede, parsing, dedup de
artigo) fica fora do escopo deste showcase, como já documentado em
`media_check_categories.py` — por isso toda função pública aqui aceita um
`media_search_executor` injetável (`str -> int`, nº de artigos
corroborantes para aquela query). Em produção, é aí que entra um cliente
de verdade de API de busca; nos testes, é uma função fake determinística.

Contrato importante entre este arquivo e `pipeline_schemas.py`: as chaves
que `build_output_row()` produz (via `MatrixResult.campos_para_analise`,
que por sua vez vem de `ComplianceRule.campo` em `compliance_engine.py`)
precisam bater exatamente com os nomes de coluna dos schemas de saída. Os
testes (`test_diligence_pipeline.py`) travam esse contrato sem precisar
importar PySpark.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable, Iterable

from bureau_client import fetch_bureau_record
from compliance_engine import KYC_MATRIX, KYE_MATRIX, KYS_MATRIX, ComplianceMatrix, MatrixResult, avaliar_matriz
from media_check_categories import avaliar_media_check, build_media_search_queries

MATRIX_VERSION = "1.0.0"

MediaSearchExecutor = Callable[[str], int]


def _executor_padrao_sem_busca_real(_query: str) -> int:
    """Placeholder: sem integração de busca real configurada, nenhuma
    query retorna corroboração — o pipeline roda (e o compliance de campo
    continua valendo) mesmo sem checagem de mídia conectada. Produção
    substitui por um cliente de API de busca de verdade."""
    return 0


def contar_artigos_por_categoria(
    nome_contraparte: str, category_ids: Iterable[str], executor: MediaSearchExecutor
) -> dict[str, int]:
    """Executa uma query por grupo de palavras-chave (5 por categoria) e
    soma os artigos corroborantes por categoria — simplificação
    deliberada de portfólio: um crawler de verdade deduplicaria artigos
    que aparecem em mais de um grupo da mesma categoria."""
    contagem: dict[str, int] = {}
    for query in build_media_search_queries(nome_contraparte, category_ids):
        contagem[query.category_id] = contagem.get(query.category_id, 0) + executor(query.query)
    return contagem


def build_output_row(matrix_result: MatrixResult) -> dict:
    """Achata um MatrixResult numa linha de saída: os campos de negócio
    vêm de `campos_para_analise` (documento, tipo_documento + só os campos
    de bureau que aquela matriz observa), mais o resultado da matriz e,
    quando existir, a análise de crédito completa (os 4 sub-scores e o
    score combinado) — só a KYC roda modelos de crédito."""
    row: dict = dict(matrix_result.campos_para_analise)
    row.update(
        score=matrix_result.score,
        veto=matrix_result.veto,
        recommendation=matrix_result.recommendation,
        flagged_rules=list(matrix_result.flagged_rules),
        media_categorias_sinalizadas=[r.category_id for r in matrix_result.media_resultados if r.sinalizado],
        generated_at=datetime.now(timezone.utc),
        matrix_version=MATRIX_VERSION,
    )
    if matrix_result.analise_credito is not None:
        for modelo in matrix_result.analise_credito.modelos:
            row[f"score_{modelo.nome}"] = modelo.score_risco
        row["score_credito_final"] = matrix_result.analise_credito.score_credito_final
    return row


def analisar_contraparte(
    matrix: ComplianceMatrix,
    documento: str,
    nome: str,
    bureau_session,
    bureau_base_url: str,
    media_search_executor: MediaSearchExecutor,
) -> dict:
    """Lógica pura de ponta a ponta para 1 contraparte: busca o bureau,
    roda a checagem de mídia no escopo da matriz, avalia a matriz de
    compliance (+ crédito quando aplicável) e devolve a linha de saída.
    Sem dependência de Spark — testável por CNPJ/CPF individual."""
    record = fetch_bureau_record(bureau_session, bureau_base_url, documento)
    contagem = contar_artigos_por_categoria(nome, matrix.categorias_media, media_search_executor)
    media_resultados = avaliar_media_check(contagem, category_ids=matrix.categorias_media)
    resultado = avaliar_matriz(matrix, record, media_resultados)
    return build_output_row(resultado)


def _run_matrix_analysis(spark, batch, matrix: ComplianceMatrix, schema, base_url: str, media_search_executor: MediaSearchExecutor):
    """Integração Spark compartilhada pelas 3 matrizes: `mapInPandas`
    (compatível com compute serverless — a mesma correção já registrada
    nos outros pipelines deste showcase), uma sessão HTTP reaproveitada
    por partição."""

    def process_partitions(batches):
        import pandas as pd
        import requests

        session = requests.Session()
        try:
            for batch_df in batches:
                rows = [
                    analisar_contraparte(matrix, documento, nome, session, base_url, media_search_executor)
                    for documento, nome in zip(batch_df["documento"], batch_df["nome"])
                ]
                yield pd.DataFrame(rows, columns=list(schema.fieldNames()))
        finally:
            session.close()

    return batch.select("documento", "nome").mapInPandas(process_partitions, schema=schema)


def run_kys_analysis(
    spark,
    batch,
    base_url: str = "https://example-credit-bureau.invalid/v1",
    media_search_executor: MediaSearchExecutor | None = None,
):
    """KYS — Know Your Supplier. Compliance por campo em escopo amplo
    (PLD + qualquer envolvimento) + checagem de mídia nas 6 categorias."""
    from pipeline_schemas import KYS_OUTPUT_SCHEMA

    return _run_matrix_analysis(
        spark, batch, KYS_MATRIX, KYS_OUTPUT_SCHEMA, base_url, media_search_executor or _executor_padrao_sem_busca_real
    )


def run_kye_analysis(
    spark,
    batch,
    base_url: str = "https://example-credit-bureau.invalid/v1",
    media_search_executor: MediaSearchExecutor | None = None,
):
    """KYE — Know Your Employee. Compliance por campo restrito a
    processos/mandado de prisão/histórico trabalhista + checagem de mídia
    num escopo pessoal (sem sanção internacional/cartel)."""
    from pipeline_schemas import KYE_OUTPUT_SCHEMA

    return _run_matrix_analysis(
        spark, batch, KYE_MATRIX, KYE_OUTPUT_SCHEMA, base_url, media_search_executor or _executor_padrao_sem_busca_real
    )


def run_kyc_analysis(
    spark,
    batch,
    base_url: str = "https://example-credit-bureau.invalid/v1",
    media_search_executor: MediaSearchExecutor | None = None,
):
    """KYC — Know Your Client. Compliance básico por campo + checagem de
    mídia essencial (sanções, lavagem de dinheiro), mais os 4 modelos de
    crédito embarcados por cima — única matriz com camada de crédito."""
    from pipeline_schemas import KYC_OUTPUT_SCHEMA

    return _run_matrix_analysis(
        spark, batch, KYC_MATRIX, KYC_OUTPUT_SCHEMA, base_url, media_search_executor or _executor_padrao_sem_busca_real
    )
