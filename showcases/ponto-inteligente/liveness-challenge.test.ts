/**
 * Testes de `liveness-challenge.ts`.
 *
 * Sintaxe Vitest — ver nota em `pitaia/ai-context-service.test.ts` sobre
 * rodar estes testes localmente (este ambiente de portfólio não tem Node).
 */

import { describe, expect, it } from "vitest";
import {
  describeChallenge,
  evaluateChallenge,
  pickRandomChallenge,
  type LivenessFrameMetrics,
} from "./liveness-challenge";

function metrics(overrides: Partial<LivenessFrameMetrics> = {}): LivenessFrameMetrics {
  return {
    noseTip: { x: 100, y: 100 },
    rightEyeOuter: { x: 80, y: 80 },
    leftEyeOuter: { x: 120, y: 80 },
    mouthTop: { x: 100, y: 120 },
    mouthBottom: { x: 100, y: 125 },
    happy: 0.05,
    ...overrides,
  };
}

describe("pickRandomChallenge", () => {
  it("é determinístico quando o RNG é injetado", () => {
    expect(pickRandomChallenge(() => 0)).toBe("smile");
    expect(pickRandomChallenge(() => 0.99)).toBe("turn_head");
  });

  it("nunca estoura o índice do array mesmo com random() retornando quase 1", () => {
    expect(() => pickRandomChallenge(() => 0.999999)).not.toThrow();
  });
});

describe("describeChallenge", () => {
  it("retorna uma instrução distinta para cada desafio", () => {
    const messages = [describeChallenge("smile"), describeChallenge("open_mouth"), describeChallenge("turn_head")];
    expect(new Set(messages).size).toBe(3);
  });
});

describe("evaluateChallenge — smile", () => {
  it("aprova quando a expressão feliz sobe claramente acima do limiar", () => {
    const baseline = metrics({ happy: 0.05 });
    const attempt = metrics({ happy: 0.8 });

    expect(evaluateChallenge("smile", baseline, attempt)).toBe(true);
  });

  it("reprova quando a pessoa já está sorrindo no quadro-base (sem mudança real)", () => {
    // Um vídeo em loop de alguém sorrindo o tempo todo não deveria passar
    // só por já estar "feliz" — precisa haver AUMENTO em relação ao base.
    const baseline = metrics({ happy: 0.9 });
    const attempt = metrics({ happy: 0.9 });

    expect(evaluateChallenge("smile", baseline, attempt)).toBe(false);
  });

  it("reprova uma expressão neutra sem sorriso", () => {
    const baseline = metrics({ happy: 0.05 });
    const attempt = metrics({ happy: 0.1 });

    expect(evaluateChallenge("smile", baseline, attempt)).toBe(false);
  });
});

describe("evaluateChallenge — open_mouth", () => {
  it("aprova quando a boca abre significativamente em relação ao quadro-base", () => {
    const baseline = metrics({ mouthTop: { x: 100, y: 120 }, mouthBottom: { x: 100, y: 125 } }); // abertura 5
    const attempt = metrics({ mouthTop: { x: 100, y: 115 }, mouthBottom: { x: 100, y: 135 } }); // abertura 20

    expect(evaluateChallenge("open_mouth", baseline, attempt)).toBe(true);
  });

  it("reprova quando a boca continua praticamente fechada", () => {
    const baseline = metrics({ mouthTop: { x: 100, y: 120 }, mouthBottom: { x: 100, y: 125 } });
    const attempt = metrics({ mouthTop: { x: 100, y: 120 }, mouthBottom: { x: 100, y: 126 } });

    expect(evaluateChallenge("open_mouth", baseline, attempt)).toBe(false);
  });
});

describe("evaluateChallenge — turn_head", () => {
  it("aprova um giro para qualquer lado, sem exigir uma direção específica", () => {
    const baseline = metrics(); // offset 0 (nariz centrado entre os olhos)
    const turnedRight = metrics({
      noseTip: { x: 110, y: 100 },
      rightEyeOuter: { x: 85, y: 80 },
      leftEyeOuter: { x: 125, y: 80 },
    });
    const turnedLeft = metrics({
      noseTip: { x: 90, y: 100 },
      rightEyeOuter: { x: 75, y: 80 },
      leftEyeOuter: { x: 115, y: 80 },
    });

    expect(evaluateChallenge("turn_head", baseline, turnedRight)).toBe(true);
    expect(evaluateChallenge("turn_head", baseline, turnedLeft)).toBe(true);
  });

  it("reprova quando o rosto permanece essencialmente parado (ex.: foto estática)", () => {
    // Este é o caso real que motivou este arquivo: uma foto segurada na
    // frente da câmera não muda de pose entre quadro-base e quadro do
    // desafio.
    const baseline = metrics();
    const stillPhoto = metrics();

    expect(evaluateChallenge("turn_head", baseline, stillPhoto)).toBe(false);
  });

  it("reprova quando a distância entre os olhos no quadro-base é zero (dado inválido)", () => {
    const baseline = metrics({ rightEyeOuter: { x: 100, y: 80 }, leftEyeOuter: { x: 100, y: 80 } });
    const attempt = metrics({ noseTip: { x: 130, y: 100 } });

    expect(evaluateChallenge("turn_head", baseline, attempt)).toBe(false);
  });
});
