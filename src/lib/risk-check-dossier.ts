/**
 * Checagem de Risco (demo ao vivo) — schema da BrasilAPI e curadoria do dossiê.
 *
 * Este é "o código que determina os campos do dossiê": a resposta bruta da
 * BrasilAPI tem dezenas de campos (CNAEs secundários, endereço completo,
 * telefones, dados de representante legal...). `buildDossierFields` decide
 * explicitamente quais campos aparecem no dossiê final — curadoria, não um
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
  cnae_fiscal_descricao: z.string().nullable().optional(),
  municipio: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
  opcao_pelo_simples: z.boolean().nullable().optional(),
  opcao_pelo_mei: z.boolean().nullable().optional(),
  qsa: z.array(z.object({ nome_socio: z.string() })).nullable().optional(),
});

export type BrasilApiCnpjResponse = z.infer<typeof BrasilApiCnpjSchema>;

export interface DossierField {
  label: string;
  value: string;
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

/**
 * Decide quais campos da resposta da BrasilAPI compõem o dossiê exibido ao
 * usuário, e em que formato/ordem — a mesma informação bruta poderia virar
 * um dossiê bem diferente dependendo do que a organização considera
 * relevante (ex.: um dossiê de crédito destacaria capital social; um de
 * compliance destacaria situação cadastral e quadro societário).
 */
export function buildDossierFields(data: BrasilApiCnpjResponse): DossierField[] {
  return [
    { label: "CNPJ", value: formatCnpj(data.cnpj) },
    { label: "Razão social", value: data.razao_social },
    { label: "Nome fantasia", value: data.nome_fantasia || "—" },
    { label: "Situação cadastral", value: data.descricao_situacao_cadastral },
    { label: "Data da situação cadastral", value: formatBrDate(data.data_situacao_cadastral) },
    { label: "Início de atividade", value: formatBrDate(data.data_inicio_atividade) },
    { label: "Porte", value: data.descricao_porte || "—" },
    { label: "Capital social", value: formatBRL(data.capital_social) },
    { label: "Atividade principal", value: data.cnae_fiscal_descricao || "—" },
    { label: "Município / UF", value: `${data.municipio ?? "—"} / ${data.uf ?? "—"}` },
    { label: "Optante pelo Simples Nacional", value: data.opcao_pelo_simples ? "Sim" : "Não" },
    { label: "Sócios registrados (QSA)", value: String(data.qsa?.length ?? 0) },
  ];
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
