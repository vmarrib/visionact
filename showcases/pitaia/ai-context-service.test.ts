/**
 * Testes de `ai-context-service.ts`.
 *
 * Sintaxe Vitest (mesmo runner usado no projeto real). Este ambiente de
 * portfólio não tem Node instalado para executar os testes de verdade — ao
 * contrário dos testes Python de `checagem-de-risco/`, que foram rodados e
 * verificados com pytest. Para rodar estes localmente:
 *
 *   npm install --save-dev vitest
 *   npx vitest run ai-context-service.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  buildHealthContext,
  computeTrendSummary,
  serializeContextForPrompt,
  type CheckinRecord,
} from "./ai-context-service";

function checkin(daysAgo: number, mood: number, energy: number, reference: Date): CheckinRecord {
  const date = new Date(reference);
  date.setDate(date.getDate() - daysAgo);
  return {
    date: date.toISOString().slice(0, 10),
    mood,
    energy,
    sleepHours: 7,
    notes: null,
  };
}

const REFERENCE_DATE = new Date("2026-06-01T00:00:00Z");

describe("buildHealthContext", () => {
  it("mantém check-ins dentro da janela de 90 dias", () => {
    const withinWindow = checkin(10, 5, 5, REFERENCE_DATE);
    const context = buildHealthContext([withinWindow], [], REFERENCE_DATE);

    expect(context.checkins).toEqual([withinWindow]);
  });

  it("exclui check-ins mais antigos que a janela — não é 'todo o histórico'", () => {
    const tooOld = checkin(200, 5, 5, REFERENCE_DATE);
    const context = buildHealthContext([tooOld], [], REFERENCE_DATE);

    expect(context.checkins).toEqual([]);
  });

  it("inclui um check-in bem na borda da janela (90 dias exatos)", () => {
    const onEdge = checkin(90, 5, 5, REFERENCE_DATE);
    const context = buildHealthContext([onEdge], [], REFERENCE_DATE);

    expect(context.checkins).toEqual([onEdge]);
  });
});

describe("computeTrendSummary", () => {
  it("retorna vazio com poucos registros — tendência não seria confiável", () => {
    const checkins = [checkin(3, 5, 5, REFERENCE_DATE), checkin(1, 5, 5, REFERENCE_DATE)];

    expect(computeTrendSummary(checkins)).toEqual([]);
  });

  it("classifica como 'melhorando' quando a segunda metade tem média maior", () => {
    const checkins = [
      checkin(8, 3, 3, REFERENCE_DATE),
      checkin(6, 3, 3, REFERENCE_DATE),
      checkin(4, 8, 8, REFERENCE_DATE),
      checkin(2, 8, 8, REFERENCE_DATE),
    ];

    const trends = computeTrendSummary(checkins);
    const mood = trends.find((t) => t.metric === "mood")!;

    expect(mood.direction).toBe("melhorando");
    expect(mood.firstHalfAverage).toBe(3);
    expect(mood.secondHalfAverage).toBe(8);
  });

  it("classifica como 'piorando' quando a segunda metade tem média menor", () => {
    const checkins = [
      checkin(8, 8, 8, REFERENCE_DATE),
      checkin(6, 8, 8, REFERENCE_DATE),
      checkin(4, 2, 2, REFERENCE_DATE),
      checkin(2, 2, 2, REFERENCE_DATE),
    ];

    const trends = computeTrendSummary(checkins);
    expect(trends.find((t) => t.metric === "mood")!.direction).toBe("piorando");
  });

  it("classifica como 'estavel' quando a variação está dentro do limiar de ruído", () => {
    const checkins = [
      checkin(8, 6, 6, REFERENCE_DATE),
      checkin(6, 6.2, 6.2, REFERENCE_DATE),
      checkin(4, 6.1, 6.1, REFERENCE_DATE),
      checkin(2, 6.3, 6.3, REFERENCE_DATE),
    ];

    const trends = computeTrendSummary(checkins);
    // variação de ~0.1 é menor que TREND_NOISE_THRESHOLD (0.5) — não deveria
    // ser reportada como tendência real, mesmo tecnicamente subindo.
    expect(trends.find((t) => t.metric === "mood")!.direction).toBe("estavel");
  });

  it("divide a janela cronologicamente, não por contagem de itens", () => {
    // 3 check-ins recentes (dias 1-3) vs 1 check-in antigo (dia 20) —
    // a divisão correta por METADE CRONOLÓGICA (não por índice) precisa
    // continuar comparando o registro mais antigo contra os mais recentes.
    const checkins = [
      checkin(20, 2, 2, REFERENCE_DATE),
      checkin(3, 9, 9, REFERENCE_DATE),
      checkin(2, 9, 9, REFERENCE_DATE),
      checkin(1, 9, 9, REFERENCE_DATE),
    ];

    const trends = computeTrendSummary(checkins);
    expect(trends.find((t) => t.metric === "mood")!.direction).toBe("melhorando");
  });
});

describe("serializeContextForPrompt", () => {
  it("inclui uma mensagem explícita quando não há check-ins no período", () => {
    const text = serializeContextForPrompt({ checkins: [], workouts: [] });

    expect(text).toContain("sem registros no período");
  });

  it("inclui uma mensagem explícita quando a tendência não pôde ser calculada", () => {
    const text = serializeContextForPrompt({
      checkins: [checkin(1, 5, 5, REFERENCE_DATE)],
      workouts: [],
    });

    expect(text).toContain("dados insuficientes para calcular tendência");
  });

  it("nunca omite um check-in real do texto serializado", () => {
    const record = checkin(1, 7, 6, REFERENCE_DATE);
    const text = serializeContextForPrompt({ checkins: [record], workouts: [] });

    expect(text).toContain(record.date);
    expect(text).toContain("humor=7");
    expect(text).toContain("energia=6");
  });
});
