/**
 * Checagem de Risco (demo ao vivo) — REGRAS CONFIGURADAS AQUI.
 *
 * Este é o único arquivo que precisa ser editado para adicionar, remover ou
 * repesar uma regra de risco — `evaluateRules()`, no final do arquivo,
 * interpreta esta configuração genericamente e não precisa mudar quando uma
 * regra muda. Mesmo padrão do showcase PySpark em `checagem-de-risco/`
 * (veto separado de score ponderado), só que aqui usando exclusivamente
 * sinais derivados da BrasilAPI — sem bureaus adicionais.
 *
 * Cada regra declara explicitamente `field` (qual campo da BrasilAPI ela
 * observa) e `condition` (a condição em texto) — não só o `id` — porque a
 * demo no site mostra essas duas informações lado a lado com o peso e o
 * resultado. A UI nunca reescreve essa descrição por conta própria: ela lê
 * `VETO_RULES`/`WEIGHTED_RULES` diretamente, então o texto exibido no
 * portfólio nunca pode divergir do que o código realmente avalia.
 */

export interface CompanySignals {
  situacaoAtiva: boolean;
  mesesDesdeAbertura: number;
  capitalSocial: number;
  numeroSocios: number;
}

export interface VetoRuleConfig {
  id: string;
  label: string;
  field: string;
  condition: string;
  reason: string;
  triggered: (signals: CompanySignals) => boolean;
}

export interface WeightedRuleConfig {
  id: string;
  label: string;
  field: string;
  condition: string;
  /** Peso relativo no score final — maior peso, maior impacto se a regra disparar. */
  weight: number;
  triggered: (signals: CompanySignals) => boolean;
}

/**
 * Regras de VETO: qualquer uma disparando força recomendação "Reprovado",
 * independente do score ponderado — nenhuma nota boa em outro critério
 * deveria compensar uma empresa oficialmente inativa.
 */
export const VETO_RULES: VetoRuleConfig[] = [
  {
    id: "situacao_inativa",
    label: "Situação cadastral não é ATIVA",
    field: "descricao_situacao_cadastral",
    condition: 'diferente de "ATIVA"',
    reason: "A Receita Federal não classifica esta empresa como ATIVA — pode estar baixada, suspensa ou inapta.",
    triggered: (s) => !s.situacaoAtiva,
  },
];

/**
 * Regras PONDERADAS: só decidem o score se nenhum veto disparou. O score
 * final é a soma dos pesos das regras disparadas, dividida pela soma de
 * todos os pesos configurados (0 a 1).
 */
export const WEIGHTED_RULES: WeightedRuleConfig[] = [
  {
    id: "empresa_recente",
    label: "Empresa aberta há menos de 6 meses",
    field: "data_inicio_atividade",
    condition: "menos de 6 meses até hoje",
    weight: 0.4,
    triggered: (s) => s.mesesDesdeAbertura < 6,
  },
  {
    id: "capital_social_baixo",
    label: "Capital social abaixo de R$ 1.000",
    field: "capital_social",
    condition: "menor que R$ 1.000,00",
    weight: 0.3,
    triggered: (s) => s.capitalSocial < 1_000,
  },
  {
    id: "sem_socios_registrados",
    label: "Nenhum sócio registrado no quadro societário",
    field: "qsa",
    condition: "lista de sócios vazia",
    weight: 0.3,
    triggered: (s) => s.numeroSocios === 0,
  },
];

/** Limiares de classificação sobre o score ponderado (0 a 1). */
export const THRESHOLDS = {
  reject: 0.7,
  manualReview: 0.3,
};

export type Recommendation = "approve" | "manual_review" | "reject";

export interface RuleEvaluation {
  id: string;
  label: string;
  field: string;
  condition: string;
  kind: "veto" | "weighted";
  /** Ausente para regras de veto — bloqueio automático não é uma questão de peso. */
  weight?: number;
  triggered: boolean;
}

export interface RiskAssessment {
  score: number;
  recommendation: Recommendation;
  /** TODAS as regras configuradas, disparadas ou não — não só as sinalizadas. */
  rules: RuleEvaluation[];
}

/**
 * Avalia os sinais de uma empresa contra as regras configuradas acima.
 * Função pura — mesmos sinais sempre produzem o mesmo resultado, o que a
 * torna trivial de testar sem precisar chamar a BrasilAPI de verdade.
 *
 * Retorna a avaliação de TODA regra configurada (não só as que dispararam)
 * — a demo exibe isso como uma tabela transparente de "campo, condição,
 * peso, resultado" para cada regra, disparada ou não.
 */
export function evaluateRules(signals: CompanySignals): RiskAssessment {
  const vetoResults: RuleEvaluation[] = VETO_RULES.map((r) => ({
    id: r.id,
    label: r.label,
    field: r.field,
    condition: r.condition,
    kind: "veto",
    triggered: r.triggered(signals),
  }));

  const weightedResults: RuleEvaluation[] = WEIGHTED_RULES.map((r) => ({
    id: r.id,
    label: r.label,
    field: r.field,
    condition: r.condition,
    kind: "weighted",
    weight: r.weight,
    triggered: r.triggered(signals),
  }));

  const allRules = [...vetoResults, ...weightedResults];

  if (vetoResults.some((r) => r.triggered)) {
    return { score: 1, recommendation: "reject", rules: allRules };
  }

  const totalWeight = WEIGHTED_RULES.reduce((sum, r) => sum + r.weight, 0);
  const triggeredWeight = weightedResults
    .filter((r) => r.triggered)
    .reduce((sum, r) => sum + (r.weight ?? 0), 0);
  const score = totalWeight > 0 ? triggeredWeight / totalWeight : 0;

  const recommendation: Recommendation =
    score >= THRESHOLDS.reject ? "reject" : score >= THRESHOLDS.manualReview ? "manual_review" : "approve";

  return { score, recommendation, rules: allRules };
}
