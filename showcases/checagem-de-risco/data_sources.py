"""
Checagem de Risco e Crédito, camada de fontes de dados: REST e MCP.

O motor de regras (`compliance_engine.py`) não sabe de onde vem o dado. Ele
consome um `BureauRecord` normalizado. Este módulo é o que produz esse
registro a partir de fontes heterogêneas:

- `RestBureauSource`: bureau cadastral/creditício tradicional, HTTP + JSON.
- `McpToolSource`: servidor MCP (Model Context Protocol) que expõe consultas
  de risco como ferramentas (`tools/call`). Vários provedores de dados já
  publicam servidores MCP, e a vantagem prática é que a descoberta do
  contrato é feita em runtime (`tools/list`), sem um SDK por fornecedor.

Por que uma camada de fonte e não chamar a API direto na regra:

1. Regras de compliance precisam sobreviver à troca de fornecedor. O
   contrato estável é o `BureauRecord`, não o payload do fornecedor.
2. Em due diligence é comum ter mais de uma fonte para o mesmo campo
   (um bureau tem processo judicial, outro tem situação cadastral melhor
   atualizada). `merge_records` resolve isso com precedência declarada por
   campo, e registra a procedência de cada valor (`field_provenance`) para
   a decisão continuar auditável.
3. Sem procedência, "por que essa contraparte foi reprovada" só é
   respondível olhando log de rede. Com procedência, a resposta é uma
   coluna da tabela de saída.

Nenhuma chamada de rede real acontece aqui: cada fonte recebe um
`transport` injetável (`Callable[[str, dict], dict]`), o que mantém o
módulo testável com `pytest` puro, sem mock de HTTP e sem PySpark.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, fields, replace
from typing import Any, Callable, Protocol, Sequence

from bureau_client import BureauRecord

# Transporte injetável: (url, payload JSON) -> resposta JSON já desserializada.
Transport = Callable[[str, dict], dict]

# Cabeçalhos exigidos pelo MCP Streamable HTTP. Servidores construídos com o
# SDK oficial respondem 406 Not Acceptable sem os dois tipos no Accept, um
# erro que na prática parece "o servidor está fora do ar".
MCP_HTTP_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}

# Campos do BureauRecord que nunca vêm de merge: identificam a contraparte.
CAMPOS_IDENTIDADE = ("documento", "tipo_documento")


class RiskDataSource(Protocol):
    """Contrato mínimo de qualquer fonte de dados de risco."""

    nome: str

    def fetch(self, documento: str) -> dict:
        """Devolve um dicionário parcial no vocabulário do BureauRecord."""
        ...


@dataclass(frozen=True)
class RestBureauSource:
    """Bureau tradicional exposto por HTTP + JSON."""

    nome: str
    base_url: str
    transport: Transport
    field_map: dict[str, str] | None = None

    def fetch(self, documento: str) -> dict:
        payload = self.transport(f"{self.base_url}/documentos/{documento}", {})
        return _aplicar_field_map(payload, self.field_map)


@dataclass(frozen=True)
class McpToolSource:
    """Provedor de dados exposto como servidor MCP.

    A chamada é um JSON-RPC `tools/call` no endpoint Streamable HTTP. O
    resultado do MCP vem como uma lista de blocos de conteúdo; o bloco de
    texto normalmente carrega o JSON útil, então ele é desserializado antes
    de entrar no field_map.
    """

    nome: str
    server_url: str
    tool_name: str
    transport: Transport
    field_map: dict[str, str] | None = None
    argumento_documento: str = "documento"

    def fetch(self, documento: str) -> dict:
        envelope = self.transport(
            self.server_url,
            {
                "jsonrpc": "2.0",
                "id": f"{self.nome}:{documento}",
                "method": "tools/call",
                "params": {
                    "name": self.tool_name,
                    "arguments": {self.argumento_documento: documento},
                },
                "_headers": MCP_HTTP_HEADERS,
            },
        )
        return _aplicar_field_map(extrair_conteudo_mcp(envelope), self.field_map)


def extrair_conteudo_mcp(envelope: dict) -> dict:
    """Extrai o payload útil de uma resposta MCP `tools/call`.

    Um erro JSON-RPC vira exceção: é melhor a partição falhar e o retry do
    pipeline agir do que gravar um registro vazio como se fosse "contraparte
    sem achados", que é a leitura errada e otimista do silêncio.
    """
    if "error" in envelope:
        erro = envelope["error"]
        raise RuntimeError(f"MCP retornou erro {erro.get('code')}: {erro.get('message')}")

    resultado = envelope.get("result", {})
    if resultado.get("isError"):
        raise RuntimeError("MCP marcou o resultado da ferramenta como erro")

    structured = resultado.get("structuredContent")
    if isinstance(structured, dict):
        return structured

    for bloco in resultado.get("content", []):
        if bloco.get("type") == "text":
            try:
                dados = json.loads(bloco["text"])
            except (ValueError, KeyError):
                continue
            if isinstance(dados, dict):
                return dados
    return {}


def _aplicar_field_map(payload: dict, field_map: dict[str, str] | None) -> dict:
    """Traduz nomes de campo do fornecedor para o vocabulário do
    BureauRecord, descartando o que a fonte devolve e o modelo não usa."""
    if field_map is None:
        return {k: v for k, v in payload.items() if k in _CAMPOS_BUREAU}
    traduzido = {}
    for origem, destino in field_map.items():
        if origem in payload and destino in _CAMPOS_BUREAU:
            traduzido[destino] = payload[origem]
    return traduzido


_CAMPOS_BUREAU = {f.name for f in fields(BureauRecord)}


@dataclass(frozen=True)
class MergedRecord:
    record: BureauRecord
    field_provenance: dict[str, str]
    fontes_consultadas: tuple[str, ...]
    fontes_com_falha: tuple[str, ...]


def merge_records(
    documento: str,
    tipo_documento: str,
    resultados: Sequence[tuple[str, dict]],
    base: BureauRecord | None = None,
) -> MergedRecord:
    """Combina respostas parciais de várias fontes num único BureauRecord.

    Precedência: a primeira fonte da lista que trouxer um valor não nulo
    para um campo vence. A ordem de `resultados` é, portanto, a política de
    confiança por fornecedor, declarada no ponto de configuração do pipeline
    e não escondida dentro de um if.
    """
    valores: dict[str, Any] = {}
    provenance: dict[str, str] = {}

    for fonte, payload in resultados:
        for campo, valor in payload.items():
            if campo in CAMPOS_IDENTIDADE or valor is None or campo in valores:
                continue
            valores[campo] = valor
            provenance[campo] = fonte

    ponto_de_partida = base or _record_vazio(documento, tipo_documento)
    record = replace(ponto_de_partida, **valores)
    return MergedRecord(
        record=record,
        field_provenance=provenance,
        fontes_consultadas=tuple(fonte for fonte, _ in resultados),
        fontes_com_falha=tuple(fonte for fonte, payload in resultados if not payload),
    )


def _record_vazio(documento: str, tipo_documento: str) -> BureauRecord:
    """Registro neutro usado como base do merge.

    Numéricos vão a zero e situação cadastral fica desconhecida em vez de
    ATIVA: a regra `situacao_cadastral_irregular` deve disparar quando
    nenhuma fonte respondeu, não passar batido.
    """
    defaults: dict[str, Any] = {}
    for f in fields(BureauRecord):
        if f.name == "documento":
            defaults[f.name] = documento
        elif f.name == "tipo_documento":
            defaults[f.name] = tipo_documento
        elif f.name == "nome":
            defaults[f.name] = ""
        elif f.name == "setor_atividade":
            defaults[f.name] = "NAO_INFORMADO"
        elif f.type in ("int", "int | None"):
            defaults[f.name] = 0
        elif f.type in ("float", "float | None"):
            defaults[f.name] = 0.0
        elif f.type in ("bool", "bool | None"):
            defaults[f.name] = False
        else:
            defaults[f.name] = "DESCONHECIDA"
    return BureauRecord(**defaults)


def coletar_de_fontes(
    documento: str,
    tipo_documento: str,
    fontes: Sequence[RiskDataSource],
) -> MergedRecord:
    """Consulta as fontes em ordem de precedência e devolve o registro
    combinado. Uma fonte que falha não derruba a análise: entra em
    `fontes_com_falha` e as demais continuam, porque perder um enriquecimento
    opcional é diferente de perder a análise inteira."""
    resultados: list[tuple[str, dict]] = []
    for fonte in fontes:
        try:
            resultados.append((fonte.nome, fonte.fetch(documento)))
        except Exception:  # noqa: BLE001 - a falha da fonte é dado, não crash
            resultados.append((fonte.nome, {}))
    return merge_records(documento, tipo_documento, resultados)
