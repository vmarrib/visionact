/**
 * Due Check — amostra do padrão adapter para fontes de dados externas.
 *
 * Generalizado a partir do código real: os nomes e endpoints reais das
 * fontes públicas foram substituídos por exemplos genéricos ("registry",
 * "sanctions-list", "court-records"), mas a estrutura de adapter e o
 * tratamento de falha parcial são os mesmos usados em produção.
 *
 * Decisão de arquitetura: cada fonte externa tem seu próprio formato de
 * resposta, autenticação e modo de falha. Sem um adapter comum, cada nova
 * integração viraria um `if/else` a mais dentro do motor de regras,
 * misturando "como consultar a fonte X" com "o que fazer com o resultado".
 * A interface `BureauAdapter` isola essa excentricidade: o motor de regras
 * só enxerga `BureauResult`, nunca o formato bruto de cada API.
 */

export interface BureauContext {
  documentId: string; // CPF/CNPJ ou identificador equivalente, já validado
  orgId: string;
}

export type BureauStatus = "match_found" | "no_match" | "unavailable";

export interface BureauResult {
  bureauId: string;
  status: BureauStatus;
  /** Dados brutos relevantes, já normalizados para um formato comum. */
  data?: Record<string, unknown>;
  /** Presente quando status === "unavailable" — motivo da falha. */
  errorReason?: string;
}

export interface BureauAdapter {
  id: string;
  run(context: BureauContext): Promise<BureauResult>;
}

/**
 * Timeout individual por fonte. Cada fonte externa tem seu próprio adapter
 * concreto (omitido aqui); o que se mantém aqui é o CONTRATO comum entre
 * elas — o dispatcher abaixo não sabe nem precisa saber os detalhes de cada
 * API real.
 */
const BUREAU_TIMEOUT_MS = 15_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, bureauId: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`timeout: ${bureauId}`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

/**
 * Consulta múltiplos bureaus em paralelo e nunca deixa uma fonte lenta ou
 * fora do ar derrubar as demais.
 *
 * `Promise.allSettled` em vez de `Promise.all`: com `Promise.all`, a
 * primeira fonte que rejeitar cancela a interpretação das outras respostas
 * (mesmo que já tenham chegado). Como um dossiê parcial (6 de 8 fontes) já
 * é útil para o usuário, cada falha vira um resultado `unavailable`
 * explícito, não uma exceção que aborta a análise inteira.
 */
export async function runBureauChecks(
  adapters: BureauAdapter[],
  context: BureauContext,
): Promise<BureauResult[]> {
  const settled = await Promise.allSettled(
    adapters.map((adapter) => withTimeout(adapter.run(context), BUREAU_TIMEOUT_MS, adapter.id)),
  );

  return settled.map((outcome, i) => {
    if (outcome.status === "fulfilled") return outcome.value;

    return {
      bureauId: adapters[i].id,
      status: "unavailable" as const,
      errorReason: outcome.reason instanceof Error ? outcome.reason.message : "erro desconhecido",
    };
  });
}

/**
 * Adapter de exemplo: uma fonte que pode exigir duas chamadas paralelas
 * internas antes de consolidar um resultado (padrão real de algumas fontes
 * de sanções, que separam "lista ativa" de "lista histórica").
 */
export function createExampleDualCallAdapter(id: string): BureauAdapter {
  return {
    id,
    async run(context) {
      const [activeListHit, historicalListHit] = await Promise.allSettled([
        checkAgainstList(context.documentId, "active"),
        checkAgainstList(context.documentId, "historical"),
      ]);

      const hit =
        (activeListHit.status === "fulfilled" && activeListHit.value) ||
        (historicalListHit.status === "fulfilled" && historicalListHit.value);

      return {
        bureauId: id,
        status: hit ? "match_found" : "no_match",
      };
    },
  };
}

// Stub ilustrativo — na versão real, cada lista é uma chamada HTTP autenticada.
async function checkAgainstList(_documentId: string, _list: "active" | "historical"): Promise<boolean> {
  return false;
}
