/**
 * Testes de `face-match-pipeline.ts`.
 *
 * Sintaxe Vitest — ver nota em `pitaia/ai-context-service.test.ts` sobre
 * rodar estes testes localmente (este ambiente de portfólio não tem Node).
 */

import { describe, expect, it } from "vitest";
import {
  assessFaceQuality,
  enrollReferenceFace,
  verifyLiveFace,
  type DetectedFace,
  type FaceDetectionModels,
} from "./face-match-pipeline";

function face(overrides: Partial<DetectedFace> = {}): DetectedFace {
  return {
    confidence: 0.95,
    box: { x: 0, y: 0, width: 200, height: 200 },
    landmarks: [],
    descriptor: { vector: [0.1, 0.2, 0.3] },
    ...overrides,
  };
}

const FRAME_WIDTH = 1000;

describe("assessFaceQuality", () => {
  it("aprova (retorna null) para exatamente um rosto de boa qualidade", () => {
    expect(assessFaceQuality([face()], FRAME_WIDTH)).toBeNull();
  });

  it("rejeita quando nenhum rosto é detectado", () => {
    expect(assessFaceQuality([], FRAME_WIDTH)).toBe("no_face_detected");
  });

  it("rejeita quando mais de um rosto aparece no quadro", () => {
    expect(assessFaceQuality([face(), face()], FRAME_WIDTH)).toBe("multiple_faces_detected");
  });

  it("rejeita quando a confiança de detecção está abaixo do limiar", () => {
    expect(assessFaceQuality([face({ confidence: 0.5 })], FRAME_WIDTH)).toBe("low_confidence");
  });

  it("rejeita quando o rosto ocupa uma fatia pequena demais do quadro", () => {
    // 100/1000 = 10% do frame, abaixo do mínimo de 15%.
    const small = face({ box: { x: 0, y: 0, width: 100, height: 100 } });

    expect(assessFaceQuality([small], FRAME_WIDTH)).toBe("face_too_small");
  });

  it("aprova um rosto exatamente na borda do tamanho mínimo aceitável (15%)", () => {
    const atEdge = face({ box: { x: 0, y: 0, width: 150, height: 150 } });

    expect(assessFaceQuality([atEdge], FRAME_WIDTH)).toBeNull();
  });

  it("prioriza 'no_face_detected' sobre outros problemas quando não há rosto algum", () => {
    // Não há como avaliar confiança/tamanho de um rosto que não existe —
    // a ordem de checagem importa para a mensagem fazer sentido.
    expect(assessFaceQuality([], FRAME_WIDTH)).toBe("no_face_detected");
  });
});

describe("enrollReferenceFace", () => {
  it("retorna o descritor quando a imagem de referência tem boa qualidade", async () => {
    const goodFace = face();
    const models: FaceDetectionModels = { detectFaces: async () => [goodFace] };

    const result = await enrollReferenceFace(models, { width: FRAME_WIDTH } as ImageBitmap);

    expect("descriptor" in result && result.descriptor).toEqual(goodFace.descriptor);
  });

  it("recusa o cadastro quando a imagem de referência tem qualidade ruim", async () => {
    // Uma referência de baixa qualidade comprometeria TODAS as
    // verificações futuras contra ela — recusar no cadastro é mais barato
    // que descobrir isso depois de meses de falsos negativos.
    const models: FaceDetectionModels = { detectFaces: async () => [] };

    const result = await enrollReferenceFace(models, { width: FRAME_WIDTH } as ImageBitmap);

    expect("error" in result && result.error).toBe("no_face_detected");
  });
});

describe("verifyLiveFace", () => {
  const referenceDescriptor = { vector: [0.1, 0.2, 0.3] };

  it("compara contra a referência quando a captura ao vivo tem boa qualidade", async () => {
    const models: FaceDetectionModels = {
      detectFaces: async () => [face({ descriptor: referenceDescriptor })],
    };

    const result = await verifyLiveFace(models, { videoWidth: FRAME_WIDTH } as HTMLVideoElement, referenceDescriptor);

    expect(result.qualityIssue).toBeNull();
    expect(result.approved).toBe(true);
    expect(result.similarity).toBe(1);
  });

  it("nunca chega a comparar descritores quando a qualidade da captura falha", async () => {
    // Reprovado por 'multiple_faces_detected' precisa ser distinguível de
    // reprovado por baixa similaridade — são causas diferentes, ações
    // diferentes para o usuário corrigir.
    const models: FaceDetectionModels = {
      detectFaces: async () => [face(), face()],
    };

    const result = await verifyLiveFace(models, { videoWidth: FRAME_WIDTH } as HTMLVideoElement, referenceDescriptor);

    expect(result.qualityIssue).toBe("multiple_faces_detected");
    expect(result.approved).toBe(false);
  });
});
