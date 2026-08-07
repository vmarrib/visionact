"""
Checagem de Risco e Crédito, camada de carga: do resultado da análise para
o ERP/CRM.

O produto final deste pipeline não é um relatório em PDF. É um conjunto de
atributos de risco que precisa aparecer dentro do sistema onde o negócio
já trabalha: o cadastro do fornecedor no ERP, a conta do cliente no CRM.
Quem decide sobre a contraparte é o time de compras, de crédito ou
comercial, e esse time não abre uma ferramenta de compliance para decidir.

Este módulo faz a parte "L" do ETL, com três preocupações:

1. **Contrato de campos estável.** `to_enrichment_record()` projeta o
   resultado num conjunto fixo de atributos de negócio (nomes de campo de
   CRM, não nomes internos de regra). Adicionar uma regra ao motor não
   quebra o mapeamento do ERP.
2. **Idempotência.** Cada registro carrega um `payload_hash`. Reprocessar
   a mesma carteira sem mudança de dado nem de versão de regra produz o
   mesmo hash, e `selecionar_deltas()` derruba a carga a zero linha. Isso
   importa porque a maioria dos ERPs cobra por chamada de API e dispara
   workflow a cada escrita: reenviar 40 mil cadastros idênticos gera 40 mil
   notificações inúteis para o time comercial.
3. **Métricas de compliance.** `resumir_metricas()` agrega a carteira em
   indicadores prontos para dashboard (taxa de reprovação, veto, cobertura
   de fonte, distribuição de recomendação, score médio de crédito). É o
   número que o comitê de risco olha, e ele sai do mesmo pipeline, sem uma
   segunda ferramenta de BI recalculando a regra por conta própria.

Sem PySpark: tudo aqui é dicionário puro, aplicado linha a linha dentro do
`mapInPandas` do pipeline ou sobre a coleção já materializada.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

# Nome do atributo no ERP/CRM -> chave da linha de saída do pipeline.
# Explícito de propósito: é este dicionário que o time de integração lê
# quando pergunta "que campo do CRM recebe o quê".
MAPEAMENTO_ERP_CRM: dict[str, str] = {
    "risco_documento": "documento",
    "risco_tipo_pessoa": "tipo_documento",
    "risco_score": "score",
    "risco_veto": "veto",
    "risco_recomendacao": "recommendation",
    "risco_regras_sinalizadas": "flagged_rules",
    "risco_midia_categorias": "media_categorias_sinalizadas",
    "risco_score_credito": "score_credito_final",
    "risco_atualizado_em": "generated_at",
    "risco_versao_regras": "rule_set_version",
}

# Recomendação técnica -> status que o usuário de negócio entende no
# cadastro. O ERP não deveria precisar aprender o vocabulário do motor.
STATUS_NEGOCIO = {
    "approve": "LIBERADO",
    "manual_review": "EM_ANALISE",
    "reject": "BLOQUEADO",
}

# Faixas de exibição do score. Um número entre 0 e 1 não orienta decisão no
# meio de uma tela de cadastro; uma faixa orienta.
FAIXAS_RISCO = ((0.33, "BAIXO"), (0.66, "MEDIO"), (1.01, "ALTO"))

# Campos voláteis por natureza, excluídos do hash de idempotência: o
# timestamp muda a cada execução e sozinho marcaria tudo como delta.
CAMPOS_FORA_DO_HASH = ("generated_at",)


@dataclass(frozen=True)
class EnrichmentRecord:
    """Uma linha pronta para upsert no ERP/CRM."""

    chave: str  # documento, chave natural do upsert
    rule_set_id: str
    atributos: dict[str, Any]
    payload_hash: str


def faixa_de_risco(score: float) -> str:
    for limite, rotulo in FAIXAS_RISCO:
        if score < limite:
            return rotulo
    return "ALTO"


def calcular_payload_hash(atributos: dict[str, Any]) -> str:
    """SHA-256 estável do conteúdo de negócio do registro.

    `sort_keys` garante que a ordem de inserção do dicionário não muda o
    hash, e `default=str` cobre tipos como datetime que sobrarem no
    payload sem quebrar a serialização.
    """
    material = {k: v for k, v in atributos.items() if k not in _CHAVES_VOLATEIS}
    serializado = json.dumps(material, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(serializado.encode("utf-8")).hexdigest()


_CHAVES_VOLATEIS = {
    destino for destino, origem in MAPEAMENTO_ERP_CRM.items() if origem in CAMPOS_FORA_DO_HASH
}


def to_enrichment_record(rule_set_id: str, row: dict) -> EnrichmentRecord:
    """Projeta uma linha de saída do pipeline no contrato do ERP/CRM.

    Campos ausentes são omitidos em vez de virarem `None`: KYS e KYE não
    rodam modelos de crédito, e mandar `risco_score_credito = null` para o
    CRM apagaria um valor legítimo gravado por uma análise de KYC anterior
    da mesma contraparte.
    """
    atributos: dict[str, Any] = {}
    for destino, origem in MAPEAMENTO_ERP_CRM.items():
        if origem in row and row[origem] is not None:
            atributos[destino] = row[origem]

    atributos["risco_origem_analise"] = rule_set_id
    atributos["risco_status"] = STATUS_NEGOCIO.get(row.get("recommendation", ""), "EM_ANALISE")
    atributos["risco_faixa"] = faixa_de_risco(float(row.get("score", 0.0)))

    return EnrichmentRecord(
        chave=str(row["documento"]),
        rule_set_id=rule_set_id,
        atributos=atributos,
        payload_hash=calcular_payload_hash(atributos),
    )


def build_enrichment_batch(rule_set_id: str, rows: Iterable[dict]) -> tuple[EnrichmentRecord, ...]:
    return tuple(to_enrichment_record(rule_set_id, row) for row in rows)


def selecionar_deltas(
    novos: Sequence[EnrichmentRecord], hashes_ja_carregados: dict[str, str]
) -> tuple[EnrichmentRecord, ...]:
    """Filtra só o que mudou desde a última carga.

    A chave de comparação inclui o rule_set: a mesma contraparte pode ser
    fornecedor e cliente ao mesmo tempo, e uma análise de KYC não deveria
    suprimir a carga do resultado de KYS.
    """
    return tuple(
        r for r in novos if hashes_ja_carregados.get(f"{r.rule_set_id}:{r.chave}") != r.payload_hash
    )


@dataclass(frozen=True)
class MetricasCompliance:
    rule_set_id: str
    total_contrapartes: int
    aprovadas: int
    em_revisao_manual: int
    reprovadas: int
    com_veto: int
    taxa_reprovacao: float
    score_medio: float
    score_credito_medio: float | None
    top_regras_sinalizadas: tuple[tuple[str, int], ...]


def resumir_metricas(
    rule_set_id: str, rows: Sequence[dict], top_n: int = 5
) -> MetricasCompliance:
    """Agrega a carteira analisada nos indicadores que vão para o painel de
    compliance. Calculado aqui, junto da decisão, e não numa camada de BI
    separada: duas implementações da mesma regra divergem, e num comitê de
    risco a divergência custa a credibilidade do número inteiro."""
    total = len(rows)
    if total == 0:
        return MetricasCompliance(rule_set_id, 0, 0, 0, 0, 0, 0.0, 0.0, None, ())

    recomendacoes = Counter(r.get("recommendation") for r in rows)
    reprovadas = recomendacoes.get("reject", 0)

    regras = Counter()
    for r in rows:
        regras.update(r.get("flagged_rules", []))

    scores_credito = [r["score_credito_final"] for r in rows if r.get("score_credito_final") is not None]

    return MetricasCompliance(
        rule_set_id=rule_set_id,
        total_contrapartes=total,
        aprovadas=recomendacoes.get("approve", 0),
        em_revisao_manual=recomendacoes.get("manual_review", 0),
        reprovadas=reprovadas,
        com_veto=sum(1 for r in rows if r.get("veto")),
        taxa_reprovacao=round(reprovadas / total, 4),
        score_medio=round(sum(float(r.get("score", 0.0)) for r in rows) / total, 4),
        score_credito_medio=(
            round(sum(scores_credito) / len(scores_credito), 4) if scores_credito else None
        ),
        top_regras_sinalizadas=tuple(regras.most_common(top_n)),
    )
