/**
 * Ponto Inteligente (demo ao vivo) — prova de vivacidade por desafio de
 * movimento aleatório.
 *
 * Mesma lógica e mesma motivação documentadas em
 * `showcases/ponto-inteligente/liveness-challenge.ts` (uma foto estática
 * segurada na câmera foi aprovada como "mesma pessoa" antes desta
 * correção) — este arquivo é a versão que roda de verdade na demo,
 * consumida por `face-match-live.ts`.
 */

export type LivenessChallenge = "smile" | "open_mouth" | "turn_head";

const CHALLENGES: LivenessChallenge[] = ["smile", "open_mouth", "turn_head"];

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

export interface Point {
  x: number;
  y: number;
}

export interface LivenessFrameMetrics {
  noseTip: Point;
  rightEyeOuter: Point;
  leftEyeOuter: Point;
  mouthTop: Point;
  mouthBottom: Point;
  happy: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpointX(a: Point, b: Point): number {
  return (a.x + b.x) / 2;
}

// Estimativas de engenharia, não calibradas estatisticamente (ver
// showcase para o porquê) — ajustadas manualmente testando a demo ao vivo.
const SMILE_HAPPY_THRESHOLD = 0.5;
const MOUTH_OPEN_DELTA_RATIO = 0.15;
const HEAD_TURN_DELTA_RATIO = 0.12;

/**
 * `turn_head` aceita giro para QUALQUER lado — ver justificativa detalhada
 * no showcase (evita depender de o vídeo estar espelhado ou não).
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
