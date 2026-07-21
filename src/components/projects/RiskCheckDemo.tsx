import { useState, type FormEvent } from "react";
import { checkCnpjRisk, type RiskCheckResult } from "@/lib/risk-check.functions";
import { isValidCnpj, onlyDigits } from "@/lib/risk-check-cnpj";

const EXAMPLE_CNPJ = "11.222.333/0001-81";

const RECOMMENDATION_LABEL: Record<string, string> = {
  approve: "Aprovado",
  manual_review: "Revisão manual",
  reject: "Reprovado",
};

const RECOMMENDATION_STYLE: Record<string, string> = {
  approve: "bg-positive/10 text-positive border-positive/30",
  manual_review: "bg-neutral/10 text-neutral border-neutral/30",
  reject: "bg-negative/10 text-negative border-negative/30",
};

export function RiskCheckDemo() {
  const [rawInput, setRawInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RiskCheckResult | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const digits = onlyDigits(rawInput);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setClientError(null);
    setResult(null);

    if (!isValidCnpj(digits)) {
      setClientError("CNPJ inválido — confira os dígitos verificadores.");
      return;
    }

    setLoading(true);
    try {
      const response = await checkCnpjRisk({ data: { cnpj: digits } });
      setResult(response);
    } catch {
      setResult({ status: "upstream_error", message: "Falha inesperada ao consultar a BrasilAPI." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="mb-1 font-mono text-xs uppercase tracking-widest text-primary">Demo ao vivo</p>
      <h3 className="mb-3 text-lg font-semibold text-foreground">
        Digite um CNPJ real — a análise roda de verdade, contra a BrasilAPI
      </h3>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          inputMode="numeric"
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          placeholder={EXAMPLE_CNPJ}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none ring-primary/40 transition-shadow focus:ring-2"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || digits.length === 0}
          className="rounded-md bg-foreground px-4 py-2 font-mono text-sm text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Analisando…" : "Analisar"}
        </button>
      </form>

      {clientError && <p className="mt-3 text-sm text-negative">{clientError}</p>}

      {result && <RiskCheckResultView result={result} />}

      <p className="mt-4 text-xs text-muted-foreground">
        Regras avaliadas: situação cadastral (veto), tempo de abertura, capital social e quadro
        societário — todas definidas em{" "}
        <code className="rounded bg-secondary px-1 py-0.5">risk-check-rules.ts</code>, usando
        apenas dados públicos da BrasilAPI. Nenhum CNPJ consultado aqui é armazenado.
      </p>
    </div>
  );
}

function RiskCheckResultView({ result }: { result: RiskCheckResult }) {
  if (result.status === "invalid_cnpj") {
    return <p className="mt-4 text-sm text-negative">CNPJ inválido — confira os dígitos verificadores.</p>;
  }

  if (result.status === "not_found") {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Nenhuma empresa encontrada na BrasilAPI para este CNPJ.
      </p>
    );
  }

  if (result.status === "upstream_error") {
    return <p className="mt-4 text-sm text-negative">{result.message}</p>;
  }

  return (
    <div className="mt-5 space-y-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-sm font-semibold ${RECOMMENDATION_STYLE[result.recommendation]}`}>
          {RECOMMENDATION_LABEL[result.recommendation]}
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          score = <span className="font-semibold text-foreground">{result.score.toFixed(2)}</span>
        </p>
      </div>

      {result.flaggedRules.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Regras sinalizadas
          </p>
          <ul className="space-y-1.5">
            {result.flaggedRules.map((rule) => (
              <li key={rule.id} className="flex gap-2 text-sm text-foreground">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-negative" aria-hidden />
                <span>
                  {rule.label}
                  {rule.reason && <span className="text-muted-foreground"> — {rule.reason}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Dossiê
        </p>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {result.dossier.map((field) => (
            <div key={field.label} className="flex justify-between gap-3 border-b border-border py-1.5 text-sm">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="text-right font-medium text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
