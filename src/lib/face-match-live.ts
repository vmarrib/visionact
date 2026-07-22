/**
 * Ponto Inteligente — reconhecimento facial rodando DE VERDADE no navegador
 * de quem está vendo o portfólio, não no servidor do site.
 *
 * Mesmo pipeline de 3 estágios documentado em
 * `showcases/ponto-inteligente/` (TinyFaceDetector → FaceLandmark68Net →
 * FaceRecognitionNet), mesmos limiares calibrados lá
 * (`face-match-pipeline.ts`, `threshold_calibration.py`) — esta versão só
 * troca o showcase estático por uma chamada real à biblioteca
 * `@vladmandic/face-api`, a mesma usada no projeto real. Um quarto modelo
 * (FaceExpressionNet, ~310 KB) foi adicionado para a prova de vivacidade —
 * ver `analyzeLiveFrame` e `showcases/ponto-inteligente/liveness-challenge.ts`.
 *
 * Os pesos dos modelos (~7 MB no total) são carregados de um CDN público
 * (jsdelivr, servindo o próprio pacote npm) na primeira vez que a demo é
 * aberta — não ficam embutidos no bundle do site para não pesar no
 * carregamento de quem só quer ler as outras páginas do portfólio.
 *
 * Import dinâmico de propósito: `@vladmandic/face-api` usa WebGL/Canvas,
 * que só existem no navegador — importar no topo do arquivo quebraria a
 * renderização no servidor (SSR) do TanStack Start.
 */

import type { LivenessFrameMetrics } from "./liveness-challenge";

export { describeChallenge, evaluateChallenge, pickRandomChallenge, type LivenessChallenge } from "./liveness-challenge";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

let faceapiModule: typeof import("@vladmandic/face-api") | null = null;
let loadPromise: Promise<void> | null = null;

/** Idempotente: chamar várias vezes só carrega os modelos uma vez. */
export function loadFaceMatchModels(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const faceapi = await import("@vladmandic/face-api");

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);

    faceapiModule = faceapi;
  })();

  return loadPromise;
}

export type FaceQualityIssue = "no_face_detected" | "multiple_faces_detected" | "low_confidence" | "face_too_small";

export interface FaceDetectionOutcome {
  descriptor: Float32Array;
  qualityIssue: null;
}

export interface FaceDetectionFailure {
  descriptor: null;
  qualityIssue: FaceQualityIssue;
}

// O showcase (face-match-pipeline.ts) usa 0.8 — valor pensado para uma
// captura curada, em condições controladas. Ao vivo, webcams reais em luz
// de ambiente comum frequentemente pontuam o TinyFaceDetector entre 0.5 e
// 0.8 mesmo com o rosto bem visível — 0.8 rejeitava capturas legítimas com
// frequência demais para uma demo pública. Relaxado aqui de propósito;
// divergência documentada, não silenciosa.
const MIN_DETECTION_CONFIDENCE = 0.5;
const MIN_FACE_WIDTH_RATIO = 0.15;

function getFrameWidth(input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): number {
  if (input instanceof HTMLVideoElement) return input.videoWidth;
  if (input instanceof HTMLImageElement) return input.naturalWidth || input.width;
  return input.width;
}

/**
 * Detecta um rosto na imagem/quadro fornecido e aplica a MESMA checagem de
 * qualidade do showcase (`assessFaceQuality`) antes de aceitar o
 * descritor — rejeitar aqui é o pipeline funcionando como projetado, não
 * um erro da demo.
 */
