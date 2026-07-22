/**
 * Testes de `face-match-live.ts`.
 *
 * Só a parte pura é testável por unidade: `compareDescriptors` e
 * `describeQualityIssue` não dependem de câmera, DOM ou dos modelos do
 * `@vladmandic/face-api`. `loadFaceMatchModels()` e `detectFace()` exigem
 * um navegador real com WebGL e uma câmera — fora do escopo de um teste
 * automatizado; a verificação delas é manual, abrindo a demo no site.
 *
 * Sintaxe Vitest — ver nota em `risk-check-cnpj.test.ts` sobre rodar
 * localmente (este ambiente de portfólio não tem Node).
 */

import { describe, expect, it } from "vitest";
import { compareDescriptors, describeQualityIssue } from "./face-match-live";

function descriptor(...values: number[]): Float32Array {
  return new Float32Array(values);
}

describe("compareDescriptors", () => {
  it("retorna similaridade máxima (1) para descritores idênticos", () => {
    const a = descriptor(0.1, 0.2, 0.3);
    const result = compareDescriptors(a, descriptor(0.1, 0.2, 0.3));

    expect(result.similarity).toBe(1);
    expect(result.approved).toBe(true);
  });

  it("aprova no limiar real de mercado para descritores dlib/face-api.js (distância <= 0.6 => similaridade >= 0.4)", () => {
    // distância euclidiana de 0.6 -> similaridade 1 - 0.6 = 0.4.
    const a = descriptor(0);
    const b = descriptor(0.6);

    const result = compareDescriptors(a, b);

    expect(result.similarity).toBeCloseTo(0.4, 5);
    expect(result.approved).toBe(true);
  });

  it("reprova uma similaridade logo abaixo do limiar", () => {
    const a = descriptor(0);
    const b = descriptor(0.61);

    const result = compareDescriptors(a, b);

    expect(result.approved).toBe(false);
  });

  it("nunca retorna similaridade negativa, mesmo para descritores muito distantes", () => {
    const a = descriptor(0, 0, 0);
    const b = descriptor(5, 5, 5);

    const result = compareDescriptors(a, b);

    expect(result.similarity).toBe(0);
    expect(result.approved).toBe(false);
  });

  it("é simétrica — comparar A com B dá o mesmo resultado que B com A", () => {
    const a = descriptor(0.2, 0.5, 0.1);
    const b = descriptor(0.3, 0.1, 0.4);

    expect(compareDescriptors(a, b).similarity).toBeCloseTo(compareDescriptors(b, a).similarity, 10);
  });

  it("funciona com vetores de 128 posições, o tamanho real de um descritor do face-api", () => {
    const zeros = new Float32Array(128).fill(0);
    const result = compareDescriptors(zeros, zeros);

    expect(result.similarity).toBe(1);
  });
});

describe("describeQualityIssue", () => {
  it("retorna uma mensagem distinta para cada tipo de problema", () => {
    const messages = [
      describeQualityIssue("no_face_detected"),
      describeQualityIssue("multiple_faces_detected"),
      describeQualityIssue("low_confidence"),
      describeQualityIssue("face_too_small"),
    ];

    expect(new Set(messages).size).toBe(4);
  });

  it("orienta a se aproximar da câmera quando o rosto está pequeno demais", () => {
    expect(describeQualityIssue("face_too_small")).toMatch(/aproxime-se/i);
  });
});
