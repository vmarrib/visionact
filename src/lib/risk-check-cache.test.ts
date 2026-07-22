/**
 * Testes de `risk-check-cache.ts`.
 *
 * Sintaxe Vitest — ver nota em `risk-check-cnpj.test.ts` sobre rodar
 * localmente (este ambiente de portfólio não tem Node). O relógio é
 * injetado (`now`) para que os testes de expiração não dependam de tempo
 * real de execução.
 */

import { describe, expect, it } from "vitest";
import { TtlCache } from "./risk-check-cache";

function fakeClock(startAt: number) {
  let current = startAt;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("TtlCache", () => {
  it("retorna undefined para uma chave nunca gravada", () => {
    const cache = new TtlCache<string>(1_000);
    expect(cache.get("11222233000183")).toBeUndefined();
  });

  it("retorna o valor gravado enquanto o TTL não expirou", () => {
    const clock = fakeClock(0);
    const cache = new TtlCache<string>(5_000, clock.now);

    cache.set("cnpj-a", "resultado-a");
    clock.advance(4_999);

    expect(cache.get("cnpj-a")).toBe("resultado-a");
  });

  it("expira exatamente no limite do TTL (expiração é inclusiva)", () => {
    const clock = fakeClock(0);
    const cache = new TtlCache<string>(5_000, clock.now);

    cache.set("cnpj-a", "resultado-a");
    clock.advance(5_000);

    expect(cache.get("cnpj-a")).toBeUndefined();
  });

  it("remove a entrada expirada do armazenamento ao ser lida (não vaza memória indefinidamente)", () => {
    const clock = fakeClock(0);
    const cache = new TtlCache<string>(1_000, clock.now);

    cache.set("cnpj-a", "resultado-a");
    clock.advance(1_000);
    cache.get("cnpj-a");

    expect(cache.size).toBe(0);
  });

  it("chaves diferentes não interferem entre si", () => {
    const cache = new TtlCache<string>(10_000);

    cache.set("cnpj-a", "resultado-a");
    cache.set("cnpj-b", "resultado-b");

    expect(cache.get("cnpj-a")).toBe("resultado-a");
    expect(cache.get("cnpj-b")).toBe("resultado-b");
  });

  it("gravar de novo na mesma chave reinicia o TTL a partir do momento da escrita", () => {
    const clock = fakeClock(0);
    const cache = new TtlCache<string>(5_000, clock.now);

    cache.set("cnpj-a", "valor-1");
    clock.advance(4_000);
    cache.set("cnpj-a", "valor-2"); // reescreve antes de expirar
    clock.advance(4_000); // total 8s desde a criação original, mas só 4s desde a reescrita

    expect(cache.get("cnpj-a")).toBe("valor-2");
  });
});
