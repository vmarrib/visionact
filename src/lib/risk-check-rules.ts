/**
 * Checagem de Risco (demo ao vivo) — REGRAS CONFIGURADAS AQUI.
 *
 * Este é o único arquivo que precisa ser editado para adicionar, remover ou
 * repesar uma regra de risco — `evaluateRules()`, no final do arquivo,
 * interpreta esta configuração genericamente e não precisa mudar quando uma
 * regra muda. Mesmo padrão do showcase PySpark em `checagem-de-risco/`
 * (veto separado de score ponderado), só que aqui usando exclusivamente
 * sinais derivados da BrasilAPI — sem bureaus adicionais.
 */

export interface CompanySignals {
  situacaoAtiva: boolean;
  mesesDesdeAbertura: number;
  capitalSocial: number;
  numeroSocios: number;
}

export interface VetoRule {
  id: string;
  label: string;
  reason: string;
  triggered: (signals: CompanySignals) => boolean;
}

export interface WeightedRule {
  id: string;
  label: string;
  /** Peso relativo no score final — maior peso, maior impacto se a regra disparar. */
  weight: number;
  triggered: (signals: CompanySignals) => boolean;
}

/**
 * Regras de VETO: qualquer uma disparando força recomendação "reject",
 * independente do score ponderado — nenhuma nota boa em outro critério
 * deveria compensar uma empresa oficialmente inativa.
 */
export const VETO_RULES: VetoRule[] = [
  {
    id: "situacao_inativa",
    label: "Situação cadastral não é ATIVA",
    reason: "A Receita Federal não classifica esta empresa como ATIVA — pode estar baixada, suspensa ou inapta.",
    triggered: (s) => !s.situacaoAtiva,
  },
];

/**
 * Regras PONDERADAS: só avaliadas se nenhum veto disparou. O score final é
 * a soma dos pesos das regras disparadas, dividida pela soma de todos os
 * pesos configurados (0 a 1).
 */
export const WEIGHTED_RULES: WeightedRule[] = [
  {
    id: "empresa_recente",
    label: "Empresa aberta há menos de 6 meses",
    weight: 0.4,
    triggered: (s) => s.mesesDesdeAbertura < 6,
  },
  {
    id: "capital_social_baixo",
    label: "Capital social abaixo de R$ 1.000",
    weight: 0.3,
    triggered: (s) => s.capitalSocial < 1_000,
  },
  {
    id: "sem_socios_registrados",
    label: "Nenhum sócio registrado no quadro societário",
    weight: 0.3,
    triggered: (s) => s.numeroSocios === 0,
  },
];

/** Limiares de recomendação sobre o score ponderado (0 a 1). */
export const THRESHOLDS = {
  reject: 0.7,
  manualReview: 0.3,
};

export type Recommendation = "approve" | "manual_review" | "reject";

export interface FlaggedRule {
  id: string;
  label: string;
  reason?: string;
}

export interface RiskAssessment {
  score: number;
  recommendation: Recommendation;
  flaggedRules: FlaggedRule[];
}

/**
 * Avalia os sinais de uma empresa contra as regras configuradas acima.
 * Função pura — mesmos sinais sempre produzem o mesmo resultado, o que a
 * torna trivial de testar sem precisar chamar a BrasilAPI de verdade.
 */
export function evaluateRules(signals: CompanySignals): RiskAssessment {
  const triggeredVetoes = VETO_RULES.filter((rule) => rule.triggered(signals));

  if (triggeredVetoes.length > 0) {
    return {
      score: 1,
      recommendation: "reject",
      flaggedRules: triggeredVetoes.map((r) => ({ id: r.id, label: r.label, reason: r.reason })),
    };
  }

  const triggeredWeighted = WEIGHTED_RULES.filter((rule) => rule.triggered(signals));
  const totalWeight = WEIGHTED_RULES.reduce((sum, r) => sum + r.weight, 0);
  const triggeredWeight = triggeredWeighted.reduce((sum, r) => sum + r.weight, 0);
  const score = totalWeight > 0 ? triggeredWeight / totalWeight : 0;

  const recommendation: Recommendation =
    score >= THRESHOLDS.reject ? "reject" : score >= THRESHOLDS.manualReview ? "manual_review" : "approve";

  return {
    score,
    recommendation,
    flaggedRules: triggeredWeighted.map((r) => ({ id: r.id, label: r.label })),
  };
}
