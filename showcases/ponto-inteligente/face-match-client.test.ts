/**
 * Testes de `face-match-client.ts`.
 *
 * Sintaxe Vitest — ver nota em `pitaia/ai-context-service.test.ts` sobre
 * rodar estes testes localmente (este ambiente de portfólio não tem Node).
 */

import { describe, expect, it, vi } from "vitest";
import { compareFaceDescriptors, prewarmFaceMatchModel, type FaceDescriptor } from "./face-match-client";

function descriptor(...values: number[]): FaceDescriptor {
  return { vector: values };
}

describe("compareFaceDescriptors", () => {
  it("retorna similaridade máxima (1) para descritores idênticos", () => {
    const a = descriptor(0.1, 0.2, 0.3);

    const result = compareFaceDescriptors(a, descriptor(0.1, 0.2, 0.3));

    expect(result.similarity).toBe(1);
    expect(result.approved).toBe(true);
  });

  it("aprova quando a similaridade está exatamente no limiar", () => {
    // distância euclidiana de 0.4 -> similaridade 1 - 0.4 = 0.6, igual ao
    // limiar de exemplo — o limite é inclusivo (>=), não exclusivo.
    const a = descriptor(0);
    const b = descriptor(0.4);

    const result = compareFaceDescriptors(a, b);

    expect(result.similarity).toBeCloseTo(0.6, 5);
    expect(result.approved).toBe(true);
  });

  it("reprova quando a distância é grande o suficiente para zerar a similaridade", () => {
    // distância > 1 faria a similaridade crua ficar negativa; o clamp em
    // Math.max(0, ...) garante que o valor reportado nunca seja negativo.
    const a = descriptor(0, 0, 0);
    const b = descriptor(5, 5, 5);

    const result = compareFaceDescriptors(a, b);

    expect(result.similarity).toBe(0);
    expect(result.approved).toBe(false);
  });

  it("é simétrica — comparar A com B dá o mesmo resultado que B com A", () => {
    const a = descriptor(0.2, 0.5, 0.1);
    const b = descriptor(0.3, 0.1, 0.4);

    expect(compareFaceDescriptors(a, b).similarity).toBeCloseTo(
      compareFaceDescriptors(b, a).similarity,
      10,
    );
  });
});

describe("prewarmFaceMatchModel", () => {
  it("carrega o modelo ANTES de rodar a inferência de aquecimento, nessa ordem", () => {
    const callOrder: string[] = [];
    const loadModel = vi.fn(async () => {
      callOrder.push("load");
    });
    const runDummyInference = vi.fn(async () => {
      callOrder.push("warmup");
    });

    return prewarmFaceMatchModel(loadModel, runDummyInference).then((result) => {
      expect(callOrder).toEqual(["load", "warmup"]);
      expect(result).toEqual({ loaded: true, warmedUp: true });
    });
  });
});
