/**
 * Checagem de Risco (demo ao vivo) — retry com backoff para a BrasilAPI.
 *
 * Motivação real: em produção (hospedado no Lovable/Cloudflare), a demo
 * recebeu 429 da BrasilAPI mesmo com o cache de 5 minutos já em vigor —
 * plataformas serverless costumam compartilhar um pool pequeno de IPs de
 * saída entre vários apps, então o limite de requisições da API pública
 * pode estar sendo atingido pelo tráfego agregado da infraestrutura, não
 * só por esta demo. Não dá para eliminar isso (é limite do provedor
 * gratuito), mas dá para tentar de novo antes de desistir.
 */

/**
 * Interpreta o cabeçalho `Retry-After` de uma resposta HTTP 429, que pode
 * vir como segundos (`"2"`) ou como uma data HTTP (`"Wed, 21 Oct 2026
 * 07:28:00 GMT"`) — o padrão RFC 7231 permite os dois formatos, e nem toda
 * API escolhe o mesmo.
 */
export function parseRetryAfterMs(header: string | null, now: () => number = Date.now): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (!Number.isNaN(seconds) && header.trim() !== "") {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - now());
  }

  return null;
}

export interface RetryOptions {
  /** Número de tentativas ADICIONAIS após a primeira (2 = até 3 chamadas no total). */
  maxRetries: number;
  /** Base do backoff exponencial quando a resposta não traz Retry-After. */
  baseDelayMs: number;
  /** Teto de espera — mesmo que o servidor peça mais, não vale a pena travar a demo por tanto tempo. */
  maxDelayMs: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 800,
  maxDelayMs: 4000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chama `fetchImpl` e, se a resposta vier 429, espera (Retry-After se
 * presente, senão backoff exponencial) e tenta de novo, até `maxRetries`
 * vezes. Qualquer outro status (200, 404, 500...) retorna imediatamente —
 * só 429 justifica tentar de novo automaticamente.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS,
): Promise<Response> {
  let response = await fetchImpl(url, init);

  for (let attempt = 0; attempt < options.maxRetries && response.status === 429; attempt++) {
    const retryAfter = parseRetryAfterMs(response.headers.get("retry-after"));
    const delay = Math.min(retryAfter ?? options.baseDelayMs * 2 ** attempt, options.maxDelayMs);

    await sleep(delay);
    response = await fetchImpl(url, init);
  }

  return response;
}
