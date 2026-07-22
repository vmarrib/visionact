/**
 * Checagem de Risco (demo ao vivo) — cache de curta duração para o
 * resultado por CNPJ.
 *
 * Motivação real, não hipotética: a BrasilAPI é uma API pública gratuita
 * sem chave, com limite de requisições compartilhado entre TODOS os
 * visitantes do portfólio ao mesmo tempo — um HTTP 429 nela não é um bug da
 * demo, é o provedor pedindo para esperar. Cachear o resultado de um CNPJ
 * já consultado recentemente reduz a chance de qualquer visitante esbarrar
 * no limite só porque outra pessoa consultou o mesmo CNPJ (ex.: o exemplo
 * do placeholder) minutos antes.
 *
 * Trade-off documentado, não escondido: este cache vive na memória do
 * processo do servidor. Em ambientes serverless/edge (ex.: Cloudflare
 * Workers), uma instância "fria" nova começa sem cache — funciona como
 * otimização de melhor esforço dentro de uma instância already-warm, não
 * como uma garantia de cache distribuído. Para isso, seria necessário um
 * cache externo (Redis, KV) — decisão deliberadamente fora do escopo desta
 * demo de portfólio.
 */

export class TtlCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (this.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  /** Número de entradas ainda armazenadas (expiradas ou não) — usado só em testes. */
  get size(): number {
    return this.store.size;
  }
}
