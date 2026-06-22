"""
Compliance Risk Intelligence
=============================

Motor de análise de risco de compliance pronto para importar no GitHub.

Demonstra domínio do tema:
  - Validação de CPF (pessoa física) e CNPJ (pessoa jurídica) com dígitos
    verificadores e roteamento do pipeline conforme o tipo de documento.
  - Metodologias de due diligence separadas: KYC, KYE, KYS e KYP.
  - Orquestração de múltiplos bureaus nacionais e internacionais como
    conectores plugáveis (Trilia/ex-Neoway, BigDataCorp, Serasa Experian,
    CIAL Dun & Bradstreet, LSEG/Refinitiv World-Check e fontes oficiais).
  - Modelo de score com sinais de veto (hard block) e sinais ponderados,
    produzindo um parecer auditável e reproduzível.

Este arquivo é autocontido (sem dependências externas) e roda como demo:

    python compliance_risk_intelligence.py

Autora: Vanessa M. Ribeiro
Licença: MIT
"""

from __future__ import annotations

import re
import json
import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any


# ---------------------------------------------------------------------------
# 1. Validação de documentos (regra base: CPF e CNPJ)
# ---------------------------------------------------------------------------

def _so_digitos(valor: str) -> str:
    """Remove qualquer caractere que não seja dígito."""
    return re.sub(r"\D", "", valor or "")


def valida_cpf(cpf: str) -> bool:
    """Valida CPF (11 dígitos) pelos dois dígitos verificadores."""
    cpf = _so_digitos(cpf)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for tamanho in (9, 10):
        soma = sum(int(cpf[i]) * (tamanho + 1 - i) for i in range(tamanho))
        digito = (soma * 10 % 11) % 10
        if digito != int(cpf[tamanho]):
            return False
    return True


def valida_cnpj(cnpj: str) -> bool:
    """Valida CNPJ (14 dígitos) pelos dois dígitos verificadores."""
    cnpj = _so_digitos(cnpj)
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        return False
    pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    pesos2 = [6] + pesos1
    for pesos, pos in ((pesos1, 12), (pesos2, 13)):
        soma = sum(int(cnpj[i]) * pesos[i] for i in range(pos))
        resto = soma % 11
        digito = 0 if resto < 2 else 11 - resto
        if digito != int(cnpj[pos]):
            return False
    return True


# ---------------------------------------------------------------------------
# 2. Roteamento: o tipo de documento define o pipeline
# ---------------------------------------------------------------------------

class TipoDocumento(str, Enum):
    PESSOA_FISICA = "PF"   # CPF  -> KYC-PF / KYE
    PESSOA_JURIDICA = "PJ"  # CNPJ -> KYC-PJ / KYS / KYP


class DocumentoInvalido(ValueError):
    pass


def classifica_documento(documento: str) -> TipoDocumento:
    """Classifica o documento como PF (CPF) ou PJ (CNPJ)."""
    doc = _so_digitos(documento)
    if len(doc) == 11 and valida_cpf(doc):
        return TipoDocumento.PESSOA_FISICA
    if len(doc) == 14 and valida_cnpj(doc):
        return TipoDocumento.PESSOA_JURIDICA
    raise DocumentoInvalido(f"Documento inválido: {documento!r}")


# ---------------------------------------------------------------------------
# 3. Metodologias de compliance (KYC, KYE, KYS, KYP)
# ---------------------------------------------------------------------------

class Metodologia(str, Enum):
    KYC = "Know Your Customer"   # cliente PF/PJ
    KYE = "Know Your Employee"   # colaborador
    KYS = "Know Your Supplier"   # fornecedor / terceiro
    KYP = "Know Your Partner"    # sócio / parceiro / UBO


# Quais checagens cada metodologia exige.
CHECKS_POR_METODOLOGIA: dict[Metodologia, list[str]] = {
    Metodologia.KYC: ["situacao_cadastral", "pep", "sancoes", "midia_adversa", "financeiro"],
    Metodologia.KYE: ["antecedentes", "processos", "conflito_interesse", "vinculo_societario"],
    Metodologia.KYS: ["idoneidade", "ceis_cnep", "trabalho_escravo", "embargo_ambiental"],
    Metodologia.KYP: ["ubo", "estrutura_societaria", "pep", "sancoes", "reputacao"],
}


# ---------------------------------------------------------------------------
# 4. Conectores de bureaus (interface plugável + implementações stub)
# ---------------------------------------------------------------------------

