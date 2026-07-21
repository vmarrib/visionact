/**
 * Testes de `clinical-scoring.ts`.
 *
 * Sintaxe Vitest — ver nota em `ai-context-service.test.ts` sobre rodar
 * estes testes localmente (este ambiente de portfólio não tem Node).
 */

import { describe, expect, it } from "vitest";
import { computeScore, computeSubscaleScore, type ClinicalInstrument } from "./clinical-scoring";

describe("computeScore", () => {
  it("soma respostas diretamente quando nenhum item é invertido", () => {
    const instrument: ClinicalInstrument = {
      id: "simple",
      name: "Instrumento simples",
      maxItemValue: 3,
      items: [
        { id: "q1", reverseScored: false },
        { id: "q2", reverseScored: false },
      ],
    };

    const score = computeScore(instrument, { q1: 2, q2: 3 });

    expect(score).toBe(5);
  });

  it("inverte itens marcados como reverseScored antes de somar", () => {
    // Numa escala 0-3, uma resposta 0 num item invertido conta como 3 —
    // esse é o comportamento central que justifica a existência do campo.
    const instrument: ClinicalInstrument = {
      id: "with-reverse",
      name: "Com item invertido",
      maxItemValue: 3,
      items: [
        { id: "q1", reverseScored: false },
        { id: "q2", reverseScored: true },
      ],
    };

    const score = computeScore(instrument, { q1: 2, q2: 0 });

    // q1 conta 2 (direto); q2 conta (3 - 0) = 3 invertido. Total = 5.
    expect(score).toBe(5);
  });

  it("aplica o multiplicador final sobre a soma, não item a item", () => {
    const instrument: ClinicalInstrument = {
      id: "with-multiplier",
      name: "Com multiplicador",
      maxItemValue: 3,
      scoreMultiplier: 2,
      items: [
        { id: "q1", reverseScored: false },
        { id: "q2", reverseScored: false },
      ],
    };

    const score = computeScore(instrument, { q1: 1, q2: 1 });

    expect(score).toBe((1 + 1) * 2);
  });

  it("trata uma resposta ausente como zero, sem lançar erro", () => {
    // Um item não respondido não deveria travar o cálculo do instrumento
    // inteiro — o comportamento esperado é contar como 0, não NaN/exceção.
    const instrument: ClinicalInstrument = {
      id: "missing-answer",
      name: "Resposta faltando",
      maxItemValue: 3,
      items: [{ id: "q1", reverseScored: false }],
    };

    const score = computeScore(instrument, {});

    expect(score).toBe(0);
  });
});

describe("computeSubscaleScore", () => {
  const instrument: ClinicalInstrument = {
    id: "multi-subscale",
    name: "Instrumento com subescalas",
    maxItemValue: 3,
    scoreMultiplier: 2,
    items: [
      { id: "q1", reverseScored: false, subscale: "depressao" },
      { id: "q2", reverseScored: true, subscale: "ansiedade" },
      { id: "q3", reverseScored: false, subscale: "depressao" },
    ],
  };

  it("considera só os itens da subescala pedida", () => {
    const score = computeSubscaleScore(instrument, { q1: 1, q2: 0, q3: 2 }, "depressao");

    // Só q1 (1) e q3 (2) pertencem a 'depressao'; q2 é ignorado mesmo
    // tendo uma resposta. Soma = 3, multiplicador 2 -> 6.
    expect(score).toBe((1 + 2) * 2);
  });

  it("aplica o mesmo multiplicador do instrumento também na subescala", () => {
    const score = computeSubscaleScore(instrument, { q2: 0 }, "ansiedade");

    // q2 é invertido (maxItemValue 3, resposta 0 -> conta 3), multiplicador 2 -> 6.
    expect(score).toBe(3 * 2);
  });

  it("retorna zero para uma subescala sem nenhum item correspondente", () => {
    const score = computeSubscaleScore(instrument, { q1: 3 }, "subescala-inexistente");

    expect(score).toBe(0);
  });
});
