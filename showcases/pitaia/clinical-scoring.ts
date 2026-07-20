/**
 * PitaIA — amostra do motor de scoring de instrumentos clínicos.
 *
 * Instrumentos validados (PHQ-9, GAD-7, DASS-21, PSS-10, WHO-5, PSQI...)
 * têm regras de pontuação parecidas, mas não idênticas:
 *   - a maioria soma as respostas diretamente;
 *   - alguns têm itens "invertidos" (uma resposta alta conta como baixa);
 *   - alguns têm subescalas (ex.: DASS-21 separa depressão/ansiedade/estresse
 *     dentro do mesmo questionário);
 *   - alguns aplicam um multiplicador final (o DASS-21 multiplica por 2 para
 *     comparar com a tabela de corte clínica original).
 *
 * Decisão: em vez de escrever uma função de cálculo por instrumento (o que
 * duplicaria a mesma lógica de soma/inversão várias vezes com pequenas
 * variações), cada instrumento é descrito como DADO — a função de scoring é
 * única e genérica. Adicionar um instrumento novo vira uma tarefa de
 * "descrever os metadados corretamente", não "escrever lógica nova e testar
 * de novo os casos de borda de soma/inversão".
 */

export interface ScaleItem {
  id: string;
  /** Se true, o valor da resposta é invertido antes de somar (5 - resposta, por exemplo). */
  reverseScored: boolean;
  /** A qual subescala este item pertence, se o instrumento tiver mais de uma. */
  subscale?: string;
}

export interface ClinicalInstrument {
  id: string;
  name: string;
  items: ScaleItem[];
  /** Valor máximo de uma resposta individual (ex.: escala 0–3 = maxValue 3). */
  maxItemValue: number;
  /** Multiplicador aplicado ao total final (padrão 1). */
  scoreMultiplier?: number;
}

export type ItemResponses = Record<string, number>;

/**
 * Exemplo de instrumento com subescalas e multiplicador — estrutura real do
 * DASS-21 simplificada para ilustrar o formato, não o conteúdo exato das
 * 21 perguntas.
 */
export const EXAMPLE_INSTRUMENT: ClinicalInstrument = {
  id: "example-21",
  name: "Instrumento de exemplo (3 subescalas)",
  maxItemValue: 3,
  scoreMultiplier: 2,
  items: [
    { id: "q1", reverseScored: false, subscale: "depressao" },
    { id: "q2", reverseScored: true, subscale: "ansiedade" },
    { id: "q3", reverseScored: false, subscale: "estresse" },
  ],
};

/** Inverte a resposta de um item marcado como `reverseScored`. */
function scoreItem(item: ScaleItem, rawValue: number, maxItemValue: number): number {
  return item.reverseScored ? maxItemValue - rawValue : rawValue;
}

/**
 * Calcula o score total de um instrumento a partir das respostas brutas.
 *
 * Função pura e determinística de propósito: dado o mesmo instrumento e as
 * mesmas respostas, o resultado é sempre igual — o que torna trivial testar
 * cada instrumento isoladamente com casos conhecidos da literatura clínica,
 * sem precisar de banco de dados ou mocks.
 */
export function computeScore(
  instrument: ClinicalInstrument,
  responses: ItemResponses,
): number {
  const total = instrument.items.reduce((sum, item) => {
    const raw = responses[item.id] ?? 0;
    return sum + scoreItem(item, raw, instrument.maxItemValue);
  }, 0);

  return total * (instrument.scoreMultiplier ?? 1);
}

/**
 * Calcula o score de UMA subescala específica (ex.: só "ansiedade" dentro
 * de um instrumento multi-dimensional). Reaproveita a mesma lógica de
 * inversão/multiplicador — a diferença é só o filtro de quais itens entram
 * na soma.
 */
export function computeSubscaleScore(
  instrument: ClinicalInstrument,
  responses: ItemResponses,
  subscale: string,
): number {
  const items = instrument.items.filter((item) => item.subscale === subscale);
  const total = items.reduce((sum, item) => {
    const raw = responses[item.id] ?? 0;
    return sum + scoreItem(item, raw, instrument.maxItemValue);
  }, 0);

  return total * (instrument.scoreMultiplier ?? 1);
}
