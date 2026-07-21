"""
Checagem de Risco — schema comum de sinal.

Isolado num módulo próprio (em vez de dentro de `sources.py`) por um motivo
específico: este é o ÚNICO ponto do pipeline que precisa saber o nome dos
tipos do PySpark para declarar o schema. Módulos de lógica pura
(`rules_engine.py`, `media_check.py`) importam `SIGNAL_SCHEMA` apenas dentro
das funções que de fato criam um DataFrame — nunca no topo do arquivo — para
que a lógica de negócio neles continue importável (e testável com pytest
comum) num ambiente sem PySpark instalado, como o usado para rodar os testes
deste showcase.
"""

from pyspark.sql.types import DoubleType, StringType, StructField, StructType

SIGNAL_SCHEMA = StructType(
    [
        StructField("document_id", StringType(), nullable=False),
        StructField("signal_id", StringType(), nullable=False),
        StructField("kind", StringType(), nullable=False),  # "structured" | "media"
        StructField("status", StringType(), nullable=False),  # "hit" | "no_hit" | "unavailable"
        # Confiança do sinal, 0 a 1. Fontes estruturadas emitem 1.0 (resposta
        # binária de uma fonte confiável); a checagem de mídia emite um valor
        # proporcional ao número de artigos corroborantes — ver media_check.py.
        StructField("intensity", DoubleType(), nullable=False),
        StructField("detail", StringType(), nullable=True),
    ]
)
