"""Testes de credit_models.py — todos com pytest puro, sem PySpark."""

from bureau_client import BureauRecord
from credit_models import (
    modelo_capacidade_pagamento,
    modelo_comportamento_pagamento,
    modelo_concentracao_setorial,
    modelo_estabilidade_cadastral,
    run_credit_models,
)


def _registro_base(**overrides) -> BureauRecord:
    """Um PJ saudável por default — cada teste sobrescreve só o campo que
    quer variar."""
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


def test_modelo_capacidade_pagamento_sem_receita_e_pior_caso():
    record = _registro_base(faturamento_estimado_anual=0.0, capital_social_ou_renda_mensal=0.0)
    resultado = modelo_capacidade_pagamento(record)
    assert resultado.score_risco == 1.0


def test_modelo_capacidade_pagamento_endividamento_proporcional():
    record = _registro_base(faturamento_estimado_anual=100_000.0, capital_social_ou_renda_mensal=0.0, divida_ativa=50_000.0)
    resultado = modelo_capacidade_pagamento(record)
    assert resultado.score_risco == 0.5


def test_modelo_capacidade_pagamento_satura_em_1_quando_divida_excede_receita():
    record = _registro_base(faturamento_estimado_anual=100_000.0, capital_social_ou_renda_mensal=0.0, divida_ativa=300_000.0)
    resultado = modelo_capacidade_pagamento(record)
    assert resultado.score_risco == 1.0


def test_modelo_comportamento_pagamento_sem_restritivos():
    record = _registro_base(protestos=0, cheques_sem_fundo=0)
    resultado = modelo_comportamento_pagamento(record)
    assert resultado.score_risco == 0.0


def test_modelo_comportamento_pagamento_satura_no_teto():
    record = _registro_base(protestos=5, cheques_sem_fundo=2)
    resultado = modelo_comportamento_pagamento(record)
    assert resultado.score_risco == 1.0


def test_modelo_comportamento_pagamento_um_restritivo_pesa_menos_que_o_teto():
    record = _registro_base(protestos=1, cheques_sem_fundo=0)
    resultado = modelo_comportamento_pagamento(record)
    assert 0 < resultado.score_risco < 1.0


def test_modelo_estabilidade_cadastral_empresa_madura_com_socios_risco_baixo():
    record = _registro_base(tempo_atividade_meses=48, quantidade_socios=2)
    resultado = modelo_estabilidade_cadastral(record)
    assert resultado.score_risco == 0.0


def test_modelo_estabilidade_cadastral_empresa_recente_sem_socios_risco_alto():
    record = _registro_base(tempo_atividade_meses=0, quantidade_socios=0)
    resultado = modelo_estabilidade_cadastral(record)
    assert resultado.score_risco == 1.0


def test_modelo_estabilidade_cadastral_pf_nao_penalizada_por_quantidade_socios():
    """quantidade_socios só entra na conta para PJ — o conceito não existe
    para PF."""
    record = _registro_base(tipo_documento="PF", tempo_atividade_meses=48, quantidade_socios=0)
    resultado = modelo_estabilidade_cadastral(record)
    assert resultado.score_risco == 0.0


def test_modelo_concentracao_setorial_usa_tabela_de_risco_base():
    record = _registro_base(setor_atividade="CONSTRUCAO_CIVIL")
    resultado = modelo_concentracao_setorial(record)
    assert resultado.score_risco == 0.6


def test_modelo_concentracao_setorial_setor_desconhecido_e_risco_medio():
    record = _registro_base(setor_atividade="SETOR_INEXISTENTE")
    resultado = modelo_concentracao_setorial(record)
    assert resultado.score_risco == 0.5


def test_run_credit_models_roda_os_4_modelos():
    record = _registro_base()
    analise = run_credit_models(record)
    assert len(analise.modelos) == 4
    nomes = {m.nome for m in analise.modelos}
    assert nomes == {
        "capacidade_pagamento",
        "comportamento_pagamento",
        "estabilidade_cadastral",
        "concentracao_setorial",
    }


def test_run_credit_models_score_final_e_media_ponderada():
    record = _registro_base()
    analise = run_credit_models(record)
    esperado = sum(m.score_risco * 0.35 if m.nome in ("capacidade_pagamento", "comportamento_pagamento")
                    else m.score_risco * 0.15 for m in analise.modelos)
    assert round(analise.score_credito_final, 4) == round(esperado, 4)


def test_run_credit_models_contraparte_de_risco_maximo_aproxima_score_1():
    record = _registro_base(
        faturamento_estimado_anual=0.0,
        capital_social_ou_renda_mensal=0.0,
        protestos=10,
        cheques_sem_fundo=5,
        tempo_atividade_meses=0,
        quantidade_socios=0,
        setor_atividade="CONSTRUCAO_CIVIL",
    )
    analise = run_credit_models(record)
    assert analise.score_credito_final > 0.9
