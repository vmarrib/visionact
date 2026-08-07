"""Testes da camada de carga ERP/CRM: contrato de campos, idempotência por
hash e métricas de compliance."""

from __future__ import annotations

from datetime import datetime, timezone

from erp_crm_load import (
    build_enrichment_batch,
    calcular_payload_hash,
    faixa_de_risco,
    resumir_metricas,
    selecionar_deltas,
    to_enrichment_record,
)


def _row_kyc(documento="12345678000199", score=0.2, recommendation="approve", **extra):
    row = {
        "documento": documento,
        "tipo_documento": "PJ",
        "score": score,
        "veto": False,
        "recommendation": recommendation,
        "flagged_rules": [],
        "media_categorias_sinalizadas": [],
        "score_credito_final": 0.3,
        "generated_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "rule_set_version": "1.0.0",
    }
    row.update(extra)
    return row


def test_projeta_campos_de_negocio_e_status_legivel():
    rec = to_enrichment_record("kyc", _row_kyc(recommendation="reject", score=0.9))
    assert rec.chave == "12345678000199"
    assert rec.atributos["risco_status"] == "BLOQUEADO"
    assert rec.atributos["risco_faixa"] == "ALTO"
    assert rec.atributos["risco_origem_analise"] == "kyc"
    assert rec.atributos["risco_score_credito"] == 0.3


def test_kys_sem_credito_omite_o_campo_em_vez_de_enviar_nulo():
    row = _row_kyc()
    del row["score_credito_final"]
    rec = to_enrichment_record("kys", row)
    # enviar null apagaria o valor gravado por uma análise de KYC anterior
    assert "risco_score_credito" not in rec.atributos


def test_faixas_de_risco():
    assert faixa_de_risco(0.0) == "BAIXO"
    assert faixa_de_risco(0.32) == "BAIXO"
    assert faixa_de_risco(0.33) == "MEDIO"
    assert faixa_de_risco(0.65) == "MEDIO"
    assert faixa_de_risco(0.66) == "ALTO"
    assert faixa_de_risco(1.0) == "ALTO"


def test_hash_ignora_timestamp_mas_reage_a_mudanca_de_dado():
    a = to_enrichment_record("kyc", _row_kyc())
    b = to_enrichment_record(
        "kyc", _row_kyc(generated_at=datetime(2026, 6, 1, tzinfo=timezone.utc))
    )
    assert a.payload_hash == b.payload_hash

    c = to_enrichment_record("kyc", _row_kyc(score=0.7, recommendation="reject"))
    assert c.payload_hash != a.payload_hash


def test_hash_independe_da_ordem_das_chaves():
    atributos = {"risco_score": 0.2, "risco_status": "LIBERADO"}
    invertido = {"risco_status": "LIBERADO", "risco_score": 0.2}
    assert calcular_payload_hash(atributos) == calcular_payload_hash(invertido)


def test_delta_zera_quando_nada_mudou():
    lote = build_enrichment_batch("kyc", [_row_kyc(), _row_kyc(documento="99999999000100")])
    ja_carregados = {f"kyc:{r.chave}": r.payload_hash for r in lote}
    assert selecionar_deltas(lote, ja_carregados) == ()


def test_delta_separa_rule_sets_da_mesma_contraparte():
    kyc = build_enrichment_batch("kyc", [_row_kyc()])
    ja_carregados = {f"kyc:{kyc[0].chave}": kyc[0].payload_hash}
    kys = build_enrichment_batch("kys", [_row_kyc()])
    # mesma contraparte como fornecedor: a carga do KYS não pode ser suprimida
    assert len(selecionar_deltas(kys, ja_carregados)) == 1


def test_metricas_da_carteira():
    rows = [
        _row_kyc(documento="1", recommendation="approve", score=0.1),
        _row_kyc(documento="2", recommendation="reject", score=0.9, veto=True, flagged_rules=["sancao_ativa"]),
        _row_kyc(
            documento="3",
            recommendation="manual_review",
            score=0.5,
            flagged_rules=["divida_ativa_registrada", "sancao_ativa"],
        ),
    ]
    m = resumir_metricas("kyc", rows)
    assert (m.total_contrapartes, m.aprovadas, m.em_revisao_manual, m.reprovadas) == (3, 1, 1, 1)
    assert m.com_veto == 1
    assert m.taxa_reprovacao == round(1 / 3, 4)
    assert m.score_medio == 0.5
    assert m.score_credito_medio == 0.3
    assert m.top_regras_sinalizadas[0] == ("sancao_ativa", 2)


def test_metricas_de_carteira_vazia_nao_divide_por_zero():
    m = resumir_metricas("kyc", [])
    assert m.total_contrapartes == 0
    assert m.taxa_reprovacao == 0.0
    assert m.score_credito_medio is None
