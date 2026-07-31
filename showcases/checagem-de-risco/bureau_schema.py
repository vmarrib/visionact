"""
Checagem de Risco — schema Spark do registro de bureau normalizado.

Isolado num módulo próprio pelo mesmo motivo de sempre neste showcase:
é o único ponto que precisa importar tipos do PySpark, então
`bureau_client.py` (que tem a lógica de verdade) continua importável e
testável com pytest comum, sem PySpark instalado.
"""

from pyspark.sql.types import BooleanType, DoubleType, IntegerType, StringType, StructField, StructType

BUREAU_SCHEMA = StructType(
    [
        StructField("documento", StringType(), nullable=False),
        # False quando o bureau não encontrou o documento OU a consulta
        # esgotou as tentativas de retry — o restante da linha vem com
        # valores neutros/conservadores, nunca nulos silenciosos.
        StructField("encontrado", BooleanType(), nullable=False),
        StructField("tipo_documento", StringType(), nullable=False),  # "PJ" | "PF"
        StructField("nome", StringType(), nullable=True),
        StructField("situacao_cadastral", StringType(), nullable=False),
        StructField("tempo_atividade_meses", IntegerType(), nullable=False),
        StructField("quantidade_socios", IntegerType(), nullable=False),
        StructField("possui_sancao_ativa", BooleanType(), nullable=False),
        StructField("processos_civeis", IntegerType(), nullable=False),
        StructField("processos_criminais", IntegerType(), nullable=False),
        StructField("processos_trabalhistas", IntegerType(), nullable=False),
        StructField("mandados_prisao_ativos", IntegerType(), nullable=False),
        StructField("protestos", IntegerType(), nullable=False),
        StructField("cheques_sem_fundo", IntegerType(), nullable=False),
        StructField("divida_ativa", DoubleType(), nullable=False),
        StructField("capital_social_ou_renda_mensal", DoubleType(), nullable=False),
        StructField("faturamento_estimado_anual", DoubleType(), nullable=False),
        # Score externo estilo Serasa/SPC (0 a 1000), ilustrativo — o
        # bureau real varia por fornecedor.
        StructField("score_externo_bureau", DoubleType(), nullable=False),
        StructField("setor_atividade", StringType(), nullable=False),
    ]
)
