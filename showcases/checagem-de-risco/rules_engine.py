"""
Checagem de Risco — motor de regras configurável (amostra de portfólio).

Consome sinais normalizados (venham de sources.py ou media_check.py — este
módulo não diferencia a origem) e produz o dossiê final: score, regras
sinalizadas e recomendação, por contraparte.

Decisão central, já explicada no README: sinais de VETO (bloqueio automático,
ex.: sanção ativa) são avaliados separadamente de sinais PONDERADOS (score
contínuo) — uma contraparte sancionada nunca deveria "passar" por ter boas
notas em outros critérios.

Regras vêm de um arquivo YAML (`rules_config.example.yaml`), não de código:
adicionar ou reponderar uma regra é uma mudança de configuração.
"""

from __future__ import annotations

from dataclasses import dataclass

import yaml
from pyspark.sql import DataFrame
from pyspark.sql import functions as F
from pyspark.sql.types import ArrayType, DoubleType, StringType, StructField, StructType


@dataclass(frozen=True)
class VetoSignal:
    signal_id: str
    status: str
    reason: str


@dataclass(frozen=True)
class WeightedSignal:
    signal_id: str
    weight: float


@dataclass(frozen=True)
class RuleSet:
    rule_version: str
    veto_signals: tuple[VetoSignal, ...]
    weighted_signals: tuple[WeightedSignal, ...]
    reject_threshold: float
    manual_review_threshold: float


def load_ruleset(path: str) -> RuleSet:
    """Carrega e valida a configuração declarativa de regras a partir de um YAML."""
    with open(path, encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)

    return RuleSet(
        rule_version=raw["rule_version"],
        veto_signals=tuple(VetoSignal(**v) for v in raw.get("veto_signals", [])),
        weighted_signals=tuple(WeightedSignal(**w) for w in raw.get("weighted_signals", [])),
        reject_threshold=raw["thresholds"]["reject"],
        manual_review_threshold=raw["thresholds"]["manual_review"],
    )


_ASSESSMENT_SCHEMA = StructType(
    [
        StructField("score", DoubleType(), nullable=False),
        StructField("flagged_rules", ArrayType(StringType()), nullable=False),
        StructField("recommendation", StringType(), nullable=False),
    ]
)


def _assess_signals(signals: list[dict], ruleset: RuleSet) -> dict:
    """
    Função pura: dado o conjunto de sinais de UMA contraparte e o ruleset,
    retorna score, regras sinalizadas e recomendação.

    Ser pura (sem side effects, sem I/O) é o que torna trivial testar casos
    conhecidos de compliance sem precisar de Spark nem de banco de dados —
    só chamar esta função com uma lista de sinais e comparar o resultado.
    """
    signal_status = {s["signal_id"]: s["status"] for s in signals}

    triggered_vetoes = [
        veto.signal_id for veto in ruleset.veto_signals if signal_status.get(veto.signal_id) == veto.status
    ]

    if triggered_vetoes:
        return {"score": 1.0, "flagged_rules": triggered_vetoes, "recommendation": "reject"}

    matched = [w for w in ruleset.weighted_signals if signal_status.get(w.signal_id) == "hit"]
    total_weight = sum(w.weight for w in ruleset.weighted_signals)
    matched_weight = sum(w.weight for w in matched)
    score = matched_weight / total_weight if total_weight > 0 else 0.0

    if score >= ruleset.reject_threshold:
        recommendation = "reject"
    elif score >= ruleset.manual_review_threshold:
        recommendation = "manual_review"
    else:
        recommendation = "approve"

    return {
        "score": score,
        "flagged_rules": [w.signal_id for w in matched],
        "recommendation": recommendation,
    }


def apply_rules(signals: DataFrame, ruleset: RuleSet) -> DataFrame:
    """
    Agrupa os sinais por contraparte e aplica o ruleset, produzindo a tabela
    final do dossiê: uma linha por contraparte, com score, regras
    sinalizadas e recomendação.
    """
    grouped = signals.groupBy("document_id").agg(
        F.collect_list(F.struct("signal_id", "status")).alias("signals")
    )

    def _assess_udf(collected_signals):
        as_dicts = [{"signal_id": row["signal_id"], "status": row["status"]} for row in collected_signals]
        return _assess_signals(as_dicts, ruleset)

    assess = F.udf(_assess_udf, _ASSESSMENT_SCHEMA)

    return grouped.withColumn("assessment", assess(F.col("signals"))).select(
        "document_id",
        F.col("assessment.score").alias("score"),
        F.col("assessment.flagged_rules").alias("flagged_rules"),
        F.col("assessment.recommendation").alias("recommendation"),
        F.current_timestamp().alias("generated_at"),
        F.lit(ruleset.rule_version).alias("rule_version"),
    )
