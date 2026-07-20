"""
Checagem de Risco — pipeline PySpark de diligência em lote (amostra de portfólio).

Ponto de entrada único: recebe um lote de contrapartes, consulta fontes
estruturadas e a checagem de mídia em paralelo, aplica as regras
configuradas e devolve o dossiê final como uma tabela.

Uso típico (novo ciclo de análise sobre uma carteira inteira):

    from pyspark.sql import SparkSession
    from pyspark_pipeline import run_analysis

    spark = SparkSession.builder.appName("checagem-de-risco").getOrCreate()

    batch = spark.createDataFrame(
        [("00000000000191", "Contraparte Exemplo LTDA")],
        schema=["document_id", "counterparty_name"],
    )

    dossie = run_analysis(spark, batch, ruleset_path="rules_config.example.yaml")
    dossie.write.mode("overwrite").parquet("output/dossie/")
"""

from __future__ import annotations

from pyspark.sql import DataFrame, SparkSession

from media_check import fetch_media_signals
from rules_engine import apply_rules, load_ruleset
from sources import fetch_structured_signals


def run_analysis(
    spark: SparkSession,
    batch: DataFrame,
    ruleset_path: str = "rules_config.example.yaml",
) -> DataFrame:
    """
    Executa uma nova análise para um lote de contrapartes.

    `batch` é um DataFrame com uma linha por contraparte a checar, colunas
    `document_id` e `counterparty_name`.

    Retorna o dossiê final: uma linha por contraparte com `score`,
    `flagged_rules`, `recommendation`, `generated_at` e `rule_version` — uma
    tabela pronta para gravar num data warehouse ou exportar, não um
    documento a ser parseado por outro sistema.
    """
    ruleset = load_ruleset(ruleset_path)

    structured_signals = fetch_structured_signals(spark, batch)
    media_signals = fetch_media_signals(spark, batch)

    # Ambos os DataFrames compartilham o mesmo schema (ver SIGNAL_SCHEMA em
    # sources.py) — o motor de regras a seguir nunca precisa saber qual
    # sinal veio de qual origem.
    all_signals = structured_signals.unionByName(media_signals)

    return apply_rules(all_signals, ruleset)


if __name__ == "__main__":
    spark = SparkSession.builder.appName("checagem-de-risco").getOrCreate()

    example_batch = spark.createDataFrame(
        [("00000000000191", "Contraparte Exemplo LTDA")],
        schema=["document_id", "counterparty_name"],
    )

    dossie = run_analysis(spark, example_batch)
    dossie.show(truncate=False)