export async function detectFace(
  input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<FaceDetectionOutcome | FaceDetectionFailure> {
  if (!faceapiModule) {
    throw new Error("loadFaceMatchModels() precisa ser chamado (e aguardado) antes de detectFace().");
  }

  const detections = await faceapiModule
    .detectAllFaces(input, new faceapiModule.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (detections.length === 0) {
    return { descriptor: null, qualityIssue: "no_face_detected" };
  }
  if (detections.length > 1) {
    return { descriptor: null, qualityIssue: "multiple_faces_detected" };
  }

  const [face] = detections;

  if (face.detection.score < MIN_DETECTION_CONFIDENCE) {
    return { descriptor: null, qualityIssue: "low_confidence" };
  }
  if (face.detection.box.width / getFrameWidth(input) < MIN_FACE_WIDTH_RATIO) {
    return { descriptor: null, qualityIssue: "face_too_small" };
  }

  return { descriptor: face.descriptor, qualityIssue: null };
}

export interface LiveFrameAnalysis {
  descriptor: Float32Array;
  metrics: LivenessFrameMetrics;
}

export interface LiveFrameAnalysisOutcome {
  analysis: LiveFrameAnalysis;
  qualityIssue: null;
}

export interface LiveFrameAnalysisFailure {
  analysis: null;
  qualityIssue: FaceQualityIssue;
}

// Índices no esquema padrão de 68 pontos (iBUG 300-W) — ver
// showcases/ponto-inteligente/liveness-challenge.ts para o porquê de cada um.
const LANDMARK_NOSE_TIP = 30;
const LANDMARK_RIGHT_EYE_OUTER = 36;
const LANDMARK_LEFT_EYE_OUTER = 45;
const LANDMARK_MOUTH_TOP_INNER = 62;
const LANDMARK_MOUTH_BOTTOM_INNER = 66;

/**
 * Mesma detecção de `detectFace`, mas também extrai expressão e os pontos
 * de referência usados pelo desafio de vivacidade — usada nos quadros da
 * câmera ao vivo (nunca na foto de referência, que não precisa "sorrir
 * sob comando").
 */
export async function analyzeLiveFrame(
  input: HTMLCanvasElement | HTMLVideoElement,
): Promise<LiveFrameAnalysisOutcome | LiveFrameAnalysisFailure> {
  if (!faceapiModule) {
    throw new Error("loadFaceMatchModels() precisa ser chamado (e aguardado) antes de analyzeLiveFrame().");
  }

  const detections = await faceapiModule
    .detectAllFaces(input, new faceapiModule.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceExpressions()
    .withFaceDescriptors();

  if (detections.length === 0) {
    return { analysis: null, qualityIssue: "no_face_detected" };
  }
  if (detections.length > 1) {
    return { analysis: null, qualityIssue: "multiple_faces_detected" };
  }

  const [face] = detections;

  if (face.detection.score < MIN_DETECTION_CONFIDENCE) {
    return { analysis: null, qualityIssue: "low_confidence" };
  }
  if (face.detection.box.width / getFrameWidth(input) < MIN_FACE_WIDTH_RATIO) {
    return { analysis: null, qualityIssue: "face_too_small" };
  }

  const points = face.landmarks.positions;

  return {
    analysis: {
      descriptor: face.descriptor,
      metrics: {
        noseTip: points[LANDMARK_NOSE_TIP],
        rightEyeOuter: points[LANDMARK_RIGHT_EYE_OUTER],
        leftEyeOuter: points[LANDMARK_LEFT_EYE_OUTER],
        mouthTop: points[LANDMARK_MOUTH_TOP_INNER],
        mouthBottom: points[LANDMARK_MOUTH_BOTTOM_INNER],
        happy: face.expressions.happy,
      },
    },
    qualityIssue: null,
  };
}

export function describeQualityIssue(issue: FaceQualityIssue): string {
  switch (issue) {
    case "no_face_detected":
      return "Nenhum rosto detectado — aproxime-se e garanta boa iluminação.";
    case "multiple_faces_detected":
      return "Mais de um rosto no quadro — enquadre só o seu rosto.";
    case "low_confidence":
      return "Confiança de detecção baixa — melhore a iluminação e olhe para a câmera.";
    case "face_too_small":
      return "Rosto pequeno demais no enquadramento — aproxime-se da câmera.";
  }
}

/**
 * Limiar de decisão — CORRIGIDO após observar falsos negativos reais nesta
 * demo (a mesma pessoa sendo reprovada com similaridade ~0.50).
 *
 * O motivo: `threshold_calibration.py` no showcase calibra o método
 * FAR/FRR/Equal Error Rate sobre uma distribuição SIMULADA (para ensinar a
 * técnica de forma abstrata) — o valor que ela produz (~0.65 nesta escala)
 * não é uma medida real da distribuição de distâncias do
 * `@vladmandic/face-api`. Para descritores reais de 128 dimensões desta
 * família de modelo (dlib / face-api.js), a referência amplamente adotada
 * pela comunidade é distância euclidiana <= 0.6 para "mesma pessoa" — que,
 * nesta escala de similaridade (1 - distância), corresponde a >= 0.4.
 *
 * Para comparação de mercado: sistemas bancários/KYC mira taxas de falsa
 * aceitação (FAR) de 0.001%-0.1%, com modelos proprietários multi-modais
 * (infravermelho, prova de vida) muito além do que um descritor de 128
 * números rodando no navegador consegue garantir sozinho — este é um
 * modelo de classe "controle de acesso/ponto", não de classe bancária, e
 * documentar essa limitação é mais honesto do que fingir precisão que o
 * modelo não tem.
 */
const SIMILARITY_THRESHOLD = 0.4;

export interface FaceMatchResult {
  similarity: number;
  approved: boolean;
}

/** Mesma matemática de showcases/ponto-inteligente/face-match-client.ts, adaptada para Float32Array. */
export function compareDescriptors(a: Float32Array, b: Float32Array): FaceMatchResult {
  let sumSquares = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumSquares += diff * diff;
  }

  const distance = Math.sqrt(sumSquares);
  const similarity = Math.max(0, 1 - distance);

  return { similarity, approved: similarity >= SIMILARITY_THRESHOLD };
}
