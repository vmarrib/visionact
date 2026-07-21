import { useState, type FormEvent } from "react";
import { checkCnpjRisk, type RiskCheckResult } from "@/lib/risk-check.functions";
import { isValidCnpj, onlyDigits } from "@/lib/risk-check-cnpj";

const EXAMPLE_CNPJ = "11.222.333/0001-81";

const RECOMMENDATION_LABEL: Record<string, string> = {
  approve: "Aprovado",
  manual_review: "Análise",
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

      {result && <Dossie result={result} />}
    </div>
  );
}

function Dossie({ result }: { result: RiskCheckResult }) {
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

  if (result.status === "rate_limited") {
    return (
      <p className="mt-4 text-sm text-neutral">
        A BrasilAPI está limitando requisições no momento (HTTP 429) — é uma API pública gratuita,
        sem chave, com limite de uso compartilhado entre todos os visitantes. Aguarde alguns
        segundos e tente de novo.
      </p>
    );
  }

  if (result.status === "upstream_error") {
    return <p className="mt-4 text-sm text-negative">{result.message}</p>;
  }

  const vetoRules = result.rules.filter((r) => r.kind === "veto");
  const weightedRules = result.rules.filter((r) => r.kind === "weighted");

  return (
    <div className="mt-5 space-y-6 border-t border-border pt-5">
      {/* Cabeçalho do dossiê: quem é a empresa + classificação */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{result.company.cnpj}</p>
          <h4 className="text-base font-semibold text-foreground">{result.company.razaoSocial}</h4>
          {result.company.nomeFantasia !== "—" && (
            <p className="text-sm text-muted-foreground">{result.company.nomeFantasia}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-sm font-semibold ${RECOMMENDATION_STYLE[result.recommendation]}`}
          >
            {RECOMMENDATION_LABEL[result.recommendation]}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            score = <span className="font-semibold text-foreground">{result.score.toFixed(2)}</span>
          </p>
        </div>
      </div>

      {/* Regras avaliadas: TODAS, disparadas ou não — campo, condição e peso lidos direto de risk-check-rules.ts */}
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Regras avaliadas
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-2 font-medium">Regra</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Campo</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Condição</th>
                <th className="px-3 py-2 font-medium">Peso</th>
                <th className="px-3 py-2 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {[...vetoRules, ...weightedRules].map((rule) => (
                <tr key={rule.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-foreground">{rule.label}</td>
                  <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground sm:table-cell">
                    {rule.field}
                  </td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{rule.condition}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {rule.kind === "veto" ? "bloqueio automático" : rule.weight?.toFixed(1)}
                  </td>
                  <td className="px-3 py-2">
                    {rule.triggered ? (
                      <span className="font-mono text-xs font-semibold text-negative">disparou</span>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dados cadastrais */}
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Dados cadastrais
        </p>
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {[
            ["Situação cadastral", result.company.situacaoCadastral],
            ["Data da situação", result.company.dataSituacaoCadastral],
            ["Início de atividade", result.company.dataInicioAtividade],
            ["Porte", result.company.porte],
            ["Capital social", result.company.capitalSocial],
            ["Município / UF", `${result.company.municipio} / ${result.company.uf}`],
            ["Optante pelo Simples Nacional", result.company.optanteSimples ? "Sim" : "Não"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-border py-1.5 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* CNAEs */}
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Atividades econômicas (CNAE)
        </p>
        <ul className="flex flex-wrap gap-2">
          <li className="rounded-md border border-primary/30 bg-accent px-2.5 py-1 font-mono text-xs text-accent-foreground">
            {result.cnaes.principal.codigo} · {result.cnaes.principal.descricao} (principal)
          </li>
          {result.cnaes.secundarios.map((cnae) => (
            <li
              key={cnae.codigo}
              className="rounded-md border border-border bg-secondary px-2.5 py-1 font-mono text-xs text-secondary-foreground"
            >
              {cnae.codigo} · {cnae.descricao}
            </li>
          ))}
        </ul>
      </div>

      {/* Quadro societário */}
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Quadro societário
        </p>
        {result.partners.length > 0 ? (
          <ul className="space-y-1.5">
            {result.partners.map((partner) => (
              <li key={partner.nome} className="flex gap-2 text-sm text-foreground">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>
                  {partner.nome}
                  {partner.qualificacao && <span className="text-muted-foreground"> — {partner.qualificacao}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum sócio registrado.</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Fonte única: BrasilAPI. Regras definidas em{" "}
        <code className="rounded bg-secondary px-1 py-0.5">risk-check-rules.ts</code>. Nenhum CNPJ
        consultado aqui é armazenado.
      </p>
    </div>
  );
}
