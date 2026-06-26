import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { analisarProduto, type AnalyzeResult } from "@/lib/sentiment.functions";
import type { SentimentReport } from "@/lib/sentiment.server";

const EXAMPLE_URL =
  "https://www.mercadolivre.com.br/jbl-boombox-3-bluetooth-squad-jblboombox3squadbr/p/MLB46273431";
const EXAMPLE_URL_B =
  "https://www.mercadolivre.com.br/caixa-de-som-jbl-charge-5-portatil-com-bluetooth-preta/p/MLB16585567";

const STEPS = [
  "Abrindo a página do produto",
  "Coletando opiniões e estrelas",
  "Lendo características do produto",
  "Classificando o sentimento",
  "Montando o relatório",
];

type Mode = "single" | "compare";
type Loaded = { report: SentimentReport; sourceUrl: string };

export function MarketSentimentDemo() {
  const analyze = useServerFn(analisarProduto);
  const [mode, setMode] = useState<Mode>("single");
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [a, setA] = useState<Loaded | null>(null);
  const [b, setB] = useState<Loaded | null>(null);

  async function analyzeOne(url: string): Promise<Loaded> {
    const res = (await analyze({ data: { url: url.trim() } })) as AnalyzeResult;
    if (!res.success) throw new Error(res.error);
    return { report: res.report, sourceUrl: res.sourceUrl };
  }

  async function run() {
    if (!urlA.trim()) return;
    if (mode === "compare" && !urlB.trim()) return;

    setLoading(true);
    setError(null);
    setA(null);
    setB(null);
    setStep(0);

    const ticker = setInterval(() => {
      setStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, 1400);

    try {
      if (mode === "single") {
        setA(await analyzeOne(urlA));
      } else {
        const [ra, rb] = await Promise.all([analyzeOne(urlA), analyzeOne(urlB)]);
        setA(ra);
        setB(rb);
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Algo deu errado ao analisar o link. Verifique a URL e tente novamente.",
      );
    } finally {
      clearInterval(ticker);
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      {/* Mode toggle */}
      <div className="mb-4 inline-flex rounded-lg border border-border bg-background p-1 font-mono text-xs">
        {(
          [
            ["single", "1 produto"],
            ["compare", "comparar 2"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            disabled={loading}
            className={`rounded-md px-3 py-1.5 transition-colors disabled:opacity-60 ${
              mode === m
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="space-y-3"
      >
        <input
          type="url"
          inputMode="url"
          value={urlA}
          onChange={(e) => setUrlA(e.target.value)}
          placeholder={
            mode === "compare"
              ? "Produto A — cole o link"
              : "Cole o link de um produto (ex.: Mercado Livre)"
          }
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30"
          required
        />
        {mode === "compare" && (
          <input
            type="url"
            inputMode="url"
            value={urlB}
            onChange={(e) => setUrlB(e.target.value)}
            placeholder="Produto B — cole o link"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30"
            required
          />
        )}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground px-5 py-2.5 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading
            ? "analisando…"
            : mode === "compare"
              ? "comparar →"
              : "analisar →"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
        <span>experimente:</span>
        <button
          type="button"
          onClick={() => {
            setUrlA(EXAMPLE_URL);
            if (mode === "compare") setUrlB(EXAMPLE_URL_B);
          }}
          disabled={loading}
          className="rounded-md border border-border px-2 py-1 text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
        >
          {mode === "compare" ? "JBL Boombox 3 × Charge 5" : "JBL Boombox 3 (exemplo)"}
        </button>
      </div>

      {loading && (
        <div className="mt-6 space-y-2">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`flex items-center gap-3 font-mono text-sm transition-colors ${
                i <= step ? "text-foreground" : "text-muted-foreground/50"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                  i < step
                    ? "border-positive bg-positive/15 text-positive"
                    : i === step
                      ? "animate-pulse border-primary bg-primary/15 text-primary"
                      : "border-border"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </span>
              {label}
              {i === step ? "…" : ""}
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="mt-5 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && mode === "single" && a && (
        <Report report={a.report} sourceUrl={a.sourceUrl} />
      )}

      {!loading && mode === "compare" && a && b && (
        <Comparison a={a} b={b} />
      )}
    </div>
  );
}

/* ------------------------------- Comparison ------------------------------- */

function recommendScore(r: SentimentReport): number {
  // 0–100 score blending approval, average rating and volume confidence.
  const approval = r.sentimentPct.positivo - r.sentimentPct.negativo; // -100..100
  const ratingPart = ((r.averageRating ?? 3) / 5) * 100; // 0..100
  const confidence = Math.min(1, r.totalReviews / 30); // more reviews = steadier
  const raw = (approval + 100) / 2 * 0.5 + ratingPart * 0.5;
  return Math.round(raw * (0.7 + 0.3 * confidence));
}

function Comparison({ a, b }: { a: Loaded; b: Loaded }) {
  const ra = a.report;
  const rb = b.report;

  const scoreA = recommendScore(ra);
  const scoreB = recommendScore(rb);
  const winner = scoreA === scoreB ? null : scoreA > scoreB ? "a" : "b";
  const win = winner === "a" ? ra : winner === "b" ? rb : null;
  const lose = winner === "a" ? rb : winner === "b" ? ra : null;

  return (
    <div className="mt-6 space-y-6 border-t border-border pt-5">
      {/* Recommendation banner */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-primary">
          Recomendação
        </p>
        {win && lose ? (
          <p className="text-base leading-relaxed text-foreground">
            👉 Melhor escolha: <strong>{win.productName}</strong>. Tem score{" "}
            <strong>{winner === "a" ? scoreA : scoreB}/100</strong> contra{" "}
            {winner === "a" ? scoreB : scoreA}/100 — somando aprovação, nota média
            e volume de opiniões.
          </p>
        ) : (
          <p className="text-base leading-relaxed text-foreground">
            Empate técnico: os dois produtos têm score {scoreA}/100.
          </p>
        )}
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 gap-3">
        <ScoreCard report={ra} score={scoreA} isWinner={winner === "a"} />
        <ScoreCard report={rb} score={scoreB} isWinner={winner === "b"} />
      </div>

      {/* Head-to-head metric bars */}
      <div className="space-y-4 rounded-lg border border-border bg-background p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Comparação direta
        </p>
        <Versus
          label="Nota média"
          a={ra.averageRating ?? 0}
          b={rb.averageRating ?? 0}
          max={5}
          fmt={(v) => `${v ? v.toFixed(1) : "—"}★`}
        />
        <Versus
          label="% Positivas"
          a={ra.sentimentPct.positivo}
          b={rb.sentimentPct.positivo}
          max={100}
          fmt={(v) => `${v}%`}
        />
        <Versus
          label="% Negativas"
          a={ra.sentimentPct.negativo}
          b={rb.sentimentPct.negativo}
          max={100}
          fmt={(v) => `${v}%`}
          lowerIsBetter
        />
        <Versus
          label="Opiniões"
          a={ra.totalReviews}
          b={rb.totalReviews}
          max={Math.max(ra.totalReviews, rb.totalReviews, 1)}
          fmt={(v) => String(v)}
        />
        <div className="flex justify-between pt-1 font-mono text-[11px] text-muted-foreground">
          <span className="max-w-[45%] truncate text-positive">A · {ra.productName}</span>
          <span className="max-w-[45%] truncate text-right text-primary">B · {rb.productName}</span>
        </div>
      </div>

      {/* Side-by-side reports */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Report report={ra} sourceUrl={a.sourceUrl} compact badge="A" />
        <Report report={rb} sourceUrl={b.sourceUrl} compact badge="B" />
      </div>
    </div>
  );
}

function ScoreCard({
  report,
  score,
  isWinner,
}: {
  report: SentimentReport;
  score: number;
  isWinner: boolean;
}) {
  return (
    <div
      className={`relative rounded-xl border p-4 ${
        isWinner ? "border-positive/50 bg-positive/5" : "border-border bg-background"
      }`}
    >
      {isWinner && (
        <span className="absolute right-3 top-3 rounded-full bg-positive/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-positive">
          ★ vencedor
        </span>
      )}
      <p className="line-clamp-2 pr-16 text-sm font-semibold text-foreground" title={report.productName}>
        {report.productName}
      </p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">
        {score}
        <span className="text-base font-normal text-muted-foreground">/100</span>
      </p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {report.sentimentPct.positivo}% positivo ·{" "}
        {report.averageRating != null ? `${report.averageRating}★` : "sem nota"}
      </p>
    </div>
  );
}

function Versus({
  label,
  a,
  b,
  max,
  fmt,
  lowerIsBetter = false,
}: {
  label: string;
  a: number;
  b: number;
  max: number;
  fmt: (v: number) => string;
  lowerIsBetter?: boolean;
}) {
  const aWins = lowerIsBetter ? a < b : a > b;
  const bWins = lowerIsBetter ? b < a : b > a;
  const pa = max > 0 ? Math.min(100, (a / max) * 100) : 0;
  const pb = max > 0 ? Math.min(100, (b / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between font-mono text-xs">
        <span className={aWins ? "font-semibold text-positive" : "text-muted-foreground"}>
          {fmt(a)}
        </span>
        <span className="text-muted-foreground">{label}</span>
        <span className={bWins ? "font-semibold text-primary" : "text-muted-foreground"}>
          {fmt(b)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <div className="flex h-2 flex-1 justify-end overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-positive transition-all" style={{ width: `${pa}%` }} />
        </div>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pb}%` }} />
        </div>
      </div>
    </div>
  );
}


/* --------------------------------- Report --------------------------------- */

function Report({
  report,
  sourceUrl,
  compact = false,
  badge,
}: {
  report: SentimentReport;
  sourceUrl: string | null;
  compact?: boolean;
  badge?: string;
}) {
  const maxStar = Math.max(1, ...report.starDistribution.map((s) => s.count));
  return (
    <div className={compact ? "space-y-5" : "mt-6 space-y-6"}>
      <div
        className={`flex flex-wrap items-baseline justify-between gap-2 ${
          compact ? "" : "border-t border-border pt-5"
        }`}
      >
        <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          {badge && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground font-mono text-[10px] text-background">
              {badge}
            </span>
          )}
          {report.productName}
        </h3>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            ver fonte ↗
          </a>
        )}
      </div>

      {/* Qualitative summary */}
      <div className="rounded-lg border border-border bg-background p-4">
        <p className="mb-1.5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Resumo qualitativo
        </p>
        <p className="text-sm leading-relaxed text-foreground">
          {report.qualitativeSummary}
        </p>
      </div>

      {/* Big stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Opiniões" value={String(report.totalReviews)} />
        <Stat
          label="Nota média"
          value={report.averageRating != null ? `${report.averageRating}★` : "—"}
        />
        <Stat
          label="Positivas"
          value={`${report.sentimentPct.positivo}%`}
          tone="positive"
        />
        <Stat
          label="Negativas"
          value={`${report.sentimentPct.negativo}%`}
          tone="negative"
        />
      </div>

      {/* Characteristics */}
      {report.attributes.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Características do produto
          </p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {report.attributes.map((attr) => (
              <div
                key={attr.label + attr.value}
                className="flex items-baseline justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
              >
                <dt className="font-mono text-xs text-muted-foreground">
                  {attr.label}
                </dt>
                <dd className="text-right text-sm font-medium text-foreground">
                  {attr.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Sentiment bar */}
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Distribuição de sentimento
        </p>
        <div className="flex h-3 w-full overflow-hidden rounded-full">
          <span
            className="bg-positive"
            style={{ width: `${report.sentimentPct.positivo}%` }}
            title={`Positivo ${report.sentimentPct.positivo}%`}
          />
          <span
            className="bg-neutral"
            style={{ width: `${report.sentimentPct.neutro}%` }}
            title={`Neutro ${report.sentimentPct.neutro}%`}
          />
          <span
            className="bg-negative"
            style={{ width: `${report.sentimentPct.negativo}%` }}
            title={`Negativo ${report.sentimentPct.negativo}%`}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 font-mono text-xs text-muted-foreground">
          <Legend color="bg-positive" label={`positivo ${report.sentiment.positivo}`} />
          <Legend color="bg-neutral" label={`neutro ${report.sentiment.neutro}`} />
          <Legend color="bg-negative" label={`negativo ${report.sentiment.negativo}`} />
        </div>
      </div>

      {/* Star distribution */}
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Estrelas
        </p>
        <div className="space-y-1.5">
          {report.starDistribution.map((s) => (
            <div key={s.star} className="flex items-center gap-3">
              <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
                {s.star}★
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(s.count / maxStar) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-xs text-muted-foreground">
                {s.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Praise / complaints */}
      <div className="grid gap-4 sm:grid-cols-2">
        <KeywordCard title="Elogios mais citados" words={report.praise} tone="positive" />
        <KeywordCard
          title="Reclamações mais citadas"
          words={report.complaints}
          tone="negative"
        />
      </div>

      {/* Sample reviews */}
      {report.sample.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Opiniões em destaque
          </p>
          <ul className="space-y-2">
            {report.sample.map((r, i) => (
              <li
                key={i}
                className="rounded-md border border-border bg-background p-3 text-sm text-foreground"
              >
                <div className="mb-1 flex items-center gap-2 font-mono text-xs">
                  <SentimentTag sentiment={r.sentiment} />
                  {r.rating != null && (
                    <span className="text-muted-foreground">{r.rating}★</span>
                  )}
                </div>
                <p className="leading-relaxed text-muted-foreground">"{r.text}"</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  const color =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${color}`}>{value}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function KeywordCard({
  title,
  words,
  tone,
}: {
  title: string;
  words: string[];
  tone: "positive" | "negative";
}) {
  const cls =
    tone === "positive"
      ? "border-positive/30 bg-positive/10 text-positive"
      : "border-negative/30 bg-negative/10 text-negative";
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      {words.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground/70">sem termos relevantes</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {words.map((w) => (
            <li
              key={w}
              className={`rounded-full border px-2.5 py-0.5 font-mono text-xs ${cls}`}
            >
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SentimentTag({ sentiment }: { sentiment: string }) {
  const map: Record<string, string> = {
    positivo: "border-positive/40 bg-positive/10 text-positive",
    neutro: "border-neutral/40 bg-neutral/10 text-neutral",
    negativo: "border-negative/40 bg-negative/10 text-negative",
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${map[sentiment]}`}>
      {sentiment}
    </span>
  );
}
