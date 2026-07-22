/**
 * Ponto Inteligente — amostra de prova de vivacidade (liveness) por desafio de movimento.
 *
 * Motivação real, não hipotética: testando a demo ao vivo do portfólio,
 * segurar uma FOTO estática na frente da câmera foi aprovado como "mesma
 * pessoa". O pipeline de FaceMatch (`face-match-client.ts`,
 * `face-match-pipeline.ts`) confirma QUEM está na imagem, mas nunca
 * verificou SE a captura é de uma pessoa real, ao vivo — uma classe
 * conhecida de vulnerabilidade em biometria facial chamada ataque de
 * apresentação (presentation attack / spoofing).
 *
 * Contramedida: desafio de movimento aleatório. Antes de aceitar uma
 * captura, o sistema pede uma ação (sorrir, abrir a boca, virar o rosto)
 * escolhida ao acaso, compara um quadro "antes" (neutro) com um quadro
 * "depois" do desafio, e só aceita a captura se a mudança observada é
 * consistente com o que foi pedido.
 *
 * Por que aleatório? Um vídeo pré-gravado da pessoa real, reproduzido
 * para a câmera, poderia coincidentemente conter QUALQUER ação fixa — mas
 * dificilmente conterá, no momento exato pedido, a ação aleatória
 * específica escolhida por este sistema. Não é infalível (um atacante
 * determinado poderia preparar um vídeo com todas as ações e escolher a
 * certa na hora), mas eleva o custo do ataque muito além de "segurar uma
 * foto na frente da câmera" — o vetor mais barato e mais comum.
 */

export type LivenessChallenge = "smile" | "open_mouth" | "turn_head";

const CHALLENGES: LivenessChallenge[] = ["smile", "open_mouth", "turn_head"];

/** RNG injetável — mesma técnica de `threshold_calibration.py`, para testes determinísticos. */
export function pickRandomChallenge(random: () => number = Math.random): LivenessChallenge {
  const index = Math.floor(random() * CHALLENGES.length);
  return CHALLENGES[Math.min(index, CHALLENGES.length - 1)];
}

export function describeChallenge(challenge: LivenessChallenge): string {
  switch (challenge) {
    case "smile":
      return "Sorria para a câmera";
    case "open_mouth":
      return "Abra bem a boca";
    case "turn_head":
      return "Vire o rosto para o lado";
  }
}

/** Ponto 2D — mesmo formato dos pontos retornados pelo modelo de 68 landmarks faciais. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Métricas extraídas dos landmarks e da expressão de UM quadro,
 * suficientes para comparar "antes" e "depois" do desafio.
 */
export interface LivenessFrameMetrics {
  /** Ponta do nariz (índice 30 no esquema padrão de 68 pontos). */
  noseTip: Point;
  /** Canto externo do olho direito (índice 36). */
  rightEyeOuter: Point;
  /** Canto externo do olho esquerdo (índice 45). */
  leftEyeOuter: Point;
  /** Lábio superior interno (índice 62). */
  mouthTop: Point;
  /** Lábio inferior interno (índice 66). */
  mouthBottom: Point;
  /** Probabilidade de expressão "feliz" (0 a 1), de um classificador de expressão dedicado. */
  happy: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpointX(a: Point, b: Point): number {
  return (a.x + b.x) / 2;
}

// Limiares iniciais — diferente do limiar de FaceMatch, estes NÃO vieram
// de uma calibração estatística formal (não existe, ainda, um dataset de
// tentativas de desafio rotuladas). São estimativas de engenharia
// verificadas manualmente na demo ao vivo — documentadas como tal, não
// disfarçadas de número calibrado. Calibrá-las de verdade seria o próximo
// passo natural, com o mesmo método de FAR/FRR já usado no FaceMatch.
const SMILE_HAPPY_THRESHOLD = 0.5;
const MOUTH_OPEN_DELTA_RATIO = 0.15;
const HEAD_TURN_DELTA_RATIO = 0.12;

/**
 * Compara um quadro-base (rosto neutro) com um quadro capturado após o
 * desafio, e decide se a mudança observada é consistente com o que foi
 * pedido. Toda distância é normalizada pela distância entre os cantos
 * externos dos olhos — proxy de "tamanho do rosto na imagem" que torna a
 * comparação independente de o rosto estar mais perto ou mais longe da
 * câmera entre os dois quadros.
 *
 * `turn_head` verifica virar para QUALQUER lado, não um lado específico,
 * de propósito: exigir uma direção (esquerda/direita) dependeria de saber
 * se o vídeo exibido ao usuário está espelhado (comum em apps de câmera,
 * para parecer um espelho) — um detalhe fácil de inverter sem testar numa
 * câmera real. Exigir "qualquer lado" mantém o desafio genuinamente
 * aleatório e verificável sem essa ambiguidade.
 */
export function evaluateChallenge(
  challenge: LivenessChallenge,
  baseline: LivenessFrameMetrics,
  attempt: LivenessFrameMetrics,
): boolean {
  const eyeSpan = distance(baseline.rightEyeOuter, baseline.leftEyeOuter);
  if (eyeSpan === 0) return false;

  switch (challenge) {
    case "smile":
      return attempt.happy >= SMILE_HAPPY_THRESHOLD && attempt.happy > baseline.happy;

    case "open_mouth": {
      const baselineAperture = distance(baseline.mouthTop, baseline.mouthBottom);
      const attemptAperture = distance(attempt.mouthTop, attempt.mouthBottom);
      return (attemptAperture - baselineAperture) / eyeSpan >= MOUTH_OPEN_DELTA_RATIO;
    }

    case "turn_head": {
      const baselineOffset =
        (baseline.noseTip.x - midpointX(baseline.rightEyeOuter, baseline.leftEyeOuter)) / eyeSpan;
      const attemptOffset =
        (attempt.noseTip.x - midpointX(attempt.rightEyeOuter, attempt.leftEyeOuter)) / eyeSpan;
      return Math.abs(attemptOffset - baselineOffset) >= HEAD_TURN_DELTA_RATIO;
    }
  }
}
