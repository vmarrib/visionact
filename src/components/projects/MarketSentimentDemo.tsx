import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { analisarProduto, type AnalyzeResult } from "@/lib/sentiment.functions";
import type { SentimentReport } from "@/lib/sentiment.server";

const EXAMPLE_URL =
  "https://www.mercadolivre.com.br/jbl-boombox-3-bluetooth-squad-jblboombox3squadbr/p/MLB46273431";

const STEPS = [
  "Abrindo a página do produto",
  "Coletando opiniões e estrelas",
  "Classificando o sentimento",
  "Montando o relatório",
];

export function MarketSentimentDemo() {
  const analyze = useServerFn(analisarProduto);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SentimentReport | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  async function run(targetUrl: string) {
    if (!targetUrl.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    setStep(0);

    const ticker = setInterval(() => {
      setStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, 1600);

    try {
      const res = (await analyze({ data: { url: targetUrl.trim() } })) as AnalyzeResult;
      if (res.success) {
        setReport(res.report);
        setSourceUrl(res.sourceUrl);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Algo deu errado ao analisar o link. Verifique a URL e tente novamente.");
    } finally {
      clearInterval(ticker);
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(url);
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Cole o link de um produto (ex.: Mercado Livre)"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground px-5 py-2.5 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "analisando…" : "analisar →"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
        <span>experimente:</span>
        <button
          type="button"
          onClick={() => {
            setUrl(EXAMPLE_URL);
            run(EXAMPLE_URL);
          }}
          disabled={loading}
          className="rounded-md border border-border px-2 py-1 text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
        >
          JBL Boombox 3 (exemplo)
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

      {report && !loading && <Report report={report} sourceUrl={sourceUrl} />}
    </div>
  );
}

function Report({
  report,
  sourceUrl,
}: {
  report: SentimentReport;
  sourceUrl: string | null;
}) {
  const maxStar = Math.max(1, ...report.starDistribution.map((s) => s.count));
  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-5">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
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

      {/* Big stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Opiniões"
          value={String(report.totalReviews)}
        />
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
        <KeywordCard
          title="Elogios mais citados"
          words={report.praise}
          tone="positive"
        />
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
