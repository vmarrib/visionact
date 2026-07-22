/**
 * Ponto Inteligente — reconhecimento facial rodando DE VERDADE no navegador
 * de quem está vendo o portfólio, não no servidor do site.
 *
 * Mesmo pipeline de 3 estágios documentado em
 * `showcases/ponto-inteligente/` (TinyFaceDetector → FaceLandmark68Net →
 * FaceRecognitionNet), mesmos limiares calibrados lá
 * (`face-match-pipeline.ts`, `threshold_calibration.py`) — esta versão só
 * troca o showcase estático por uma chamada real à biblioteca
 * `@vladmandic/face-api`, a mesma usada no projeto real.
 *
 * Os pesos dos modelos (~6,7 MB no total) são carregados de um CDN público
 * (jsdelivr, servindo o próprio pacote npm) na primeira vez que a demo é
 * aberta — não ficam embutidos no bundle do site para não pesar no
 * carregamento de quem só quer ler as outras páginas do portfólio.
 *
 * Import dinâmico de propósito: `@vladmandic/face-api` usa WebGL/Canvas,
 * que só existem no navegador — importar no topo do arquivo quebraria a
 * renderização no servidor (SSR) do TanStack Start.
 */

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

// Mesmos valores de showcases/ponto-inteligente/face-match-pipeline.ts —
// não escolhidos de novo "no olho" para esta demo.
const MIN_DETECTION_CONFIDENCE = 0.8;
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
 * Limiar calibrado em `showcases/ponto-inteligente/threshold_calibration.py`
 * (FAR/FRR/Equal Error Rate) — repetido aqui, não recalculado.
 */
const SIMILARITY_THRESHOLD = 0.65;

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
