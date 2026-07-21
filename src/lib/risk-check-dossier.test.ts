/**
 * Testes de `risk-check-dossier.ts`.
 *
 * Sintaxe Vitest — ver nota em `risk-check-cnpj.test.ts` sobre rodar
 * localmente (este ambiente de portfólio não tem Node).
 */

import { describe, expect, it } from "vitest";
import { buildDossierFields, extractSignals, type BrasilApiCnpjResponse } from "./risk-check-dossier";

function apiResponse(overrides: Partial<BrasilApiCnpjResponse> = {}): BrasilApiCnpjResponse {
  return {
    cnpj: "11222233000183",
    razao_social: "EMPRESA EXEMPLO LTDA",
    nome_fantasia: "Exemplo",
    descricao_situacao_cadastral: "ATIVA",
    data_situacao_cadastral: "2020-01-15",
    data_inicio_atividade: "2015-06-01",
    descricao_porte: "DEMAIS",
    capital_social: 50_000,
    cnae_fiscal_descricao: "Desenvolvimento de programas de computador",
    municipio: "FLORIANOPOLIS",
    uf: "SC",
    opcao_pelo_simples: true,
    opcao_pelo_mei: false,
    qsa: [{ nome_socio: "Fulano de Tal" }, { nome_socio: "Ciclana de Tal" }],
    ...overrides,
  };
}

describe("buildDossierFields", () => {
  it("formata o CNPJ com pontuação no dossiê", () => {
    const fields = buildDossierFields(apiResponse());

    expect(fields.find((f) => f.label === "CNPJ")?.value).toBe("11.222.233/0001-83");
  });

  it("converte datas ISO para o formato brasileiro dd/mm/aaaa", () => {
    const fields = buildDossierFields(apiResponse({ data_inicio_atividade: "2015-06-01" }));

    expect(fields.find((f) => f.label === "Início de atividade")?.value).toBe("01/06/2015");
  });

  it("formata capital social como moeda brasileira", () => {
    const fields = buildDossierFields(apiResponse({ capital_social: 50000 }));

    const value = fields.find((f) => f.label === "Capital social")?.value ?? "";
    expect(value).toContain("50.000,00");
  });

  it("usa travessão quando o nome fantasia está ausente, em vez de string vazia", () => {
    const fields = buildDossierFields(apiResponse({ nome_fantasia: null }));

    expect(fields.find((f) => f.label === "Nome fantasia")?.value).toBe("—");
  });

  it("conta corretamente o número de sócios do QSA", () => {
    const fields = buildDossierFields(apiResponse({ qsa: [{ nome_socio: "A" }] }));

    expect(fields.find((f) => f.label === "Sócios registrados (QSA)")?.value).toBe("1");
  });

  it("reporta zero sócios quando o QSA vem nulo", () => {
    const fields = buildDossierFields(apiResponse({ qsa: null }));

    expect(fields.find((f) => f.label === "Sócios registrados (QSA)")?.value).toBe("0");
  });
});

describe("extractSignals", () => {
  const referenceDate = new Date("2026-07-01T00:00:00Z");

  it("marca situação ativa corretamente a partir da descrição da API", () => {
    const signals = extractSignals(apiResponse({ descricao_situacao_cadastral: "ATIVA" }), referenceDate);

    expect(signals.situacaoAtiva).toBe(true);
  });

  it("marca situação inativa para qualquer descrição diferente de ATIVA", () => {
    const signals = extractSignals(apiResponse({ descricao_situacao_cadastral: "BAIXADA" }), referenceDate);

    expect(signals.situacaoAtiva).toBe(false);
  });

  it("calcula meses desde a abertura a partir da data de início de atividade", () => {
    const signals = extractSignals(apiResponse({ data_inicio_atividade: "2026-05-01" }), referenceDate);

    expect(signals.mesesDesdeAbertura).toBe(2);
  });

  it("nunca retorna meses negativos, mesmo com data de abertura no 'futuro' por erro de dado", () => {
    const signals = extractSignals(apiResponse({ data_inicio_atividade: "2026-12-01" }), referenceDate);

    expect(signals.mesesDesdeAbertura).toBe(0);
  });

  it("repassa capital social e número de sócios diretamente", () => {
    const signals = extractSignals(apiResponse({ capital_social: 1234, qsa: [{ nome_socio: "X" }] }), referenceDate);

    expect(signals.capitalSocial).toBe(1234);
    expect(signals.numeroSocios).toBe(1);
  });
});
