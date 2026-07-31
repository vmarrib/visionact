"""
Checagem de Risco — cliente do bureau de dados cadastrais/creditícios.

Este módulo modela **um** bureau de crédito/cadastro — o tipo de fonte que
devolve, para um único CNPJ ou CPF, um payload rico com dados cadastrais,
judiciais e financeiros. É esse payload que alimenta as 3 regras de
análise de risco (KYS/KYE/KYC) e os 4 modelos de crédito.

Como sempre neste showcase: nomes reais de bureau, endpoints, campos e
limiares de produção foram substituídos por um formato ilustrativo. A
separação lógica pura / integração Spark segue o mesmo padrão dos demais
módulos — só a função no final do arquivo importa PySpark, e só de forma
lazy (dentro da própria função).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class BureauRecord:
    """Registro normalizado de bureau para um único documento (CNPJ ou CPF).

    Os campos cobrem as três dimensões usadas pelas regras de análise de
    risco: cadastral (KYS/KYE), judicial/compliance (KYS/KYE/KYC) e
    financeira (KYC/modelos de crédito) — um único registro alimenta as
    três análises.
    """

    documento: str
    tipo_documento: str  # "PJ" | "PF"
    nome: str
    encontrado: bool
    situacao_cadastral: str
    tempo_atividade_meses: int
    quantidade_socios: int
    possui_sancao_ativa: bool  # listas tipo CEIS/CNEP/OFAC, genérico
    processos_civeis: int
    processos_criminais: int
    processos_trabalhistas: int
    mandados_prisao_ativos: int
    protestos: int
    cheques_sem_fundo: int
    divida_ativa: float
    capital_social_ou_renda_mensal: float
    faturamento_estimado_anual: float
    score_externo_bureau: float  # 0 a 1000, estilo Serasa/SPC, ilustrativo
    setor_atividade: str


# Registro-sentinela para quando o bureau não encontra o documento ou a
# consulta esgota as tentativas de retry. Valores conservadores (nunca
# otimistas): situação desconhecida, zero histórico positivo, score 0 —
# um documento "sem informação" não deveria ser tratado como "sem risco".
def _registro_nao_encontrado(documento: str, tipo_documento: str) -> BureauRecord:
    return BureauRecord(
        documento=documento,
        tipo_documento=tipo_documento,
        nome="",
        encontrado=False,
        situacao_cadastral="DESCONHECIDA",
        tempo_atividade_meses=0,
        quantidade_socios=0,
        possui_sancao_ativa=False,
        processos_civeis=0,
        processos_criminais=0,
        processos_trabalhistas=0,
        mandados_prisao_ativos=0,
        protestos=0,
        cheques_sem_fundo=0,
        divida_ativa=0.0,
        capital_social_ou_renda_mensal=0.0,
        faturamento_estimado_anual=0.0,
        score_externo_bureau=0.0,
        setor_atividade="NAO_INFORMADO",
    )


def infer_tipo_documento(documento: str) -> str:
    """CPF tem 11 dígitos, CNPJ tem 14, já sem hífen/pontuação — o
    payload do bureau normalmente informa `tipo_documento` explicitamente,
    esta heurística cobre o caso em que ele vem ausente."""
    digitos = "".join(c for c in documento if c.isdigit())
    return "PF" if len(digitos) <= 11 else "PJ"


def parse_bureau_payload(documento: str, payload: dict) -> BureauRecord:
    """Converte o JSON bruto do bureau no registro normalizado.

    Campo ausente no payload não vira `None` silencioso: assume um default
    neutro (ex. score no meio da escala) — diferente do caso "documento não
    encontrado", que é conservador (default no pior caso). São situações
    distintas: aqui o bureau respondeu, só omitiu um campo pontual.
    """
    tipo_documento = payload.get("tipo_documento") or infer_tipo_documento(documento)
    return BureauRecord(
        documento=documento,
        tipo_documento=tipo_documento,
        nome=payload.get("nome", ""),
        encontrado=True,
        situacao_cadastral=payload.get("situacao_cadastral", "DESCONHECIDA"),
        tempo_atividade_meses=int(payload.get("tempo_atividade_meses", 0)),
        quantidade_socios=int(payload.get("quantidade_socios", 0)),
        possui_sancao_ativa=bool(payload.get("possui_sancao_ativa", False)),
        processos_civeis=int(payload.get("processos_civeis", 0)),
        processos_criminais=int(payload.get("processos_criminais", 0)),
        processos_trabalhistas=int(payload.get("processos_trabalhistas", 0)),
        mandados_prisao_ativos=int(payload.get("mandados_prisao_ativos", 0)),
        protestos=int(payload.get("protestos", 0)),
        cheques_sem_fundo=int(payload.get("cheques_sem_fundo", 0)),
        divida_ativa=float(payload.get("divida_ativa", 0.0)),
        capital_social_ou_renda_mensal=float(payload.get("capital_social_ou_renda_mensal", 0.0)),
        faturamento_estimado_anual=float(payload.get("faturamento_estimado_anual", 0.0)),
        score_externo_bureau=float(payload.get("score_externo_bureau", 500.0)),
        setor_atividade=payload.get("setor_atividade", "NAO_INFORMADO"),
    )


class _HttpResponse(Protocol):
    status_code: int

    def json(self) -> dict: ...


class _HttpSession(Protocol):
    def get(self, url: str, timeout: float) -> _HttpResponse: ...


def fetch_bureau_record(
    session: _HttpSession,
    base_url: str,
    documento: str,
    max_retries: int = 2,
) -> BureauRecord:
    """Busca o registro de um documento no bureau, com retry exponencial.

    404 é resposta válida ("documento não cadastrado no bureau") e retorna
    direto o registro sentinela, sem consumir tentativas de retry — só
    timeout/erro de rede/5xx é retentado. Ao esgotar as tentativas, também
    cai no sentinela: o pipeline nunca quebra por indisponibilidade de uma
    consulta, a linha só vem marcada como `encontrado=False`.
    """
    tipo_documento = infer_tipo_documento(documento)
    for attempt in range(max_retries + 1):
        try:
            response = session.get(f"{base_url}/documentos/{documento}", timeout=8.0)
        except Exception:
            if attempt < max_retries:
                time.sleep(0.5 * (2**attempt))
                continue
            return _registro_nao_encontrado(documento, tipo_documento)

        if response.status_code == 200:
            return parse_bureau_payload(documento, response.json())
        if response.status_code == 404:
            return _registro_nao_encontrado(documento, tipo_documento)
        if attempt < max_retries:
            time.sleep(0.5 * (2**attempt))

    return _registro_nao_encontrado(documento, tipo_documento)


def _record_to_row(record: BureauRecord) -> dict:
    return {
        "documento": record.documento,
        "encontrado": record.encontrado,
        "tipo_documento": record.tipo_documento,
        "nome": record.nome,
        "situacao_cadastral": record.situacao_cadastral,
        "tempo_atividade_meses": record.tempo_atividade_meses,
        "quantidade_socios": record.quantidade_socios,
        "possui_sancao_ativa": record.possui_sancao_ativa,
        "processos_civeis": record.processos_civeis,
        "processos_criminais": record.processos_criminais,
        "processos_trabalhistas": record.processos_trabalhistas,
        "mandados_prisao_ativos": record.mandados_prisao_ativos,
        "protestos": record.protestos,
        "cheques_sem_fundo": record.cheques_sem_fundo,
        "divida_ativa": record.divida_ativa,
        "capital_social_ou_renda_mensal": record.capital_social_ou_renda_mensal,
        "faturamento_estimado_anual": record.faturamento_estimado_anual,
        "score_externo_bureau": record.score_externo_bureau,
        "setor_atividade": record.setor_atividade,
    }


def fetch_bureau_batch(spark, documentos, base_url: str = "https://example-credit-bureau.invalid/v1"):
    """Integração Spark: recebe um DataFrame com coluna `documento` e
    devolve um DataFrame no `BUREAU_SCHEMA`, um registro por documento.

    Usa `mapInPandas` (não `df.rdd.mapPartitions`) — a mesma correção já
    registrada nos outros pipelines deste showcase: compute serverless do
    Databricks bloqueia a API de RDD crua, só expõe a API de DataFrame.
    Uma sessão HTTP é reaproveitada por partição, não recriada por linha.
    """
    from bureau_schema import BUREAU_SCHEMA

    def process_partitions(batches):
        import pandas as pd
        import requests

        session = requests.Session()
        try:
            for batch_df in batches:
                rows = [
                    _record_to_row(fetch_bureau_record(session, base_url, documento))
                    for documento in batch_df["documento"]
                ]
                yield pd.DataFrame(rows, columns=list(BUREAU_SCHEMA.fieldNames()))
        finally:
            session.close()

    return documentos.select("documento").mapInPandas(process_partitions, schema=BUREAU_SCHEMA)
