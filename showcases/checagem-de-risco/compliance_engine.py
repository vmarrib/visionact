"""
Checagem de Risco — motor de compliance por campo + as 3 regras de análise
de risco (KYS/KYE/KYC).

Cada regra observa diretamente um campo do `BureauRecord` (não um "sinal"
abstrato) ou uma categoria sinalizada da checagem de mídia — a decisão de
negócio fica visível e auditável: dá pra apontar exatamente qual campo do
bureau (ou qual categoria de mídia) disparou cada regra.

As 3 configurações:

- **KYS** (Know Your Supplier / Fornecedor) — escopo mais amplo: compliance
  por campo + checagem de mídia nas 6 categorias ("qualquer envolvimento").
  Não roda modelos de crédito — o risco de fornecedor aqui é reputacional
  e de compliance, não de inadimplência.
- **KYE** (Know Your Employee / Colaborador) — compliance por campo restrito
  a processos, mandado de prisão e histórico trabalhista, + checagem de
  mídia num escopo mais estreito (envolvimento criminal, crime organizado,
  fraude/estelionato pessoal) — não faz sentido rodar sanção internacional
  (OFAC) ou cartel/CADE contra uma pessoa física candidata a colaborador.
- **KYC** (Know Your Client / Cliente) — compliance básico por campo +
  checagem de mídia num escopo de compliance essencial (sanções,
  lavagem de dinheiro), **mais** os 4 modelos de crédito embarcados
  (`credit_models.py`) por cima — são as únicas regras de análise de risco
  com camada de crédito, porque cliente é quem efetivamente representa
  exposição financeira.

Regra é veto (reprovação automática, independente do score) ou ponderada
(soma proporcional ao peso da regra, normalizada pela soma de pesos
possíveis). Score final combina compliance + crédito só no KYC.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from bureau_client import BureauRecord
from credit_models import CreditAnalysis, run_credit_models
from media_check_categories import MEDIA_CATEGORIES, MediaCheckCategoryResult

# Peso de compliance x crédito no score final do KYC — crédito pesa mais
# porque é o propósito central de uma análise de cliente, mas compliance
# básico continua contribuindo (evita aprovar por crédito bom uma
# contraparte com pendência de compliance).
PESO_COMPLIANCE_NO_SCORE_KYC = 0.4
PESO_CREDITO_NO_SCORE_KYC = 0.6

LIMIAR_REJEICAO = 0.66
LIMIAR_REVISAO_MANUAL = 0.33

# Score de crédito, isolado, acima do qual o KYC rejeita automaticamente —
# mesmo sem nenhum achado de compliance. Sem este limiar independente, o
# peso de crédito (0.6) nunca sozinho atingiria LIMIAR_REJEICAO (0.66) no
# score combinado, o que deixaria uma contraparte de risco de crédito
# extremo (ex. inadimplência máxima nos 4 modelos) presa em "revisão
# manual" — errado da mesma forma que um veto de compliance não deveria
# depender do resto do score.
LIMIAR_CREDITO_REJEICAO_AUTOMATICA = 0.85


@dataclass(frozen=True)
class ComplianceContext:
    record: BureauRecord
    media_resultados: tuple[MediaCheckCategoryResult, ...]


@dataclass(frozen=True)
class ComplianceRule:
    id: str
    descricao: str
    campo: str  # atributo de BureauRecord, ou "media_check:<category_id>"
    tipo: str  # "veto" | "ponderada"
    peso: float  # só usado quando tipo == "ponderada"
    avaliar: Callable[[ComplianceContext], bool]  # True = regra disparada (achado de risco)


# --- Regras de campo do bureau -------------------------------------------

FIELD_RULES: dict[str, ComplianceRule] = {
    "sancao_ativa": ComplianceRule(
        id="sancao_ativa",
        descricao="Contraparte consta em lista de sanções ativa",
        campo="possui_sancao_ativa",
        tipo="veto",
        peso=0.0,
        avaliar=lambda ctx: ctx.record.possui_sancao_ativa,
    ),
    "mandado_prisao_ativo": ComplianceRule(
        id="mandado_prisao_ativo",
        descricao="Mandado de prisão ativo contra a contraparte",
        campo="mandados_prisao_ativos",
        tipo="veto",
        peso=0.0,
        avaliar=lambda ctx: ctx.record.mandados_prisao_ativos > 0,
    ),
    "processo_criminal_ativo": ComplianceRule(
        id="processo_criminal_ativo",
        descricao="Processo(s) criminal(is) em andamento",
        campo="processos_criminais",
        tipo="ponderada",
        peso=0.9,
        avaliar=lambda ctx: ctx.record.processos_criminais > 0,
    ),
    "situacao_cadastral_irregular": ComplianceRule(
        id="situacao_cadastral_irregular",
        descricao="Situação cadastral fora de ATIVA/REGULAR",
        campo="situacao_cadastral",
        tipo="ponderada",
        peso=0.6,
        avaliar=lambda ctx: ctx.record.situacao_cadastral not in ("ATIVA", "REGULAR"),
    ),
    "empresa_recem_aberta": ComplianceRule(
        id="empresa_recem_aberta",
        descricao="Empresa (PJ) com menos de 6 meses de atividade",
        campo="tempo_atividade_meses",
        tipo="ponderada",
        peso=0.3,
        avaliar=lambda ctx: ctx.record.tipo_documento == "PJ" and ctx.record.tempo_atividade_meses < 6,
    ),
    "sem_socios_identificados": ComplianceRule(
        id="sem_socios_identificados",
        descricao="Nenhum sócio identificado no quadro societário (PJ)",
        campo="quantidade_socios",
        tipo="ponderada",
        peso=0.4,
        avaliar=lambda ctx: ctx.record.tipo_documento == "PJ" and ctx.record.quantidade_socios == 0,
    ),
    "processos_trabalhistas_recorrentes": ComplianceRule(
        id="processos_trabalhistas_recorrentes",
        descricao="3 ou mais processos trabalhistas registrados",
        campo="processos_trabalhistas",
        tipo="ponderada",
        peso=0.5,
        avaliar=lambda ctx: ctx.record.processos_trabalhistas >= 3,
    ),
    "processos_civeis_multiplos": ComplianceRule(
        id="processos_civeis_multiplos",
        descricao="5 ou mais processos cíveis registrados",
        campo="processos_civeis",
        tipo="ponderada",
        peso=0.3,
        avaliar=lambda ctx: ctx.record.processos_civeis >= 5,
    ),
    "divida_ativa_registrada": ComplianceRule(
        id="divida_ativa_registrada",
        descricao="Dívida ativa registrada em nome da contraparte",
        campo="divida_ativa",
        tipo="ponderada",
        peso=0.4,
        avaliar=lambda ctx: ctx.record.divida_ativa > 0,
    ),
}


# --- Regras derivadas da checagem de mídia (uma por categoria) -----------
# Categorias de alerta máximo (lavagem de dinheiro, sanções, crime
# organizado) viram veto; as demais entram como ponderada.


def _media_rule(category_id: str, category_nome: str, alerta_maximo: bool) -> ComplianceRule:
    def avaliar(ctx: ComplianceContext) -> bool:
        return any(r.category_id == category_id and r.sinalizado for r in ctx.media_resultados)

    return ComplianceRule(
        id=f"media_{category_id}",
        descricao=f"Menção adversa corroborada — {category_nome}",
        campo=f"media_check:{category_id}",
        tipo="veto" if alerta_maximo else "ponderada",
        peso=0.0 if alerta_maximo else 0.5,
        avaliar=avaliar,
    )


MEDIA_RULES_BY_CATEGORY: dict[str, ComplianceRule] = {
    cat.id: _media_rule(cat.id, cat.nome, cat.alerta_maximo) for cat in MEDIA_CATEGORIES
}


# --- As 3 regras de análise de risco (KYS/KYE/KYC) ------------------------


@dataclass(frozen=True)
class RiskAnalysisRules:
    id: str
    nome: str
    regras: tuple[ComplianceRule, ...]
    categorias_media: tuple[str, ...]
    usa_modelos_credito: bool = False


def _media_rules_for(category_ids: tuple[str, ...]) -> tuple[ComplianceRule, ...]:
    return tuple(MEDIA_RULES_BY_CATEGORY[cid] for cid in category_ids)


KYS_MEDIA_SCOPE: tuple[str, ...] = tuple(cat.id for cat in MEDIA_CATEGORIES)  # as 6 — "qualquer envolvimento"
KYE_MEDIA_SCOPE: tuple[str, ...] = (
    "envolvimento_criminal_violencia",
    "crime_organizado_faccoes",
    "fraude_estelionato_crimes_empresariais",
)
KYC_MEDIA_SCOPE: tuple[str, ...] = (
    "sancoes_regulatorio_restricoes",
    "lavagem_dinheiro_crimes_financeiros",
)


KYS_RULES = RiskAnalysisRules(
    id="kys",
    nome="KYS — Know Your Supplier (Fornecedor)",
    regras=(
        FIELD_RULES["sancao_ativa"],
        FIELD_RULES["mandado_prisao_ativo"],
        FIELD_RULES["processo_criminal_ativo"],
        FIELD_RULES["situacao_cadastral_irregular"],
        FIELD_RULES["empresa_recem_aberta"],
        FIELD_RULES["sem_socios_identificados"],
        FIELD_RULES["processos_civeis_multiplos"],
        FIELD_RULES["divida_ativa_registrada"],
    )
    + _media_rules_for(KYS_MEDIA_SCOPE),
    categorias_media=KYS_MEDIA_SCOPE,
    usa_modelos_credito=False,
)

KYE_RULES = RiskAnalysisRules(
    id="kye",
    nome="KYE — Know Your Employee (Colaborador)",
    regras=(
        FIELD_RULES["mandado_prisao_ativo"],
        FIELD_RULES["processo_criminal_ativo"],
        FIELD_RULES["processos_trabalhistas_recorrentes"],
        FIELD_RULES["processos_civeis_multiplos"],
    )
    + _media_rules_for(KYE_MEDIA_SCOPE),
    categorias_media=KYE_MEDIA_SCOPE,
    usa_modelos_credito=False,
)

KYC_RULES = RiskAnalysisRules(
    id="kyc",
    nome="KYC — Know Your Client (Cliente)",
    regras=(
        FIELD_RULES["sancao_ativa"],
        FIELD_RULES["situacao_cadastral_irregular"],
        FIELD_RULES["divida_ativa_registrada"],
    )
    + _media_rules_for(KYC_MEDIA_SCOPE),
    categorias_media=KYC_MEDIA_SCOPE,
    usa_modelos_credito=True,
)


# --- Avaliação ---------------------------------------------------------


@dataclass(frozen=True)
class RuleOutcome:
    rule_id: str
    descricao: str
    tipo: str
    disparada: bool
    peso: float


@dataclass(frozen=True)
class RiskAnalysisResult:
    rule_set_id: str
    score: float  # 0 a 1
    veto: bool
    recommendation: str  # "approve" | "manual_review" | "reject"
    flagged_rules: tuple[str, ...]
    rule_outcomes: tuple[RuleOutcome, ...]
    campos_para_analise: dict
    media_resultados: tuple[MediaCheckCategoryResult, ...]
    analise_credito: CreditAnalysis | None


def _extrair_campos_para_analise(record: BureauRecord, regras: tuple[ComplianceRule, ...]) -> dict:
    """Reúne, a partir das regras aplicadas, só os campos do bureau
    realmente usados nelas — o analista revisa a decisão sem precisar do
    registro inteiro."""
    campos: dict = {"documento": record.documento, "tipo_documento": record.tipo_documento}
    for regra in regras:
        if not regra.campo.startswith("media_check:") and hasattr(record, regra.campo):
            campos[regra.campo] = getattr(record, regra.campo)
    return campos


def avaliar_regras(
    conjunto: RiskAnalysisRules,
    record: BureauRecord,
    media_resultados: tuple[MediaCheckCategoryResult, ...],
) -> RiskAnalysisResult:
    ctx = ComplianceContext(record=record, media_resultados=media_resultados)
    outcomes = tuple(
        RuleOutcome(rule_id=r.id, descricao=r.descricao, tipo=r.tipo, disparada=r.avaliar(ctx), peso=r.peso)
        for r in conjunto.regras
    )

    veto = any(o.disparada for o in outcomes if o.tipo == "veto")

    ponderadas = [o for o in outcomes if o.tipo == "ponderada"]
    soma_pesos = sum(o.peso for o in ponderadas)
    score_compliance = (sum(o.peso for o in ponderadas if o.disparada) / soma_pesos) if soma_pesos > 0 else 0.0

    analise_credito = run_credit_models(record) if conjunto.usa_modelos_credito else None
    if analise_credito is not None:
        score = (score_compliance * PESO_COMPLIANCE_NO_SCORE_KYC) + (
            analise_credito.score_credito_final * PESO_CREDITO_NO_SCORE_KYC
        )
    else:
        score = score_compliance
    score = round(min(1.0, score), 4)

    credito_critico = analise_credito is not None and analise_credito.score_credito_final >= LIMIAR_CREDITO_REJEICAO_AUTOMATICA

    if veto or credito_critico or score >= LIMIAR_REJEICAO:
        recommendation = "reject"
    elif score >= LIMIAR_REVISAO_MANUAL:
        recommendation = "manual_review"
    else:
        recommendation = "approve"

    return RiskAnalysisResult(
        rule_set_id=conjunto.id,
        score=score,
        veto=veto,
        recommendation=recommendation,
        flagged_rules=tuple(o.rule_id for o in outcomes if o.disparada),
        rule_outcomes=outcomes,
        campos_para_analise=_extrair_campos_para_analise(record, conjunto.regras),
        media_resultados=media_resultados,
        analise_credito=analise_credito,
    )
