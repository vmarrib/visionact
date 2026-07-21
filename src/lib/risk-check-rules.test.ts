/**
 * Testes de `risk-check-rules.ts`.
 *
 * Sintaxe Vitest — ver nota em `risk-check-cnpj.test.ts` sobre rodar
 * localmente (este ambiente de portfólio não tem Node).
 */

import { describe, expect, it } from "vitest";
import { evaluateRules, THRESHOLDS, VETO_RULES, WEIGHTED_RULES, type CompanySignals } from "./risk-check-rules";

function signals(overrides: Partial<CompanySignals> = {}): CompanySignals {
  return {
    situacaoAtiva: true,
    mesesDesdeAbertura: 60,
    capitalSocial: 100_000,
    numeroSocios: 2,
    ...overrides,
  };
}

describe("evaluateRules", () => {
  it("retorna TODAS as regras configuradas, não só as que dispararam", () => {
    const result = evaluateRules(signals());

    expect(result.rules).toHaveLength(VETO_RULES.length + WEIGHTED_RULES.length);
    expect(result.rules.every((r) => r.triggered === false)).toBe(true);
  });

  it("aprova uma empresa sem nenhum sinal de risco", () => {
    const result = evaluateRules(signals());

    expect(result.recommendation).toBe("approve");
    expect(result.score).toBe(0);
  });

  it("rejeita automaticamente uma empresa com situação cadastral inativa, mesmo sem outros sinais", () => {
    const result = evaluateRules(signals({ situacaoAtiva: false }));

    expect(result.recommendation).toBe("reject");
    expect(result.score).toBe(1);
    const veto = result.rules.find((r) => r.id === "situacao_inativa");
    expect(veto?.triggered).toBe(true);
    expect(veto?.kind).toBe("veto");
  });

  it("mesmo com veto disparado, ainda retorna a avaliação das regras ponderadas (não disparadas)", () => {
    const result = evaluateRules(signals({ situacaoAtiva: false }));

    const weighted = result.rules.filter((r) => r.kind === "weighted");
    expect(weighted).toHaveLength(WEIGHTED_RULES.length);
    expect(weighted.every((r) => r.triggered === false)).toBe(true);
  });

  it("regras de veto não têm peso — o campo `weight` fica ausente", () => {
    const result = evaluateRules(signals());
    const veto = result.rules.find((r) => r.kind === "veto")!;

    expect(veto.weight).toBeUndefined();
  });

  it("sinaliza empresa recente sem cruzar o limiar de rejeição sozinha", () => {
    const result = evaluateRules(signals({ mesesDesdeAbertura: 2 }));

    // peso 0.4 / soma de pesos (0.4+0.3+0.3=1.0) = 0.4, acima do limiar de
    // manual_review (0.3) definido em THRESHOLDS, abaixo do de reject (0.7).
    expect(result.score).toBeCloseTo(0.4, 5);
    expect(result.recommendation).toBe("manual_review");
    expect(result.rules.find((r) => r.id === "empresa_recente")?.triggered).toBe(true);
  });

  it("combina múltiplos sinais ponderados somando os pesos", () => {
    const result = evaluateRules(signals({ mesesDesdeAbertura: 2, capitalSocial: 0 }));

    // (0.4 + 0.3) / 1.0 = 0.7 -> bate exatamente o limiar de reject.
    expect(result.score).toBeCloseTo(0.7, 5);
    expect(result.recommendation).toBe("reject");
    const triggeredIds = result.rules.filter((r) => r.triggered).map((r) => r.id).sort();
    expect(triggeredIds).toEqual(["capital_social_baixo", "empresa_recente"]);
  });

  it("todos os sinais ponderados disparando resulta em score máximo (1)", () => {
    const result = evaluateRules(signals({ mesesDesdeAbertura: 1, capitalSocial: 0, numeroSocios: 0 }));

    expect(result.score).toBe(1);
    expect(result.recommendation).toBe("reject");
  });

  it("o limiar de manual_review é inclusivo — score exatamente no limiar não vira approve", () => {
    // capital_social_baixo sozinho: 0.3 / 1.0 = 0.3, igual a THRESHOLDS.manualReview.
    const result = evaluateRules(signals({ capitalSocial: 0 }));

    expect(result.score).toBeCloseTo(THRESHOLDS.manualReview, 5);
    expect(result.recommendation).toBe("manual_review");
  });

  it("cada regra carrega o campo e a condição descritos na configuração", () => {
    const result = evaluateRules(signals());
    const empresaRecente = result.rules.find((r) => r.id === "empresa_recente")!;

    expect(empresaRecente.field).toBe("data_inicio_atividade");
    expect(empresaRecente.condition).toContain("6 meses");
  });
});
