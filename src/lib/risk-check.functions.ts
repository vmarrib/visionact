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
 *
 * Um mesmo CNPJ consultado de novo dentro de 5 minutos é servido do cache
 * (`risk-check-cache.ts`), não gera uma nova chamada à BrasilAPI — mitiga
 * o limite de requisições compartilhado da API pública (ver comentário no
 * arquivo do cache sobre o trade-off de rodar em memória do processo).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { TtlCache } from "./risk-check-cache";
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
const CACHE_TTL_MS = 5 * 60 * 1000;

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

/**
 * Só resultados "ok" e "not_found" são cacheados — ambos são respostas
 * ESTÁVEIS da BrasilAPI para o mesmo CNPJ. "rate_limited" e
 * "upstream_error" são transitórios por natureza; cacheá-los faria a
 * demo continuar mostrando um erro antigo mesmo depois do problema passar.
 */
const cnpjCache = new TtlCache<RiskCheckResult>(CACHE_TTL_MS);

export const checkCnpjRisk = createServerFn({ method: "POST" })
  .inputValidator(z.object({ cnpj: z.string().min(1) }))
  .handler(async ({ data }): Promise<RiskCheckResult> => {
    const digits = onlyDigits(data.cnpj);

    if (!isValidCnpj(digits)) {
      return { status: "invalid_cnpj" };
    }

    const cached = cnpjCache.get(digits);
    if (cached) {
      return cached;
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
      const notFound: RiskCheckResult = { status: "not_found" };
      cnpjCache.set(digits, notFound);
      return notFound;
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

    const result: RiskCheckResult = {
      status: "ok",
      company: buildCompanyProfile(parsed.data),
      cnaes: buildCnaes(parsed.data),
      partners: buildPartners(parsed.data),
      score: assessment.score,
      recommendation: assessment.recommendation,
      rules: assessment.rules,
    };

    cnpjCache.set(digits, result);
    return result;
  });
