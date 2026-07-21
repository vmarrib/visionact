/**
 * Checagem de Risco (demo ao vivo) — server function.
 *
 * Roda no servidor (nunca no navegador do visitante): recebe um CNPJ,
 * valida o dígito verificador, consulta A BRASILAPI (nenhuma outra fonte —
 * ver README do showcase para o porquê), monta o dossiê e avalia as regras
 * configuradas em `risk-check-rules.ts`.
 *
 * BrasilAPI é pública e não exige chave — não há segredo para vazar aqui,
 * mas a chamada roda no servidor mesmo assim, pelo mesmo motivo de sempre:
 * o client nunca deveria ser o responsável por decidir "de qual fonte
 * externa este dado vem" nem por interpretar a resposta bruta.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isValidCnpj, onlyDigits } from "./risk-check-cnpj";
import { BrasilApiCnpjSchema, buildDossierFields, extractSignals, type DossierField } from "./risk-check-dossier";
import { evaluateRules, type FlaggedRule, type Recommendation } from "./risk-check-rules";

const BRASIL_API_CNPJ_ENDPOINT = "https://brasilapi.com.br/api/cnpj/v1";

export type RiskCheckResult =
  | { status: "invalid_cnpj" }
  | { status: "not_found" }
  | { status: "upstream_error"; message: string }
  | {
      status: "ok";
      dossier: DossierField[];
      score: number;
      recommendation: Recommendation;
      flaggedRules: FlaggedRule[];
    };

export const checkCnpjRisk = createServerFn({ method: "POST" })
  .inputValidator(z.object({ cnpj: z.string().min(1) }))
  .handler(async ({ data }): Promise<RiskCheckResult> => {
    const digits = onlyDigits(data.cnpj);

    if (!isValidCnpj(digits)) {
      return { status: "invalid_cnpj" };
    }

    let response: Response;
    try {
      response = await fetch(`${BRASIL_API_CNPJ_ENDPOINT}/${digits}`, {
        headers: { Accept: "application/json" },
      });
    } catch {
      return { status: "upstream_error", message: "Não foi possível conectar à BrasilAPI." };
    }

    if (response.status === 404) {
      return { status: "not_found" };
    }

    if (!response.ok) {
      return { status: "upstream_error", message: `BrasilAPI retornou status ${response.status}.` };
    }

    const rawBody = await response.json();
    const parsed = BrasilApiCnpjSchema.safeParse(rawBody);

    if (!parsed.success) {
      return { status: "upstream_error", message: "Resposta da BrasilAPI em formato inesperado." };
    }

    const dossier = buildDossierFields(parsed.data);
    const signals = extractSignals(parsed.data);
    const assessment = evaluateRules(signals);

    return {
      status: "ok",
      dossier,
      score: assessment.score,
      recommendation: assessment.recommendation,
      flaggedRules: assessment.flaggedRules,
    };
  });
