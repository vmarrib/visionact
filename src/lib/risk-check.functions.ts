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
import {
  BrasilApiCnpjSchema,
  buildCnaes,
  buildCompanyProfile,
  buildPartners,
  extractSignals,
  type CnaeInfo,
  type CompanyProfile,
  type Partner,
} from "./risk-check-dossier";
import { evaluateRules, type Recommendation, type RuleEvaluation } from "./risk-check-rules";

const BRASIL_API_CNPJ_ENDPOINT = "https://brasilapi.com.br/api/cnpj/v1";

export type RiskCheckResult =
  | { status: "invalid_cnpj" }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "upstream_error"; message: string }
  | {
      status: "ok";
      company: CompanyProfile;
      cnaes: { principal: CnaeInfo; secundarios: CnaeInfo[] };
      partners: Partner[];
      score: number;
      recommendation: Recommendation;
      rules: RuleEvaluation[];
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

    if (response.status === 429) {
      // Limite de requisições da BrasilAPI (API pública gratuita, sem
      // chave) — não é um bug da demo, é o provedor pedindo para esperar.
      return { status: "rate_limited" };
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

    const signals = extractSignals(parsed.data);
    const assessment = evaluateRules(signals);

    return {
      status: "ok",
      company: buildCompanyProfile(parsed.data),
      cnaes: buildCnaes(parsed.data),
      partners: buildPartners(parsed.data),
      score: assessment.score,
      recommendation: assessment.recommendation,
      rules: assessment.rules,
    };
  });
