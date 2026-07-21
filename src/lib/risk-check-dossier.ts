/**
 * Checagem de Risco (demo ao vivo) — schema da BrasilAPI e curadoria do dossiê.
 *
 * Este é "o código que determina os campos do dossiê": a resposta bruta da
 * BrasilAPI tem dezenas de campos (endereço completo, telefones, dados de
 * representante legal...). As funções abaixo decidem explicitamente quais
 * campos aparecem no dossiê final e como são agrupados — curadoria, não um
 * dump da resposta inteira da API.
 */

import { z } from "zod";
import { formatCnpj } from "./risk-check-cnpj";
import type { CompanySignals } from "./risk-check-rules";

/**
 * Subconjunto validado da resposta real da BrasilAPI
 * (GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}). Só os campos que este
 * demo efetivamente usa — validar com Zod aqui significa que uma mudança de
 * schema da API quebra com um erro claro, não com `undefined` silencioso
 * se propagando pela UI.
 */
export const BrasilApiCnpjSchema = z.object({
  cnpj: z.string(),
  razao_social: z.string(),
  nome_fantasia: z.string().nullable().optional(),
  descricao_situacao_cadastral: z.string(),
  data_situacao_cadastral: z.string().nullable().optional(),
  data_inicio_atividade: z.string(),
  descricao_porte: z.string().nullable().optional(),
  capital_social: z.number(),
  cnae_fiscal: z.number().nullable().optional(),
  cnae_fiscal_descricao: z.string().nullable().optional(),
  cnaes_secundarios: z
    .array(z.object({ codigo: z.number(), descricao: z.string() }))
    .nullable()
    .optional(),
  municipio: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
  opcao_pelo_simples: z.boolean().nullable().optional(),
  opcao_pelo_mei: z.boolean().nullable().optional(),
  qsa: z
    .array(z.object({ nome_socio: z.string(), qualificacao_socio: z.string().nullable().optional() }))
    .nullable()
    .optional(),
});

export type BrasilApiCnpjResponse = z.infer<typeof BrasilApiCnpjSchema>;

export interface CompanyProfile {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
  dataSituacaoCadastral: string;
  dataInicioAtividade: string;
  porte: string;
  capitalSocial: string;
  municipio: string;
  uf: string;
  optanteSimples: boolean;
}

export interface CnaeInfo {
  codigo: string;
  descricao: string;
}

export interface Partner {
  nome: string;
  qualificacao: string | null;
}

function formatBrDate(date: string | null | undefined): string {
  if (!date) return "—";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Dados cadastrais básicos — a metade "quem é a empresa" do dossiê. */
export function buildCompanyProfile(data: BrasilApiCnpjResponse): CompanyProfile {
  return {
    cnpj: formatCnpj(data.cnpj),
    razaoSocial: data.razao_social,
    nomeFantasia: data.nome_fantasia || "—",
    situacaoCadastral: data.descricao_situacao_cadastral,
    dataSituacaoCadastral: formatBrDate(data.data_situacao_cadastral),
    dataInicioAtividade: formatBrDate(data.data_inicio_atividade),
    porte: data.descricao_porte || "—",
    capitalSocial: formatBRL(data.capital_social),
    municipio: data.municipio || "—",
    uf: data.uf || "—",
    optanteSimples: Boolean(data.opcao_pelo_simples),
  };
}

/**
 * CNAEs (principal + secundários) — pedido explicitamente no plural: uma
 * empresa quase sempre declara mais de uma atividade econômica, e um dossiê
 * que mostra só o CNAE principal esconde atividades secundárias que também
 * importam para avaliação de risco (ex.: uma empresa de alimentos que
 * também declara atividade financeira secundária).
 */
export function buildCnaes(data: BrasilApiCnpjResponse): { principal: CnaeInfo; secundarios: CnaeInfo[] } {
  return {
    principal: {
      codigo: data.cnae_fiscal != null ? String(data.cnae_fiscal) : "—",
      descricao: data.cnae_fiscal_descricao || "—",
    },
    secundarios: (data.cnaes_secundarios ?? []).map((c) => ({
      codigo: String(c.codigo),
      descricao: c.descricao,
    })),
  };
}

/**
 * Quadro societário nominal — pedido explicitamente por nome, não só a
 * contagem: para due diligence, QUEM são os sócios é o dado relevante, a
 * contagem sozinha (usada como sinal de risco em `risk-check-rules.ts`) não
 * substitui mostrar os nomes no dossiê.
 */
export function buildPartners(data: BrasilApiCnpjResponse): Partner[] {
  return (data.qsa ?? []).map((s) => ({
    nome: s.nome_socio,
    qualificacao: s.qualificacao_socio ?? null,
  }));
}

/**
 * Converte a resposta bruta da API nos sinais de negócio que o motor de
 * regras (`risk-check-rules.ts`) de fato avalia — a mesma separação
 * "sinal normalizado, motor de regras não sabe a origem" usada no
 * showcase PySpark de `checagem-de-risco/`, só que aqui com uma única
 * fonte (BrasilAPI) em vez de várias.
 */
export function extractSignals(data: BrasilApiCnpjResponse, referenceDate: Date = new Date()): CompanySignals {
  const startDate = new Date(data.data_inicio_atividade);
  const monthsSinceOpening =
    (referenceDate.getFullYear() - startDate.getFullYear()) * 12 +
    (referenceDate.getMonth() - startDate.getMonth());

  return {
    situacaoAtiva: data.descricao_situacao_cadastral.toUpperCase() === "ATIVA",
    mesesDesdeAbertura: Math.max(0, monthsSinceOpening),
    capitalSocial: data.capital_social,
    numeroSocios: data.qsa?.length ?? 0,
  };
}
