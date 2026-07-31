"""Testes de media_check_categories.py — todos com pytest puro, sem PySpark."""

import pytest

from media_check_categories import (
    MEDIA_CATEGORIES,
    avaliar_media_check,
    build_media_search_queries,
    calcular_intensidade,
    get_category,
)


def test_taxonomia_tem_6_categorias():
    assert len(MEDIA_CATEGORIES) == 6


def test_cada_categoria_tem_5_grupos_de_busca():
    for categoria in MEDIA_CATEGORIES:
        assert len(categoria.grupos_busca) == 5


def test_categorias_de_alerta_maximo():
    """Sanções internacionais, lavagem de dinheiro e crime organizado são
    as categorias de maior severidade — usadas para veto automático no
    motor de compliance, não só score ponderado."""
    ids_alerta_maximo = {cat.id for cat in MEDIA_CATEGORIES if cat.alerta_maximo}
    assert ids_alerta_maximo == {
        "lavagem_dinheiro_crimes_financeiros",
        "sancoes_regulatorio_restricoes",
        "crime_organizado_faccoes",
    }


def test_get_category_desconhecida_levanta_erro():
    with pytest.raises(KeyError):
        get_category("categoria_que_nao_existe")


def test_build_media_search_queries_taxonomia_inteira():
    queries = build_media_search_queries("Fornecedor Exemplo LTDA")
    assert len(queries) == 6 * 5
    assert all("Fornecedor Exemplo LTDA" in q.query for q in queries)


def test_build_media_search_queries_escopo_restrito():
    queries = build_media_search_queries(
        "Colaborador Exemplo", category_ids=["envolvimento_criminal_violencia"]
    )
    assert len(queries) == 5
    assert all(q.category_id == "envolvimento_criminal_violencia" for q in queries)


def test_build_media_search_queries_termos_em_or():
    queries = build_media_search_queries("Empresa X", category_ids=["corrupcao_crimes_estado"])
    primeira_query = queries[0].query
    assert '"corrupção"' in primeira_query
    assert " OR " in primeira_query


def test_calcular_intensidade_zero_artigos():
    assert calcular_intensidade(0) == 0.0


def test_calcular_intensidade_um_artigo_pesa_menos_que_o_teto():
    assert 0 < calcular_intensidade(1) < 1.0


def test_calcular_intensidade_satura_no_teto():
    assert calcular_intensidade(3) == 1.0
    assert calcular_intensidade(10) == 1.0


def test_avaliar_media_check_categoria_nao_mencionada_fica_zerada():
    resultados = avaliar_media_check({}, category_ids=["envolvimento_criminal_violencia"])
    assert len(resultados) == 1
    assert resultados[0].artigos_corroborantes == 0
    assert resultados[0].sinalizado is False


def test_avaliar_media_check_sinaliza_categoria_com_corroboracao():
    resultados = avaliar_media_check(
        {"crime_organizado_faccoes": 2}, category_ids=["crime_organizado_faccoes", "envolvimento_criminal_violencia"]
    )
    por_id = {r.category_id: r for r in resultados}
    assert por_id["crime_organizado_faccoes"].sinalizado is True
    assert por_id["crime_organizado_faccoes"].alerta_maximo is True
    assert por_id["envolvimento_criminal_violencia"].sinalizado is False
