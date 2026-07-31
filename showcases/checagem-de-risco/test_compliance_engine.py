"""Testes de compliance_engine.py — todos com pytest puro, sem PySpark."""

from bureau_client import BureauRecord
from compliance_engine import (
    KYC_RULES,
    KYE_RULES,
    KYS_RULES,
    avaliar_regras,
)
from media_check_categories import avaliar_media_check


def _registro_limpo(**overrides) -> BureauRecord:
    """Uma contraparte PJ sem nenhum achado — cada teste sobrescreve só o
    que quer variar."""
    base = dict(
        documento="12345678000199",
        tipo_documento="PJ",
        nome="Fornecedor Exemplo LTDA",
        encontrado=True,
        situacao_cadastral="ATIVA",
        tempo_atividade_meses=48,
        quantidade_socios=2,
        possui_sancao_ativa=False,
        processos_civeis=0,
        processos_criminais=0,
        processos_trabalhistas=0,
        mandados_prisao_ativos=0,
        protestos=0,
        cheques_sem_fundo=0,
        divida_ativa=0.0,
        capital_social_ou_renda_mensal=20000.0,
        faturamento_estimado_anual=500000.0,
        score_externo_bureau=750.0,
        setor_atividade="TECNOLOGIA",
    )
    base.update(overrides)
    return BureauRecord(**base)


def _sem_media(conjunto) -> tuple:
    return avaliar_media_check({}, category_ids=conjunto.categorias_media)


def test_kys_tem_escopo_de_midia_completo_as_6_categorias():
    assert len(KYS_RULES.categorias_media) == 6


def test_kys_contraparte_limpa_e_aprovada():
    record = _registro_limpo()
    resultado = avaliar_regras(KYS_RULES, record, _sem_media(KYS_RULES))
    assert resultado.veto is False
    assert resultado.recommendation == "approve"
    assert resultado.flagged_rules == ()


def test_kys_sancao_ativa_e_veto_independente_do_resto():
    record = _registro_limpo(possui_sancao_ativa=True)
    resultado = avaliar_regras(KYS_RULES, record, _sem_media(KYS_RULES))
    assert resultado.veto is True
    assert resultado.recommendation == "reject"
    assert "sancao_ativa" in resultado.flagged_rules


def test_kys_nao_roda_modelos_de_credito():
    record = _registro_limpo()
    resultado = avaliar_regras(KYS_RULES, record, _sem_media(KYS_RULES))
    assert resultado.analise_credito is None


def test_kys_midia_lavagem_dinheiro_corroborada_e_veto():
    record = _registro_limpo()
    media = avaliar_media_check(
        {"lavagem_dinheiro_crimes_financeiros": 3}, category_ids=KYS_RULES.categorias_media
    )
    resultado = avaliar_regras(KYS_RULES, record, media)
    assert resultado.veto is True
    assert "media_lavagem_dinheiro_crimes_financeiros" in resultado.flagged_rules


def test_kye_escopo_de_midia_nao_inclui_sancoes_internacionais():
    """Não faz sentido rodar OFAC/sanção internacional contra um candidato
    a colaborador pessoa física."""
    assert "sancoes_regulatorio_restricoes" not in KYE_RULES.categorias_media


def test_kye_mandado_de_prisao_e_veto():
    record = _registro_limpo(tipo_documento="PF", mandados_prisao_ativos=1)
    resultado = avaliar_regras(KYE_RULES, record, _sem_media(KYE_RULES))
    assert resultado.veto is True
    assert "mandado_prisao_ativo" in resultado.flagged_rules


def test_kye_processos_trabalhistas_recorrentes_contribui_para_score():
    record = _registro_limpo(tipo_documento="PF", processos_trabalhistas=4)
    resultado = avaliar_regras(KYE_RULES, record, _sem_media(KYE_RULES))
    assert resultado.veto is False
    assert "processos_trabalhistas_recorrentes" in resultado.flagged_rules
    assert resultado.score > 0


def test_kye_nao_roda_modelos_de_credito():
    record = _registro_limpo(tipo_documento="PF")
    resultado = avaliar_regras(KYE_RULES, record, _sem_media(KYE_RULES))
    assert resultado.analise_credito is None


def test_kyc_roda_modelos_de_credito():
    record = _registro_limpo()
    resultado = avaliar_regras(KYC_RULES, record, _sem_media(KYC_RULES))
    assert resultado.analise_credito is not None
    assert len(resultado.analise_credito.modelos) == 4


def test_kyc_contraparte_limpa_com_credito_bom_e_aprovada():
    record = _registro_limpo()
    resultado = avaliar_regras(KYC_RULES, record, _sem_media(KYC_RULES))
    assert resultado.recommendation == "approve"


def test_kyc_credito_critico_rejeita_mesmo_sem_achado_de_compliance():
    """Risco de crédito extremo (score de crédito isolado acima do
    limiar) rejeita sozinho, mesmo com compliance limpo e o score
    combinado (que pesa crédito só 60%) ficando abaixo do limiar geral de
    rejeição — mesma lógica de um veto de compliance, aplicada ao lado
    de crédito."""
    record = _registro_limpo(
        faturamento_estimado_anual=0.0,
        capital_social_ou_renda_mensal=0.0,
        protestos=10,
        cheques_sem_fundo=5,
        tempo_atividade_meses=0,
        quantidade_socios=0,
        setor_atividade="CONSTRUCAO_CIVIL",
    )
    resultado = avaliar_regras(KYC_RULES, record, _sem_media(KYC_RULES))
    assert resultado.veto is False
    assert resultado.analise_credito.score_credito_final >= 0.85
    assert resultado.score < 0.66  # score combinado sozinho não bateria o limiar geral
    assert resultado.recommendation == "reject"  # mas o limiar de crédito crítico, sim


def test_kyc_sancao_ativa_ainda_e_veto_apesar_do_credito_bom():
    record = _registro_limpo(possui_sancao_ativa=True)
    resultado = avaliar_regras(KYC_RULES, record, _sem_media(KYC_RULES))
    assert resultado.veto is True
    assert resultado.recommendation == "reject"


def test_campos_para_analise_reflete_so_os_campos_usados_pelas_regras():
    record = _registro_limpo()
    resultado = avaliar_regras(KYE_RULES, record, _sem_media(KYE_RULES))
    assert "mandados_prisao_ativos" in resultado.campos_para_analise
    assert "processos_trabalhistas" in resultado.campos_para_analise
    # campo usado só pelas regras do KYS, não deveria vir na análise da KYE
    assert "quantidade_socios" not in resultado.campos_para_analise


def test_rule_outcomes_documenta_todas_as_regras_avaliadas_nao_so_as_disparadas():
    record = _registro_limpo()
    resultado = avaliar_regras(KYS_RULES, record, _sem_media(KYS_RULES))
    assert len(resultado.rule_outcomes) == len(KYS_RULES.regras)
    assert all(o.disparada is False for o in resultado.rule_outcomes)
