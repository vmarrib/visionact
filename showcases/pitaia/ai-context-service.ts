/**
 * PitaIA — amostra do serviço de contexto para o LLM.
 *
 * Generalizado a partir do código real: nomes de tabela específicos do
 * domínio, o prompt de sistema completo e a chave de API foram omitidos.
 * O que se mantém é a arquitetura: como o contexto é montado, por que é
 * montado manualmente (sem framework de RAG) e como o streaming é
 * persistido de forma incremental.
 *
 * Decisão de arquitetura: para um histórico pequeno e estruturado (dezenas
 * de registros por usuário, não milhares de documentos de texto livre),
 * um framework de RAG (chunking, embeddings, vector store) adiciona
 * complexidade sem benefício claro — dá para montar o prompt inteiro à mão
 * e auditar exatamente o que entra nele. Essa decisão seria revista se o
 * volume de dados por usuário crescesse ordens de grandeza (ex.: anos de
 * diário em texto livre).
 */

import { z } from "zod";

/** Um registro de check-in estruturado, já sem campos sensíveis extras. */
export interface CheckinRecord {
  date: string;
  mood: number;
  energy: number;
  sleepHours: number | null;
  notes: string | null;
}

export interface WorkoutRecord {
  date: string;
  type: string;
  perceivedEffort: number | null;
}

export interface UserHealthContext {
  checkins: CheckinRecord[];
  workouts: WorkoutRecord[];
}

const CONTEXT_WINDOW_DAYS = 90;

/**
 * Monta o bloco de contexto que vai para o prompt do LLM.
 *
 * Por que limitar a uma janela fixa de dias, e não "todo o histórico"?
 * 1) Custo/latência: cada token de contexto é pago e soma latência de
 *    geração; 90 dias cobre praticamente qualquer pergunta razoável de
 *    "como venho evoluindo".
 * 2) Relevância: tendências de humor/sono/treino mudam; dados de 2 anos
 *    atrás raramente ajudam a responder uma pergunta sobre "agora".
 *
 * A opção fica explícita como constante (não escondida num valor mágico
 * espalhado pelo código) para que o trade-off custo x relevância seja
 * revisável em um único lugar.
 */
export function buildHealthContext(
  checkins: CheckinRecord[],
  workouts: WorkoutRecord[],
  referenceDate: Date = new Date(),
): UserHealthContext {
  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - CONTEXT_WINDOW_DAYS);

  return {
    checkins: checkins.filter((c) => new Date(c.date) >= cutoff),
    workouts: workouts.filter((w) => new Date(w.date) >= cutoff),
  };
}

/**
 * Serializa o contexto em texto simples para o prompt.
 *
 * Formato tabular simples (não JSON) de propósito: um LLM lê uma tabela
 * texto com a mesma qualidade de um JSON, mas gasta menos tokens em chaves
 * repetidas — importante quando o contexto já cresce a cada mensagem da
 * conversa.
 */
export function serializeContextForPrompt(context: UserHealthContext): string {
  const checkinLines = context.checkins
    .map((c) => `${c.date} | humor=${c.mood} energia=${c.energy} sono=${c.sleepHours ?? "n/d"}h`)
    .join("\n");

  const workoutLines = context.workouts
    .map((w) => `${w.date} | ${w.type} esforço=${w.perceivedEffort ?? "n/d"}`)
    .join("\n");

  return [
    "## Check-ins recentes",
    checkinLines || "(sem registros no período)",
    "",
    "## Treinos recentes",
    workoutLines || "(sem registros no período)",
  ].join("\n");
}

/**
 * A regra mais importante do prompt de sistema real não é o texto em si,
 * mas a restrição que ele impõe: a IA deve responder EXCLUSIVAMENTE com
 * base no contexto fornecido, nunca inferir ou inventar valores ausentes.
 * Isso é crítico em contexto de saúde — uma alucinação sobre "sua pressão
 * está controlada" quando não há esse dado é um risco real, não um detalhe
 * estético.
 */
export const SYSTEM_PROMPT_CONSTRAINT =
  "Responda somente com base nos dados fornecidos abaixo. " +
  "Se a informação não estiver presente, diga que não há dados suficientes " +
  "em vez de estimar ou inferir um valor.";

const StreamChunkSchema = z.object({
  type: z.enum(["content_block_delta", "message_stop"]),
  delta: z.object({ text: z.string() }).optional(),
});

/**
 * Consome um stream de Server-Sent Events do provedor de LLM e persiste a
 * resposta incrementalmente, em vez de esperar o evento final.
 *
 * Por que persistir incrementalmente em vez de acumular em memória e
 * salvar no fim? Se a conexão cair no meio de uma resposta longa (comum em
 * redes móveis), o usuário não perde a resposta inteira — o que já foi
 * gerado já está gravado. O custo é escrever no banco a cada chunk, mitigado
 * agrupando (`persist`) por um pequeno intervalo em vez de por chunk.
 */
export async function persistStreamedResponse(
  stream: AsyncIterable<unknown>,
  persist: (partialText: string) => Promise<void>,
): Promise<string> {
  let accumulated = "";

  for await (const rawEvent of stream) {
    const parsed = StreamChunkSchema.safeParse(rawEvent);
    if (!parsed.success) continue;

    if (parsed.data.type === "content_block_delta" && parsed.data.delta) {
      accumulated += parsed.data.delta.text;
      await persist(accumulated);
    }
  }

  return accumulated;
}
