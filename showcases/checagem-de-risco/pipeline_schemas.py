"""
Checagem de Risco — schemas Spark de saída, um por matriz (KYS/KYE/KYC).

Isolado num módulo próprio pelo mesmo motivo de sempre neste showcase: só
aqui se importa PySpark, então `diligence_pipeline.py` (a lógica de
verdade) continua testável com pytest puro.

Cada schema tem um núcleo comum (documento, score, veto, recomendação,
regras/categorias sinalizadas) mais só os campos de bureau que aquela
matriz de fato usa — reflexo direto de `compliance_engine.<MATRIZ>.regras`.
A KYC ainda carrega os 4 sub-scores dos modelos de crédito, além do score
de crédito final: é a única matriz com camada de crédito.
"""

from pyspark.sql.types import (
    ArrayType,
    BooleanType,
    DoubleType,
    IntegerType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)

_CAMPOS_COMUNS = [
    StructField("documento", StringType(), nullable=False),
    StructField("tipo_documento", StringType(), nullable=False),
    StructField("score", DoubleType(), nullable=False),
    StructField("veto", BooleanType(), nullable=False),
    StructField("recommendation", StringType(), nullable=False),  # approve | manual_review | reject
    StructField("flagged_rules", ArrayType(StringType()), nullable=False),
    StructField("media_categorias_sinalizadas", ArrayType(StringType()), nullable=False),
    StructField("generated_at", TimestampType(), nullable=False),
    StructField("matrix_version", StringType(), nullable=False),
]

KYS_OUTPUT_SCHEMA = StructType(
    _CAMPOS_COMUNS
    + [
        StructField("possui_sancao_ativa", BooleanType(), nullable=False),
        StructField("mandados_prisao_ativos", IntegerType(), nullable=False),
        StructField("processos_criminais", IntegerType(), nullable=False),
        StructField("situacao_cadastral", StringType(), nullable=False),
        StructField("tempo_atividade_meses", IntegerType(), nullable=False),
        StructField("quantidade_socios", IntegerType(), nullable=False),
        StructField("processos_civeis", IntegerType(), nullable=False),
        StructField("divida_ativa", DoubleType(), nullable=False),
    ]
)

KYE_OUTPUT_SCHEMA = StructType(
    _CAMPOS_COMUNS
    + [
        StructField("mandados_prisao_ativos", IntegerType(), nullable=False),
        StructField("processos_criminais", IntegerType(), nullable=False),
        StructField("processos_trabalhistas", IntegerType(), nullable=False),
        StructField("processos_civeis", IntegerType(), nullable=False),
    ]
)

KYC_OUTPUT_SCHEMA = StructType(
    _CAMPOS_COMUNS
    + [
        StructField("possui_sancao_ativa", BooleanType(), nullable=False),
        StructField("situacao_cadastral", StringType(), nullable=False),
        StructField("divida_ativa", DoubleType(), nullable=False),
        # análise de crédito — os 4 modelos embarcados + o score combinado
        StructField("score_capacidade_pagamento", DoubleType(), nullable=False),
        StructField("score_comportamento_pagamento", DoubleType(), nullable=False),
        StructField("score_estabilidade_cadastral", DoubleType(), nullable=False),
        StructField("score_concentracao_setorial", DoubleType(), nullable=False),
        StructField("score_credito_final", DoubleType(), nullable=False),
    ]
)