@dataclass
class RespostaBureau:
    """Resposta normalizada de um bureau (contrato único)."""
    bureau: str
    documento: str
    encontrado: bool
    sinais: dict[str, Any] = field(default_factory=dict)
    bruto: dict[str, Any] = field(default_factory=dict)
    coletado_em: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class BureauConnector(ABC):
    """Interface comum. Cada bureau real implementa `consultar`."""

    nome: str = "abstract"
    escopo: str = "nacional"  # "nacional" | "internacional"

    @abstractmethod
    def consultar(self, documento: str, tipo: TipoDocumento) -> RespostaBureau:
        ...


# As implementações abaixo são STUBS determinísticos para demonstração.
# Em produção, cada `consultar` faz a chamada HTTP autenticada ao bureau e
# mapeia a resposta para `RespostaBureau`.

def _pseudo(documento: str, salt: str) -> float:
    """Valor pseudo-aleatório estável por documento, só para a demo."""
    h = hashlib.sha256(f"{salt}:{documento}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


class TriliaConnector(BureauConnector):
    """Trilia (antiga Neoway): grafo societário, quadro de sócios e UBO (PJ)."""
    nome, escopo = "Trilia", "nacional"

    def consultar(self, documento: str, tipo: TipoDocumento) -> RespostaBureau:
        opacidade = round(_pseudo(documento, "trilia"), 2)
        return RespostaBureau(
            bureau=self.nome,
            documento=documento,
            encontrado=tipo == TipoDocumento.PESSOA_JURIDICA,
            sinais={"opacidade_societaria": opacidade, "ubo_identificado": opacidade < 0.7},
        )


class BigDataCorpConnector(BureauConnector):
    """BigDataCorp: cadastral PF/PJ, vínculos e enriquecimento em massa."""
    nome, escopo = "BigDataCorp", "nacional"

    def consultar(self, documento: str, tipo: TipoDocumento) -> RespostaBureau:
        return RespostaBureau(
            bureau=self.nome,
            documento=documento,
            encontrado=True,
            sinais={
                "idade_cadastral_anos": int(_pseudo(documento, "bdc") * 25),
                "consistencia_dados": round(_pseudo(documento, "bdc2"), 2),
            },
        )


class SerasaConnector(BureauConnector):
    """Serasa Experian: score de crédito, negativações e protestos."""
    nome, escopo = "Serasa Experian", "nacional"

    def consultar(self, documento: str, tipo: TipoDocumento) -> RespostaBureau:
        score = int(300 + _pseudo(documento, "serasa") * 700)
        return RespostaBureau(
            bureau=self.nome,
            documento=documento,
            encontrado=True,
            sinais={"score_credito": score, "negativado": score < 500},
        )


class CIALConnector(BureauConnector):
    """CIAL Dun & Bradstreet: D-U-N-S e crédito corporativo cross-border."""
    nome, escopo = "CIAL Dun & Bradstreet", "internacional"

    def consultar(self, documento: str, tipo: TipoDocumento) -> RespostaBureau:
        return RespostaBureau(
            bureau=self.nome,
            documento=documento,
            encontrado=tipo == TipoDocumento.PESSOA_JURIDICA,
            sinais={"duns": f"{int(_pseudo(documento, 'cial') * 1e9):09d}"},
        )


class LSEGWorldCheckConnector(BureauConnector):
    """LSEG (Refinitiv World-Check): PEP, listas de sanções e mídia adversa."""
    nome, escopo = "LSEG World-Check", "internacional"

    def consultar(self, documento: str, tipo: TipoDocumento) -> RespostaBureau:
        p = _pseudo(documento, "lseg")
        return RespostaBureau(
            bureau=self.nome,
            documento=documento,
            encontrado=True,
            sinais={
                "pep": p > 0.85,
                "sancionado": p > 0.97,          # OFAC / UE / ONU
                "midia_adversa": round(p, 2),
            },
        )


class FontesOficiaisConnector(BureauConnector):
    """Receita Federal / CGU: situação cadastral, CEIS, CNEP, CEPIM."""
    nome, escopo = "Fontes Oficiais (Receita/CGU)", "nacional"

    def consultar(self, documento: str, tipo: TipoDocumento) -> RespostaBureau:
        p = _pseudo(documento, "gov")
        return RespostaBureau(
            bureau=self.nome,
            documento=documento,
            encontrado=True,
            sinais={"situacao_ativa": p > 0.05, "ceis_cnep": p > 0.95},
        )


# Seleção de bureaus por metodologia. A ordem expressa a prioridade/fallback.
BUREAUS_POR_METODOLOGIA: dict[Metodologia, list[BureauConnector]] = {
    Metodologia.KYC: [SerasaConnector(), BigDataCorpConnector(), LSEGWorldCheckConnector(), FontesOficiaisConnector()],
    Metodologia.KYE: [BigDataCorpConnector(), FontesOficiaisConnector()],
    Metodologia.KYS: [TriliaConnector(), FontesOficiaisConnector(), CIALConnector()],
    Metodologia.KYP: [TriliaConnector(), LSEGWorldCheckConnector(), CIALConnector()],
}


# ---------------------------------------------------------------------------
# 5. Motor de score e decisão
# ---------------------------------------------------------------------------

class FaixaRisco(str, Enum):
    BAIXO = "BAIXO"
    MEDIO = "MEDIO"
    ALTO = "ALTO"
    VETO = "VETO"


# Pesos dos sinais ponderados (somam 1.0). Sanção/CEIS são veto, fora do peso.
PESOS = {
    "pep": 0.40,
    "societario": 0.25,
    "financeiro": 0.20,
    "reputacional": 0.15,
}


def calcular_score(respostas: list[RespostaBureau]) -> dict[str, Any]:
    """Agrega sinais dos bureaus em um score 0..1 e uma faixa de risco."""
    sinais: dict[str, Any] = {}
    for r in respostas:
        sinais.update(r.sinais)

    # Sinais de veto (hard block) -> risco máximo, decisão negativa.
    vetos = []
    if sinais.get("sancionado"):
        vetos.append("sancao_internacional")
    if sinais.get("ceis_cnep"):
        vetos.append("ceis_cnep")
    if sinais.get("situacao_ativa") is False:
        vetos.append("documento_inativo")

    # Sinais ponderados (0 = melhor, 1 = pior).
    pep = 1.0 if sinais.get("pep") else 0.0
    societario = float(sinais.get("opacidade_societaria", 0.3))
    score_credito = sinais.get("score_credito", 700)
    financeiro = max(0.0, min(1.0, (700 - score_credito) / 400))
    reputacional = float(sinais.get("midia_adversa", 0.0))

    risco = (
        PESOS["pep"] * pep
        + PESOS["societario"] * societario
        + PESOS["financeiro"] * financeiro
        + PESOS["reputacional"] * reputacional
    )

    if vetos:
        faixa = FaixaRisco.VETO
    elif risco < 0.25:
        faixa = FaixaRisco.BAIXO
    elif risco < 0.55:
        faixa = FaixaRisco.MEDIO
    else:
        faixa = FaixaRisco.ALTO

    return {
        "score": round(risco, 4),
        "faixa": faixa.value,
        "vetos": vetos,
        "componentes": {
            "pep": pep,
            "societario": round(societario, 4),
            "financeiro": round(financeiro, 4),
            "reputacional": round(reputacional, 4),
        },
        "revisao_humana": faixa == FaixaRisco.MEDIO,
    }


# ---------------------------------------------------------------------------
# 6. Orquestrador + trilha de auditoria
# ---------------------------------------------------------------------------

VERSAO_REGRA = "1.0.0"


def analisar(documento: str, metodologia: Metodologia) -> dict[str, Any]:
    """Pipeline completo: valida -> roteia -> consulta -> score -> parecer."""
    tipo = classifica_documento(documento)
    bureaus = BUREAUS_POR_METODOLOGIA[metodologia]

    respostas = [b.consultar(documento, tipo) for b in bureaus]
    score = calcular_score(respostas)

    parecer = {
        "documento": _so_digitos(documento),
        "tipo": tipo.value,
        "metodologia": metodologia.name,
        "checks_exigidos": CHECKS_POR_METODOLOGIA[metodologia],
        "bureaus_consultados": [r.bureau for r in respostas],
        "resultado": score,
        # Trilha de auditoria: payloads brutos, versão da regra e timestamp.
        "auditoria": {
            "versao_regra": VERSAO_REGRA,
            "gerado_em": datetime.now(timezone.utc).isoformat(),
            "respostas": [asdict(r) for r in respostas],
        },
    }
    return parecer


# ---------------------------------------------------------------------------
# 7. Demonstração
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # CPF e CNPJ válidos para demonstração.
    exemplos = [
        ("529.982.247-25", Metodologia.KYC),   # PF
        ("04.252.011/0001-10", Metodologia.KYP),  # PJ
    ]
    for documento, metodologia in exemplos:
        print("=" * 72)
        print(f"Documento: {documento}  |  Metodologia: {metodologia.name}")
        parecer = analisar(documento, metodologia)
        # Imprime sem a trilha bruta para legibilidade.
        resumo = {k: v for k, v in parecer.items() if k != "auditoria"}
        print(json.dumps(resumo, indent=2, ensure_ascii=False))
