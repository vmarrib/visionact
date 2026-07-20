/**
 * Ponto Inteligente — amostra do pipeline completo de reconhecimento facial.
 *
 * Enquanto `face-match-client.ts` cobre a MATEMÁTICA da comparação
 * (distância entre dois descritores já extraídos), este arquivo cobre o
 * PIPELINE que produz esses descritores a partir de uma imagem de câmera:
 * detecção → checagem de qualidade → landmarks → descritor facial.
 *
 * A API usada aqui espelha a de bibliotecas de reconhecimento facial que
 * rodam client-side via TensorFlow.js (ex.: modelos de detecção leve +
 * landmarks 68 pontos + rede de descritor facial), sem depender de nenhuma
 * chamada a um serviço externo.
 */

import { compareFaceDescriptors, type FaceDescriptor, type FaceMatchResult } from "./face-match-client";

export interface DetectedFace {
  /** Confiança da detecção (0 a 1) — quão certo o modelo está de que há um rosto ali. */
  confidence: number;
  /** Caixa delimitadora do rosto na imagem, em pixels. */
  box: { x: number; y: number; width: number; height: number };
  /** 68 pontos de referência facial (olhos, nariz, boca, contorno). */
  landmarks: Array<{ x: number; y: number }>;
  descriptor: FaceDescriptor;
}

export interface FaceDetectionModels {
  detectFaces(image: ImageBitmap | HTMLVideoElement): Promise<DetectedFace[]>;
}

const MIN_DETECTION_CONFIDENCE = 0.8;

/**
 * Erros de qualidade que impedem uma tentativa de seguir adiante — cada um
 * vira uma mensagem específica para o usuário corrigir (ex.: "aproxime o
 * rosto"), em vez de um "falhou" genérico.
 */
export type FaceQualityIssue =
  | "no_face_detected"
  | "multiple_faces_detected"
  | "low_confidence"
  | "face_too_small";

/**
 * Checagem de qualidade ANTES de extrair o descritor — evitar processar (e
 * eventualmente comparar) uma captura ruim é mais barato do que comparar e
 * só descobrir depois que a imagem era inutilizável.
 *
 * Por que rejeitar múltiplos rostos, não só escolher o maior? Um recorte de
 * fundo com outra pessoa passando atrás do funcionário é exatamente o tipo
 * de ambiguidade que não deveria ser resolvida silenciosamente "escolhendo
 * um" — a tentativa é rejeitada e o funcionário tenta de novo com a câmera
 * enquadrando só o próprio rosto.
 */
export function assessFaceQuality(
  faces: DetectedFace[],
  frameWidth: number,
): FaceQualityIssue | null {
  if (faces.length === 0) return "no_face_detected";
  if (faces.length > 1) return "multiple_faces_detected";

  const [face] = faces;
  if (face.confidence < MIN_DETECTION_CONFIDENCE) return "low_confidence";

  // Um rosto ocupando uma fatia pequena demais do frame produz um
  // descritor menos confiável (poucos pixels de detalhe facial).
  const MIN_FACE_WIDTH_RATIO = 0.15;
  if (face.box.width / frameWidth < MIN_FACE_WIDTH_RATIO) return "face_too_small";

  return null;
}

export interface EnrollmentResult {
  descriptor: FaceDescriptor;
}

/**
 * Cadastro do rosto de referência do funcionário (feito uma vez, na
 * admissão). A mesma checagem de qualidade da verificação é aplicada aqui —
 * uma referência de baixa qualidade compromete todas as comparações
 * futuras contra ela.
 */
export async function enrollReferenceFace(
  models: FaceDetectionModels,
  referenceImage: ImageBitmap,
): Promise<EnrollmentResult | { error: FaceQualityIssue }> {
  const faces = await models.detectFaces(referenceImage);
  const issue = assessFaceQuality(faces, referenceImage.width);

  if (issue) return { error: issue };

  return { descriptor: faces[0].descriptor };
}

export interface VerificationResult extends FaceMatchResult {
  qualityIssue: FaceQualityIssue | null;
}

/**
 * Fluxo completo de verificação no momento da batida de ponto: detecta o
 * rosto na captura ao vivo, checa qualidade, extrai o descritor e compara
 * contra a referência cadastrada.
 *
 * Retorna sempre um resultado (nunca lança exceção para o caso "não achei
 * rosto") — um problema de qualidade é um resultado esperado do fluxo, não
 * uma condição excepcional, e a UI precisa diferenciar "reprovado por
 * similaridade baixa" de "não consegui nem tentar comparar".
 */
export async function verifyLiveFace(
  models: FaceDetectionModels,
  liveFrame: HTMLVideoElement,
  referenceDescriptor: FaceDescriptor,
): Promise<VerificationResult> {
  const faces = await models.detectFaces(liveFrame);
  const qualityIssue = assessFaceQuality(faces, liveFrame.videoWidth);

  if (qualityIssue) {
    return { similarity: 0, approved: false, qualityIssue };
  }

  const result = compareFaceDescriptors(faces[0].descriptor, referenceDescriptor);
  return { ...result, qualityIssue: null };
}
