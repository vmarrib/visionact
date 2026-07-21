"""
Testes de `rules_engine.py` — o coração do "Checagem de Risco".

`assess_signals` é uma função pura (sem I/O, sem PySpark), então estes
testes montam listas de sinais à mão e comparam o resultado — o mesmo tipo
de caso que, em produção, viraria um teste de regressão a partir de um
dossiê real que precisou ser revisado manualmente.
"""

from rules_engine import RuleSet, VetoSignal, WeightedSignal, assess_signals, load_ruleset

RULESET = RuleSet(
    rule_version="test-1.0",
    veto_signals=(VetoSignal(signal_id="sanctions_list", status="hit", reason="sanção ativa"),),
    weighted_signals=(
        WeightedSignal(signal_id="registry", weight=0.3),
        WeightedSignal(signal_id="court_records", weight=0.3),
        WeightedSignal(signal_id="media_fraud_mention", weight=0.9),
    ),
    reject_threshold=0.7,
    manual_review_threshold=0.35,
)


def _signal(signal_id: str, status: str, intensity: float) -> dict:
    return {"signal_id": signal_id, "status": status, "intensity": intensity}


def test_veto_signal_forces_reject_regardless_of_other_signals():
    """
    O ponto central do design: mesmo com todos os outros sinais limpos, UMA
    sanção ativa é suficiente para reject — nenhuma pontuação boa em outro
    critério deveria compensar isso.
    """
    signals = [
        _signal("sanctions_list", "hit", 1.0),
        _signal("registry", "no_hit", 0.0),
        _signal("court_records", "no_hit", 0.0),
    ]

    result = assess_signals(signals, RULESET)

    assert result["recommendation"] == "reject"
    assert result["score"] == 1.0
    assert result["flagged_rules"] == ["sanctions_list"]


def test_no_signals_present_results_in_approve():
    """Ausência total de sinais (nenhuma fonte respondeu 'hit') não deveria travar em erro — score 0, aprovado."""
    result = assess_signals([], RULESET)

    assert result["score"] == 0.0
    assert result["recommendation"] == "approve"
    assert result["flagged_rules"] == []


def test_single_weak_weighted_signal_stays_below_review_threshold():
    """Um único sinal de baixo peso não deveria empurrar sozinho para revisão manual."""
    signals = [_signal("registry", "hit", 1.0)]

    result = assess_signals(signals, RULESET)

    # score = (0.3 * 1.0) / (0.3 + 0.3 + 0.9) = 0.2 -> abaixo de manual_review_threshold (0.35)
    assert result["recommendation"] == "approve"
    assert result["flagged_rules"] == ["registry"]


def test_high_weight_signal_at_partial_intensity_triggers_manual_review():
    """
    Sinal de mídia (peso alto) com intensidade parcial (2 de 3 artigos
    corroborantes, ver test_media_check.py) já é suficiente para cruzar o
    limiar de revisão manual, mesmo sem nenhum veto.
    """
    signals = [_signal("media_fraud_mention", "hit", 2 / 3)]

    result = assess_signals(signals, RULESET)

    # score = (0.9 * 0.6667) / 1.5 = 0.4 -> entre manual_review (0.35) e reject (0.7)
    assert result["recommendation"] == "manual_review"
    assert 0.35 <= result["score"] < 0.7


def test_multiple_weighted_signals_at_full_intensity_trigger_reject():
    signals = [
        _signal("registry", "hit", 1.0),
        _signal("court_records", "hit", 1.0),
        _signal("media_fraud_mention", "hit", 1.0),
    ]

    result = assess_signals(signals, RULESET)

    assert result["score"] == 1.0
    assert result["recommendation"] == "reject"
    assert set(result["flagged_rules"]) == {"registry", "court_records", "media_fraud_mention"}


def test_unavailable_signal_is_not_counted_as_evidence():
    """
    Uma fonte que falhou ('unavailable', não 'hit'/'no_hit') não deveria
    contribuir para o score como se fosse uma resposta positiva — uma fonte
    fora do ar não é evidência de risco.
    """
    signals = [_signal("registry", "unavailable", 0.0)]

    result = assess_signals(signals, RULESET)

    assert result["score"] == 0.0
    assert result["flagged_rules"] == []


def test_load_ruleset_from_yaml(tmp_path):
    """
    Teste de integração leve: carrega o YAML de exemplo real do repositório
    e confere que a estrutura é interpretada corretamente — sem isso, um
    erro de digitação no YAML só seria descoberto rodando o pipeline
    inteiro.
    """
    config_path = tmp_path / "rules.yaml"
    config_path.write_text(
        """
rule_version: "v1"
veto_signals:
  - signal_id: sanctions_list
    status: hit
    reason: "sanção ativa"
weighted_signals:
  - signal_id: registry
    weight: 0.5
thresholds:
  reject: 0.8
  manual_review: 0.4
""",
        encoding="utf-8",
    )

    ruleset = load_ruleset(str(config_path))

    assert ruleset.rule_version == "v1"
    assert ruleset.veto_signals[0].signal_id == "sanctions_list"
    assert ruleset.weighted_signals[0].weight == 0.5
    assert ruleset.reject_threshold == 0.8


def test_example_yaml_config_loads_and_produces_sane_thresholds():
    """
    Garante que o arquivo `rules_config.example.yaml` versionado no
    repositório continua válido — evita o cenário de um exemplo de
    documentação quebrar silenciosamente depois de uma refatoração.
    """
    ruleset = load_ruleset("rules_config.example.yaml")

    assert 0 < ruleset.manual_review_threshold < ruleset.reject_threshold <= 1
    assert len(ruleset.weighted_signals) > 0
