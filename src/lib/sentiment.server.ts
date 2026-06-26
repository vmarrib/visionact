// Server-only PT-BR lexicon sentiment engine.
// Transparent, auditable baseline: weighted dictionary with negation and
// intensifier handling, plus star rating as a fallback signal.

const POSITIVE: Record<string, number> = {
  bom: 2, boa: 2, otimo: 3, otima: 3, ótimo: 3, ótima: 3, excelente: 3,
  maravilhoso: 3, maravilhosa: 3, perfeito: 3, perfeita: 3, incrivel: 3,
  incrível: 3, sensacional: 3, espetacular: 3, recomendo: 3, recomendado: 2,
  adorei: 3, amei: 3, gostei: 2, satisfeito: 2, satisfeita: 2, top: 2,
  qualidade: 2, durável: 2, duravel: 2, rapido: 1, rápido: 1, potente: 2,
  lindo: 2, linda: 2, vale: 2, valeu: 2, funciona: 1, atende: 1, bonito: 2,
  bonita: 2, confortável: 2, confortavel: 2, eficiente: 2, barato: 1,
  superou: 3, surpreendeu: 2, melhor: 2, agil: 1, ágil: 1, robusto: 2,
  caprichado: 2, otimo_custo: 2, recomendadissimo: 3, sucesso: 2, feliz: 2,
};

const NEGATIVE: Record<string, number> = {
  ruim: 2, pessimo: 3, péssimo: 3, pessima: 3, péssima: 3, horrivel: 3,
  horrível: 3, terrivel: 3, terrível: 3, defeito: 3, defeituoso: 3, quebrou: 3,
  quebrado: 3, falha: 2, falhou: 2, problema: 2, problemas: 2, lento: 2,
  demora: 2, demorou: 2, decepcao: 3, decepção: 3, decepcionado: 3,
  decepcionante: 3, fraco: 2, fraca: 2, caro: 1, careiro: 2, arrependido: 3,
  arrependida: 3, arrependimento: 3, devolvi: 3, devolução: 2, devolucao: 2,
  estragou: 3, parou: 2, esquentando: 2, esquenta: 2, frágil: 2, fragil: 2,
  enganacao: 3, enganação: 3, golpe: 3, propaganda_enganosa: 3, nao_funciona: 3,
  inutil: 3, inútil: 3, pior: 2, odiei: 3, detestei: 3, vagabundo: 3,
  vazou: 2, riscado: 2, amassado: 2, atrasou: 2, atraso: 2,
};

const NEGATIONS = new Set([
  "nao", "não", "nunca", "jamais", "nem", "sem", "nenhum", "nenhum", "nenhuma",
]);

const INTENSIFIERS: Record<string, number> = {
  muito: 1.5, bem: 1.3, super: 1.6, extremamente: 1.8, bastante: 1.4,
  demais: 1.5, totalmente: 1.5, completamente: 1.5, tao: 1.3, "tão": 1.3,
  pouco: 0.5, meio: 0.6, "razoavelmente": 0.7,
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export type ReviewInput = { text: string; rating?: number | null };
export type Sentiment = "positivo" | "neutro" | "negativo";

export type ClassifiedReview = {
  text: string;
  rating: number | null;
  sentiment: Sentiment;
  score: number;
};

function lexiconScore(text: string): number {
  const tokens = tokenize(text);
  let score = 0;
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    const base = POSITIVE[w] ? POSITIVE[w] : NEGATIVE[w] ? -NEGATIVE[w] : 0;
    if (base === 0) continue;
    let mult = 1;
    let negated = false;
    for (let j = 1; j <= 2; j++) {
      const prev = tokens[i - j];
      if (!prev) break;
      if (NEGATIONS.has(prev)) negated = true;
      if (INTENSIFIERS[prev]) mult *= INTENSIFIERS[prev];
    }
    let contribution = base * mult;
    if (negated) contribution *= -0.9;
    score += contribution;
  }
  return score;
}

export function classifyReview(review: ReviewInput): ClassifiedReview {
  const text = (review.text || "").trim();
  const rating = typeof review.rating === "number" ? review.rating : null;
  let score = lexiconScore(text);

  // Blend in the star signal when available (strong prior).
  if (rating != null) {
    if (rating >= 4) score += 2;
    else if (rating <= 2) score -= 2;
  }

  // If no text signal at all, fall back to stars only.
  if (!text && rating != null) {
    score = rating >= 4 ? 2 : rating <= 2 ? -2 : 0;
  }

  let sentiment: Sentiment = "neutro";
  if (score >= 1) sentiment = "positivo";
  else if (score <= -1) sentiment = "negativo";

  return { text, rating, sentiment, score: Math.round(score * 100) / 100 };
}

