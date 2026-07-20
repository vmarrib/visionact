/**
 * Due Check — amostra do motor de regras automáticas de risco.
 *
 * Generalizado a partir do código real: pesos, limiares de score e regras
 * específicas de cliente foram substituídos por valores de exemplo.
 *
 * Decisão de arquitetura: nem toda regra de risco deveria "descontar
 * pontos" da mesma forma. Uma sanção internacional ativa não é "um sinal
 * negativo a mais" — é motivo de bloqueio automático, independente de
 * quão bem a contraparte pontue em outros critérios. Misturar os dois tipos
 * de regra num único score ponderado cria o cenário absurdo de uma entidade
 * sancionada "passar" porque teve boas notas em outros pontos. Por isso o
 * motor separa explicitamente:
 *   - `vetoSignals`: qualquer um verdadeiro = bloqueio automático, decisão
 *     encerrada ali, sem precisar calcular o resto.
 *   - `weightedSignals`: soma ponderada, só relevante se nenhum veto disparou.
 */

export type Recommendation = "approve" | "manual_review" | "reject";

export interface VetoSignal {
  id: string;
  triggered: boolean;
  reason: string;
}

export interface WeightedSignal {
  id: string;
  /** Peso do sinal no score final (positivo = agrava risco). */
  weight: number;
  /** 0 a 1 — intensidade do sinal detectado (0 = ausente, 1 = máximo). */
  intensity: number;
}

export interface RiskAssessmentInput {
  vetoSignals: VetoSignal[];
  weightedSignals: WeightedSignal[];
}

export interface RiskAssessmentResult {
  recommendation: Recommendation;
  score: number;
  triggeredVetoes: string[];
  /** Versão da regra aplicada — toda mudança de regra gera uma nova versão,
   *  para que um dossiê antigo continue explicável mesmo depois da regra mudar. */
  ruleVersion: string;
}

const RULE_VERSION = "example-1.0";

/** Limiares de exemplo — no sistema real são configuráveis por organização. */
const SCORE_THRESHOLD_REJECT = 0.7;
const SCORE_THRESHOLD_MANUAL_REVIEW = 0.35;

/**
 * Avalia um conjunto de sinais e retorna uma recomendação com trilha de
 * auditoria (quais vetos dispararam, qual versão de regra foi usada).
 *
 * A função é pura: os mesmos sinais de entrada sempre produzem a mesma
 * saída, o que torna trivial escrever testes de regressão para casos reais
 * de compliance sem precisar de banco de dados.
 */
export function assessRisk(input: RiskAssessmentInput): RiskAssessmentResult {
  const triggeredVetoes = input.vetoSignals.filter((v) => v.triggered).map((v) => v.id);

  if (triggeredVetoes.length > 0) {
    return {
      recommendation: "reject",
      score: 1,
      triggeredVetoes,
      ruleVersion: RULE_VERSION,
    };
  }

  const totalWeight = input.weightedSignals.reduce((sum, s) => sum + s.weight, 0);
  const weightedSum = input.weightedSignals.reduce((sum, s) => sum + s.weight * s.intensity, 0);
  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;

  const recommendation: Recommendation =
    score >= SCORE_THRESHOLD_REJECT
      ? "reject"
      : score >= SCORE_THRESHOLD_MANUAL_REVIEW
        ? "manual_review"
        : "approve";

  return {
    recommendation,
    score,
    triggeredVetoes: [],
    ruleVersion: RULE_VERSION,
  };
}
