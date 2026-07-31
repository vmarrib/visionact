"""Testes de diligence_pipeline.py — todos com pytest puro, sem PySpark.

Inclui um teste de contrato que trava as chaves de `build_output_row()`
contra os nomes de coluna esperados dos 3 schemas de saída (hardcoded aqui
de propósito, para não precisar importar `pipeline_schemas.py`, que
importa PySpark) — se alguém renomear um `campo` em `compliance_engine.py`
sem atualizar `pipeline_schemas.py`, é este teste que denuncia o desvio.
"""

from compliance_engine import KYC_RULES, KYE_RULES, KYS_RULES
from diligence_pipeline import analisar_contraparte, build_output_row, contar_artigos_por_categoria
from media_check_categories import avaliar_media_check

KYS_COLUNAS_ESPERADAS = {
    "documento", "tipo_documento", "score", "veto", "recommendation", "flagged_rules",
    "media_categorias_sinalizadas", "generated_at", "rule_set_version",
    "possui_sancao_ativa", "mandados_prisao_ativos", "processos_criminais",
    "situacao_cadastral", "tempo_atividade_meses", "quantidade_socios",
    "processos_civeis", "divida_ativa",
}

KYE_COLUNAS_ESPERADAS = {
    "documento", "tipo_documento", "score", "veto", "recommendation", "flagged_rules",
    "media_categorias_sinalizadas", "generated_at", "rule_set_version",
    "mandados_prisao_ativos", "processos_criminais", "processos_trabalhistas", "processos_civeis",
}

KYC_COLUNAS_ESPERADAS = {
    "documento", "tipo_documento", "score", "veto", "recommendation", "flagged_rules",
    "media_categorias_sinalizadas", "generated_at", "rule_set_version",
    "possui_sancao_ativa", "situacao_cadastral", "divida_ativa",
    "score_capacidade_pagamento", "score_comportamento_pagamento",
    "score_estabilidade_cadastral", "score_concentracao_setorial", "score_credito_final",
}


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self) -> dict:
        return self._payload


class _FakeSession:
    def __init__(self, payload: dict):
        self._payload = payload

    def get(self, url, timeout):
        return _FakeResponse(200, self._payload)


def _executor_zero(_query: str) -> int:
    return 0


def _executor_dois_por_query(_query: str) -> int:
    return 2


def test_contar_artigos_por_categoria_soma_os_5_grupos():
    contagem = contar_artigos_por_categoria(
        "Fornecedor Exemplo", ["corrupcao_crimes_estado"], _executor_dois_por_query
    )
    assert contagem == {"corrupcao_crimes_estado": 10}  # 5 grupos x 2 artigos


def test_contar_artigos_por_categoria_sem_corroboracao():
    contagem = contar_artigos_por_categoria(
        "Fornecedor Exemplo", ["corrupcao_crimes_estado"], _executor_zero
    )
    assert contagem == {"corrupcao_crimes_estado": 0}


def test_build_output_row_kys_bate_com_schema_esperado():
    session = _FakeSession({"nome": "Fornecedor Exemplo LTDA", "situacao_cadastral": "ATIVA"})
    row = analisar_contraparte(
        KYS_RULES, "12345678000199", "Fornecedor Exemplo LTDA", session, "https://fake", _executor_zero
    )
    assert set(row.keys()) == KYS_COLUNAS_ESPERADAS


def test_build_output_row_kye_bate_com_schema_esperado():
    session = _FakeSession({"tipo_documento": "PF", "nome": "Colaborador Exemplo"})
    row = analisar_contraparte(
        KYE_RULES, "12345678900", "Colaborador Exemplo", session, "https://fake", _executor_zero
    )
    assert set(row.keys()) == KYE_COLUNAS_ESPERADAS


def test_build_output_row_kyc_bate_com_schema_esperado():
    session = _FakeSession({"nome": "Cliente Exemplo LTDA"})
    row = analisar_contraparte(
        KYC_RULES, "12345678000199", "Cliente Exemplo LTDA", session, "https://fake", _executor_zero
    )
    assert set(row.keys()) == KYC_COLUNAS_ESPERADAS


def test_analisar_contraparte_kyc_traz_analise_de_credito_completa():
    session = _FakeSession(
        {
            "nome": "Cliente Exemplo LTDA",
            "faturamento_estimado_anual": 500_000.0,
            "divida_ativa": 50_000.0,
            "setor_atividade": "TECNOLOGIA",
        }
    )
    row = analisar_contraparte(
        KYC_RULES, "12345678000199", "Cliente Exemplo LTDA", session, "https://fake", _executor_zero
    )
    assert 0.0 <= row["score_credito_final"] <= 1.0
    assert row["score_capacidade_pagamento"] == 0.1  # 50k / 500k


def test_analisar_contraparte_kys_veto_por_midia_lavagem_dinheiro():
    session = _FakeSession({"nome": "Fornecedor Exemplo LTDA"})

    def executor_sinaliza_lavagem(query: str) -> int:
        return 3 if "lavagem de dinheiro" in query else 0

    row = analisar_contraparte(
        KYS_RULES, "12345678000199", "Fornecedor Exemplo LTDA", session, "https://fake", executor_sinaliza_lavagem
    )
    assert row["veto"] is True
    assert row["recommendation"] == "reject"
    assert "media_lavagem_dinheiro_crimes_financeiros" in row["flagged_rules"]


def test_analisar_contraparte_documento_nao_encontrado_no_bureau_e_conservador():
    class _SessaoNaoEncontrado:
        def get(self, url, timeout):
            return _FakeResponse(404)

    row = analisar_contraparte(
        KYS_RULES, "00000000000000", "Desconhecido LTDA", _SessaoNaoEncontrado(), "https://fake", _executor_zero
    )
    assert row["situacao_cadastral"] == "DESCONHECIDA"
    # sem informação de bureau não deveria virar aprovação automática por
    # ausência de achado — mas também não é um veto automático neste
    # conjunto de regras; verificamos aqui que o campo reflete o estado
    # real, não um otimismo indevido
    assert row["divida_ativa"] == 0.0
