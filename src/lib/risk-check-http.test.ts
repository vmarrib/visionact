/**
 * Testes de `risk-check-http.ts`.
 *
 * Sintaxe Vitest — ver nota em `risk-check-cnpj.test.ts` sobre rodar
 * localmente (este ambiente de portfólio não tem Node). Os testes de
 * `fetchWithRetry` usam delays mínimos (via `options` injetadas) para
 * rodarem rápido, sem precisar de fake timers.
 */

import { describe, expect, it, vi } from "vitest";
import { fetchWithRetry, parseRetryAfterMs, type RetryOptions } from "./risk-check-http";

const FAST_OPTIONS: RetryOptions = { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 };

function response(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

describe("parseRetryAfterMs", () => {
  it("interpreta um valor numérico como segundos", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
  });

  it("interpreta uma data HTTP relativa a 'agora'", () => {
    const now = () => Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:02 GMT", now)).toBe(2000);
  });

  it("retorna null quando o cabeçalho está ausente", () => {
    expect(parseRetryAfterMs(null)).toBeNull();
  });

  it("retorna null para um valor que não é número nem data", () => {
    expect(parseRetryAfterMs("nem-numero-nem-data")).toBeNull();
  });

  it("nunca retorna um valor negativo, mesmo para uma data no passado", () => {
    const now = () => Date.parse("2026-01-01T00:00:10Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:00 GMT", now)).toBe(0);
  });
});

describe("fetchWithRetry", () => {
  it("retorna na primeira tentativa quando não há 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200));

    const result = await fetchWithRetry("https://example.invalid", {}, fetchImpl, FAST_OPTIONS);

    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("tenta de novo após um 429 e retorna o sucesso seguinte", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(429)).mockResolvedValueOnce(response(200));

    const result = await fetchWithRetry("https://example.invalid", {}, fetchImpl, FAST_OPTIONS);

    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("desiste após maxRetries tentativas e retorna o último 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(429));

    const result = await fetchWithRetry("https://example.invalid", {}, fetchImpl, FAST_OPTIONS);

    expect(result.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(FAST_OPTIONS.maxRetries + 1);
  });

  it("não tenta de novo para outros erros (ex.: 500) — só 429 justifica retry automático", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(500));

    const result = await fetchWithRetry("https://example.invalid", {}, fetchImpl, FAST_OPTIONS);

    expect(result.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("respeita o cabeçalho Retry-After quando presente", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(429, { "retry-after": "0" }))
      .mockResolvedValueOnce(response(200));

    const result = await fetchWithRetry("https://example.invalid", {}, fetchImpl, FAST_OPTIONS);

    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
