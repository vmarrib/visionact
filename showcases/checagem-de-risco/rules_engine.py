"""
Checagem de Risco — motor de regras configurável (amostra de portfólio).

Consome sinais normalizados (venham de sources.py ou media_check.py — este
módulo não diferencia a origem) e produz o dossiê final: score, regras
sinalizadas e recomendação, por contraparte.

Decisão central, já explicada no README: sinais de VETO (bloqueio automático,
ex.: sanção ativa) são avaliados separadamente de sinais PONDERADOS (score
contínuo) — uma contraparte sancionada nunca deveria "passar" por ter boas
notas em outros critérios.

Segunda decisão, mais sutil: sinais ponderados usam a `intensity` do sinal
(0 a 1), não um "hit"/"no_hit" binário. Um sinal de fonte estruturada tem
intensidade máxima (é uma resposta objetiva de uma fonte confiável); um
sinal de mídia carrega a intensidade calculada em `score_media_hits()`
(proporcional a quantos artigos corroboram). Isso evita que uma única
menção de imprensa isolada pese o mesmo que uma resposta positiva de uma
fonte estruturada — a incerteza da origem do sinal se propaga até o score
final, em vez de ser descartada num binário prematuro.

Regras vêm de um arquivo YAML (`rules_config.example.yaml`), não de código:
adicionar ou reponderar uma regra é uma mudança de configuração.
"""

from __future__ import annotations

from dataclasses import dataclass

import yaml


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


def assess_signals(signals: list[dict], ruleset: RuleSet) -> dict:
    """
    Função pura: dado o conjunto de sinais de UMA contraparte e o ruleset,
    retorna score, regras sinalizadas e recomendação.

    Ser pura (sem side effects, sem I/O, sem depender de Spark) é o que
    torna trivial testar casos conhecidos de compliance com pytest comum —
    só chamar esta função com uma lista de sinais e comparar o resultado,
    sem precisar de um cluster Spark nem de banco de dados.

    `signals` é uma lista de dicts com pelo menos `signal_id`, `status` e
    `intensity` — o mesmo formato de linha usado no schema comum
    (ver `signal_schema.py`).
    """
    by_signal_id = {s["signal_id"]: s for s in signals}

    triggered_vetoes = [
        veto.signal_id
        for veto in ruleset.veto_signals
        if by_signal_id.get(veto.signal_id, {}).get("status") == veto.status
    ]

    if triggered_vetoes:
        return {"score": 1.0, "flagged_rules": triggered_vetoes, "recommendation": "reject"}

    total_weight = sum(w.weight for w in ruleset.weighted_signals)
    weighted_sum = sum(
        w.weight * by_signal_id.get(w.signal_id, {}).get("intensity", 0.0)
        for w in ruleset.weighted_signals
    )
    score = weighted_sum / total_weight if total_weight > 0 else 0.0

    flagged_rules = [
        w.signal_id
        for w in ruleset.weighted_signals
        if by_signal_id.get(w.signal_id, {}).get("intensity", 0.0) > 0
    ]

    if score >= ruleset.reject_threshold:
        recommendation = "reject"
    elif score >= ruleset.manual_review_threshold:
        recommendation = "manual_review"
    else:
        recommendation = "approve"

    return {"score": score, "flagged_rules": flagged_rules, "recommendation": recommendation}


# ---------------------------------------------------------------------------
# A partir daqui, tudo depende de PySpark — mesma separação usada em
# sources.py e media_check.py: `assess_signals` acima é testável com pytest
# comum, sem precisar de PySpark instalado.
# ---------------------------------------------------------------------------


def apply_rules(signals, ruleset: RuleSet):
    """
    Agrupa os sinais por contraparte e aplica o ruleset, produzindo a tabela
    final do dossiê: uma linha por contraparte, com score, regras
    sinalizadas e recomendação.
    """
    from pyspark.sql import functions as F
    from pyspark.sql.types import ArrayType, DoubleType, StringType, StructField, StructType

    assessment_schema = StructType(
        [
            StructField("score", DoubleType(), nullable=False),
            StructField("flagged_rules", ArrayType(StringType()), nullable=False),
            StructField("recommendation", StringType(), nullable=False),
        ]
    )

    grouped = signals.groupBy("document_id").agg(
        F.collect_list(F.struct("signal_id", "status", "intensity")).alias("signals")
    )

    def _assess_udf(collected_signals):
        as_dicts = [
            {"signal_id": row["signal_id"], "status": row["status"], "intensity": row["intensity"]}
            for row in collected_signals
        ]
        return assess_signals(as_dicts, ruleset)

    assess = F.udf(_assess_udf, assessment_schema)

    return grouped.withColumn("assessment", assess(F.col("signals"))).select(
        "document_id",
        F.col("assessment.score").alias("score"),
        F.col("assessment.flagged_rules").alias("flagged_rules"),
        F.col("assessment.recommendation").alias("recommendation"),
        F.current_timestamp().alias("generated_at"),
        F.lit(ruleset.rule_version).alias("rule_version"),
    )
