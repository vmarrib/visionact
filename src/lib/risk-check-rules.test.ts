/**
 * Testes de `risk-check-rules.ts`.
 *
 * Sintaxe Vitest — ver nota em `risk-check-cnpj.test.ts` sobre rodar
 * localmente (este ambiente de portfólio não tem Node).
 */

import { describe, expect, it } from "vitest";
import { evaluateRules, THRESHOLDS, type CompanySignals } from "./risk-check-rules";

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
  it("aprova uma empresa sem nenhum sinal de risco", () => {
    const result = evaluateRules(signals());

    expect(result.recommendation).toBe("approve");
    expect(result.score).toBe(0);
    expect(result.flaggedRules).toEqual([]);
  });

  it("rejeita automaticamente uma empresa com situação cadastral inativa, mesmo sem outros sinais", () => {
    const result = evaluateRules(signals({ situacaoAtiva: false }));

    expect(result.recommendation).toBe("reject");
    expect(result.score).toBe(1);
    expect(result.flaggedRules.map((r) => r.id)).toEqual(["situacao_inativa"]);
  });

  it("o veto de situação inativa ignora os outros sinais ponderados — nenhum vira flag junto", () => {
    const result = evaluateRules(signals({ situacaoAtiva: false, capitalSocial: 0, numeroSocios: 0 }));

    // Só o veto aparece — os sinais ponderados nem são avaliados quando um veto dispara.
    expect(result.flaggedRules).toHaveLength(1);
  });

  it("sinaliza empresa recente sem cruzar o limiar de revisão manual sozinha", () => {
    const result = evaluateRules(signals({ mesesDesdeAbertura: 2 }));

    // peso 0.4 / soma de pesos (0.4+0.3+0.3=1.0) = 0.4, acima do limiar de
    // manual_review (0.3) definido em THRESHOLDS.
    expect(result.score).toBeCloseTo(0.4, 5);
    expect(result.recommendation).toBe("manual_review");
    expect(result.flaggedRules.map((r) => r.id)).toEqual(["empresa_recente"]);
  });

  it("combina múltiplos sinais ponderados somando os pesos", () => {
    const result = evaluateRules(signals({ mesesDesdeAbertura: 2, capitalSocial: 0 }));

    // (0.4 + 0.3) / 1.0 = 0.7 -> bate exatamente o limiar de reject.
    expect(result.score).toBeCloseTo(0.7, 5);
    expect(result.recommendation).toBe("reject");
    expect(result.flaggedRules.map((r) => r.id).sort()).toEqual(["capital_social_baixo", "empresa_recente"]);
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

  it("nenhum sócio registrado, isoladamente, não é motivo de rejeição automática", () => {
    const result = evaluateRules(signals({ numeroSocios: 0 }));

    expect(result.recommendation).toBe("manual_review");
    expect(result.flaggedRules.map((r) => r.id)).toEqual(["sem_socios_registrados"]);
  });
});
