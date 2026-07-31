"""
Checagem de Risco — 4 modelos de crédito embarcados (camada KYC).

Os dados de crédito vêm de um bureau externo via API (`bureau_client.py`) e
alimentam 4 modelos determinísticos independentes, cada um olhando para uma
dimensão diferente de risco de crédito. O resultado combinado é a "análise
de crédito" usada pelas regras de análise de risco do KYC.

Determinístico/scorecard em vez de um modelo treinado por uma razão
concreta: este showcase não tem uma base de inadimplência real rotulada
para treinar contra. Um scorecard com pesos explícitos é a forma correta
de demonstrar a decisão de engenharia central — como combinar múltiplos
sinais de risco num score único — sem depender de um dataset de treino que
não existe neste contexto.

Convenção de score em todo o showcase: 0 = sem risco, 1 = risco máximo.
"""

from __future__ import annotations

from dataclasses import dataclass

from bureau_client import BureauRecord

# Nº de registros restritivos (protesto + cheque sem fundo) a partir do qual
# o modelo de comportamento de pagamento já considera risco máximo — o
# mesmo raciocínio de saturação usado em media_check_categories.py: um
# único restritivo não deveria pesar o mesmo que três.
RESTRITIVOS_TETO = 3

# Meses de atividade a partir dos quais o fator de instabilidade cadastral
# zera — abaixo disso, o risco cresce linearmente até documento recém-aberto.
ESTABILIDADE_MESES_ALVO = 24

# Risco-base ilustrativo por setor de atividade. Setores fora do dicionário
# caem no default "NAO_INFORMADO" — desconhecido é risco médio, não otimista.
SETOR_RISCO_BASE = {
    "CONSTRUCAO_CIVIL": 0.6,
    "VAREJO": 0.4,
    "SERVICOS_FINANCEIROS": 0.3,
    "TECNOLOGIA": 0.25,
    "SAUDE": 0.2,
    "AGRONEGOCIO": 0.35,
    "NAO_INFORMADO": 0.5,
}

# Peso de cada modelo na composição do score final de crédito. Somam 1.0;
# capacidade e comportamento de pagamento pesam mais por serem os sinais
# mais diretamente ligados a inadimplência futura.
PESOS_MODELOS = {
    "capacidade_pagamento": 0.35,
    "comportamento_pagamento": 0.35,
    "estabilidade_cadastral": 0.15,
    "concentracao_setorial": 0.15,
}


@dataclass(frozen=True)
class CreditModelResult:
    nome: str
    score_risco: float  # 0 a 1
    racional: str  # explicação legível para o analista revisar a decisão


@dataclass(frozen=True)
class CreditAnalysis:
    score_credito_final: float  # 0 a 1, média ponderada dos 4 modelos
    modelos: tuple[CreditModelResult, ...]


def modelo_capacidade_pagamento(record: BureauRecord) -> CreditModelResult:
    """Dívida ativa como proporção da renda/faturamento anualizado —
    quanto maior o endividamento relativo à capacidade de gerar receita,
    maior o risco."""
    receita_anualizada = record.faturamento_estimado_anual + (record.capital_social_ou_renda_mensal * 12)
    if receita_anualizada <= 0:
        return CreditModelResult(
            nome="capacidade_pagamento",
            score_risco=1.0,
            racional="sem faturamento/renda informado pelo bureau — tratado como pior caso",
        )
    indice_endividamento = record.divida_ativa / receita_anualizada
    score_risco = min(1.0, indice_endividamento)
    return CreditModelResult(
        nome="capacidade_pagamento",
        score_risco=round(score_risco, 4),
        racional=f"dívida ativa equivale a {indice_endividamento:.0%} da renda/faturamento anualizado",
    )


def modelo_comportamento_pagamento(record: BureauRecord) -> CreditModelResult:
    """Histórico de protestos e cheques sem fundo, saturando em
    RESTRITIVOS_TETO ocorrências — mesmo raciocínio de saturação usado no
    media check: o 1º registro pesa mais que o incremento do 3º ao 4º."""
    total_restritivos = record.protestos + record.cheques_sem_fundo
    score_risco = min(1.0, total_restritivos / RESTRITIVOS_TETO)
    return CreditModelResult(
        nome="comportamento_pagamento",
        score_risco=round(score_risco, 4),
        racional=f"{total_restritivos} registro(s) restritivo(s) (protesto + cheque sem fundo)",
    )


def modelo_estabilidade_cadastral(record: BureauRecord) -> CreditModelResult:
    """Tempo de atividade curto e ausência de sócios (PJ) somam risco de
    instabilidade cadastral — empresa recém-aberta e sem quadro societário
    tem menos histórico para avaliar."""
    fator_tempo = max(0.0, 1.0 - (record.tempo_atividade_meses / ESTABILIDADE_MESES_ALVO))
    fator_socios = 0.3 if (record.tipo_documento == "PJ" and record.quantidade_socios == 0) else 0.0
    score_risco = min(1.0, fator_tempo + fator_socios)
    racional = f"{record.tempo_atividade_meses} mes(es) de atividade"
    if fator_socios:
        racional += ", nenhum sócio informado"
    return CreditModelResult(
        nome="estabilidade_cadastral",
        score_risco=round(score_risco, 4),
        racional=racional,
    )


def modelo_concentracao_setorial(record: BureauRecord) -> CreditModelResult:
    """Risco-base do setor de atividade — setores historicamente mais
    cíclicos/inadimplentes (ex. construção civil) partem de um risco-base
    maior que setores mais estáveis (ex. saúde)."""
    score_risco = SETOR_RISCO_BASE.get(record.setor_atividade, SETOR_RISCO_BASE["NAO_INFORMADO"])
    return CreditModelResult(
        nome="concentracao_setorial",
        score_risco=score_risco,
        racional=f"setor '{record.setor_atividade}' — risco-base {score_risco:.0%}",
    )


def run_credit_models(record: BureauRecord) -> CreditAnalysis:
    """Roda os 4 modelos embarcados e combina o resultado num score único
    de crédito, ponderado por PESOS_MODELOS. Esta é a "análise de crédito"
    consumida pelas regras de análise de risco do KYC."""
    modelos = (
        modelo_capacidade_pagamento(record),
        modelo_comportamento_pagamento(record),
        modelo_estabilidade_cadastral(record),
        modelo_concentracao_setorial(record),
    )
    score_final = sum(m.score_risco * PESOS_MODELOS[m.nome] for m in modelos)
    return CreditAnalysis(score_credito_final=round(score_final, 4), modelos=modelos)
