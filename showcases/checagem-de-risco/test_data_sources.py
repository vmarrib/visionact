"""Testes da camada de fontes de dados (REST + MCP) e do merge com
procedência. pytest puro, sem rede e sem PySpark."""

from __future__ import annotations

import json

import pytest

from data_sources import (
    MCP_HTTP_HEADERS,
    McpToolSource,
    RestBureauSource,
    coletar_de_fontes,
    extrair_conteudo_mcp,
    merge_records,
)


def _envelope_texto(payload: dict) -> dict:
    return {"jsonrpc": "2.0", "id": "1", "result": {"content": [{"type": "text", "text": json.dumps(payload)}]}}


def test_rest_source_traduz_campos_do_fornecedor():
    chamadas = []

    def transport(url, payload):
        chamadas.append(url)
        return {"cad_situacao": "ATIVA", "qtd_processos_crime": 2, "campo_irrelevante": 1}

    fonte = RestBureauSource(
        nome="bureau_a",
        base_url="https://bureau.invalid/v1",
        transport=transport,
        field_map={"cad_situacao": "situacao_cadastral", "qtd_processos_crime": "processos_criminais"},
    )

    assert fonte.fetch("12345678000199") == {"situacao_cadastral": "ATIVA", "processos_criminais": 2}
    assert chamadas == ["https://bureau.invalid/v1/documentos/12345678000199"]


def test_mcp_source_monta_tools_call_com_headers_obrigatorios():
    capturado = {}

    def transport(url, payload):
        capturado["url"] = url
        capturado["payload"] = payload
        return _envelope_texto({"possui_sancao_ativa": True})

    fonte = McpToolSource(
        nome="mcp_sancoes",
        server_url="https://mcp.invalid/mcp",
        tool_name="consultar_sancoes",
        transport=transport,
        field_map={"possui_sancao_ativa": "possui_sancao_ativa"},
    )

    assert fonte.fetch("12345678000199") == {"possui_sancao_ativa": True}
    assert capturado["payload"]["method"] == "tools/call"
    assert capturado["payload"]["params"]["name"] == "consultar_sancoes"
    assert capturado["payload"]["params"]["arguments"] == {"documento": "12345678000199"}
    # sem os dois tipos no Accept, um servidor MCP oficial responde 406
    assert capturado["payload"]["_headers"] == MCP_HTTP_HEADERS


def test_mcp_structured_content_tem_precedencia_sobre_bloco_de_texto():
    envelope = {
        "result": {
            "structuredContent": {"divida_ativa": 1000.0},
            "content": [{"type": "text", "text": json.dumps({"divida_ativa": 9999.0})}],
        }
    }
    assert extrair_conteudo_mcp(envelope) == {"divida_ativa": 1000.0}


def test_mcp_erro_jsonrpc_vira_excecao_em_vez_de_registro_vazio():
    with pytest.raises(RuntimeError):
        extrair_conteudo_mcp({"error": {"code": -32000, "message": "rate limited"}})


def test_mcp_is_error_tambem_falha():
    with pytest.raises(RuntimeError):
        extrair_conteudo_mcp({"result": {"isError": True, "content": []}})


def test_merge_respeita_precedencia_e_registra_procedencia():
    merged = merge_records(
        "12345678000199",
        "PJ",
        [
            ("bureau_principal", {"situacao_cadastral": "ATIVA", "processos_criminais": 0}),
            ("mcp_judicial", {"situacao_cadastral": "SUSPENSA", "processos_criminais": 3, "protestos": 2}),
        ],
    )

    # a primeira fonte vence no campo em que ambas responderam
    assert merged.record.situacao_cadastral == "ATIVA"
    assert merged.record.processos_criminais == 0
    # e o campo exclusivo da segunda fonte entra normalmente
    assert merged.record.protestos == 2
    assert merged.field_provenance["situacao_cadastral"] == "bureau_principal"
    assert merged.field_provenance["protestos"] == "mcp_judicial"


def test_merge_sem_nenhuma_fonte_nao_finge_situacao_regular():
    merged = merge_records("12345678000199", "PJ", [])
    # DESCONHECIDA dispara a regra de situação cadastral irregular, que é o
    # comportamento correto: ausência de dado não é ausência de risco
    assert merged.record.situacao_cadastral == "DESCONHECIDA"
    assert merged.record.encontrado is False


class _FonteQueFalha:
    nome = "mcp_instavel"

    def fetch(self, documento: str) -> dict:
        raise ConnectionError("timeout")


class _FonteOk:
    nome = "bureau_ok"

    def fetch(self, documento: str) -> dict:
        return {"divida_ativa": 500.0}


def test_falha_de_uma_fonte_nao_derruba_a_analise():
    merged = coletar_de_fontes("12345678000199", "PJ", [_FonteQueFalha(), _FonteOk()])
    assert merged.record.divida_ativa == 500.0
    assert merged.fontes_com_falha == ("mcp_instavel",)
    assert merged.fontes_consultadas == ("mcp_instavel", "bureau_ok")