function topKeywords(
  reviews: ClassifiedReview[],
  dict: Record<string, number>,
  limit = 6,
): string[] {
  const counts = new Map<string, number>();
  for (const r of reviews) {
    for (const w of tokenize(r.text)) {
      if (dict[w]) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

export type ProductAttribute = { label: string; value: string };

export type SentimentReport = {
  productName: string;
  totalReviews: number;
  withText: number;
  averageRating: number | null;
  starDistribution: { star: number; count: number }[];
  sentiment: { positivo: number; neutro: number; negativo: number };
  sentimentPct: { positivo: number; neutro: number; negativo: number };
  praise: string[];
  complaints: string[];
  attributes: ProductAttribute[];
  qualitativeSummary: string;
  sample: { text: string; rating: number | null; sentiment: Sentiment }[];
};

function buildQualitativeSummary(
  productName: string,
  total: number,
  average: number | null,
  pct: { positivo: number; neutro: number; negativo: number },
  praise: string[],
  complaints: string[],
): string {
  const parts: string[] = [];
  const verdict =
    pct.positivo >= 70
      ? "muito bem avaliado"
      : pct.positivo >= 50
        ? "bem avaliado no geral"
        : pct.negativo >= 50
          ? "mal avaliado"
          : "com avaliações divididas";
  parts.push(
    `${productName} está ${verdict}: ${pct.positivo}% das ${total} opiniões são positivas` +
      (average != null ? `, com nota média ${average}★` : "") +
      ".",
  );
  if (praise.length > 0) {
    parts.push(`Os clientes elogiam principalmente ${praise.slice(0, 3).join(", ")}.`);
  }
  if (complaints.length > 0) {
    parts.push(`As reclamações mais comuns citam ${complaints.slice(0, 3).join(", ")}.`);
  }
  return parts.join(" ");
}

export function buildReport(
  productName: string,
  reviews: ReviewInput[],
  declaredAverage?: number | null,
  attributes: ProductAttribute[] = [],
): SentimentReport {
  const classified = reviews
    .map(classifyReview)
    .filter((r) => r.text || r.rating != null);

  const counts = { positivo: 0, neutro: 0, negativo: 0 };
  const star: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  let ratingN = 0;

  for (const r of classified) {
    counts[r.sentiment]++;
    if (r.rating != null && r.rating >= 1 && r.rating <= 5) {
      star[Math.round(r.rating)]++;
      ratingSum += r.rating;
      ratingN++;
    }
  }

  const total = classified.length || 1;
  const pct = {
    positivo: Math.round((counts.positivo / total) * 100),
    neutro: Math.round((counts.neutro / total) * 100),
    negativo: Math.round((counts.negativo / total) * 100),
  };

  const average =
    ratingN > 0
      ? Math.round((ratingSum / ratingN) * 10) / 10
      : declaredAverage ?? null;

  const positiveReviews = classified.filter((r) => r.sentiment === "positivo");
  const negativeReviews = classified.filter((r) => r.sentiment === "negativo");

  const sample = [...classified]
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 6)
    .map((r) => ({ text: r.text, rating: r.rating, sentiment: r.sentiment }));

  const praise = topKeywords(positiveReviews, POSITIVE);
  const complaints = topKeywords(negativeReviews, NEGATIVE);

  return {
    productName,
    totalReviews: classified.length,
    withText: classified.filter((r) => r.text).length,
    averageRating: average,
    starDistribution: [5, 4, 3, 2, 1].map((s) => ({ star: s, count: star[s] })),
    sentiment: counts,
    sentimentPct: pct,
    praise,
    complaints,
    attributes: attributes
      .filter((a) => a && a.label && a.value)
      .slice(0, 8)
      .map((a) => ({ label: String(a.label).trim(), value: String(a.value).trim() })),
    qualitativeSummary: buildQualitativeSummary(
      productName,
      classified.length,
      average,
      pct,
      praise,
      complaints,
    ),
    sample,
  };
}
