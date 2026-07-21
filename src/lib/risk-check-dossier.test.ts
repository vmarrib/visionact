/**
 * Testes de `risk-check-dossier.ts`.
 *
 * Sintaxe Vitest — ver nota em `risk-check-cnpj.test.ts` sobre rodar
 * localmente (este ambiente de portfólio não tem Node).
 */

import { describe, expect, it } from "vitest";
import {
  buildCnaes,
  buildCompanyProfile,
  buildPartners,
  extractSignals,
  type BrasilApiCnpjResponse,
} from "./risk-check-dossier";

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
    cnae_fiscal: 6201500,
    cnae_fiscal_descricao: "Desenvolvimento de programas de computador",
    cnaes_secundarios: [{ codigo: 6202300, descricao: "Consultoria em TI" }],
    municipio: "FLORIANOPOLIS",
    uf: "SC",
    opcao_pelo_simples: true,
    opcao_pelo_mei: false,
    qsa: [
      { nome_socio: "Fulano de Tal", qualificacao_socio: "Sócio-Administrador" },
      { nome_socio: "Ciclana de Tal", qualificacao_socio: null },
    ],
    ...overrides,
  };
}

describe("buildCompanyProfile", () => {
  it("formata o CNPJ com pontuação", () => {
    expect(buildCompanyProfile(apiResponse()).cnpj).toBe("11.222.233/0001-83");
  });

  it("converte datas ISO para o formato brasileiro dd/mm/aaaa", () => {
    const profile = buildCompanyProfile(apiResponse({ data_inicio_atividade: "2015-06-01" }));
    expect(profile.dataInicioAtividade).toBe("01/06/2015");
  });

  it("formata capital social como moeda brasileira", () => {
    const profile = buildCompanyProfile(apiResponse({ capital_social: 50000 }));
    expect(profile.capitalSocial).toContain("50.000,00");
  });

  it("usa travessão quando o nome fantasia está ausente, em vez de string vazia", () => {
    const profile = buildCompanyProfile(apiResponse({ nome_fantasia: null }));
    expect(profile.nomeFantasia).toBe("—");
  });
});

describe("buildCnaes", () => {
  it("inclui o CNAE principal separado dos secundários", () => {
    const cnaes = buildCnaes(apiResponse());

    expect(cnaes.principal.codigo).toBe("6201500");
    expect(cnaes.principal.descricao).toBe("Desenvolvimento de programas de computador");
    expect(cnaes.secundarios).toHaveLength(1);
    expect(cnaes.secundarios[0].codigo).toBe("6202300");
  });

  it("retorna lista vazia de secundários quando a API não declara nenhum", () => {
    const cnaes = buildCnaes(apiResponse({ cnaes_secundarios: null }));
    expect(cnaes.secundarios).toEqual([]);
  });
});

describe("buildPartners", () => {
  it("retorna o nome e a qualificação de cada sócio", () => {
    const partners = buildPartners(apiResponse());

    expect(partners).toEqual([
      { nome: "Fulano de Tal", qualificacao: "Sócio-Administrador" },
      { nome: "Ciclana de Tal", qualificacao: null },
    ]);
  });

  it("retorna lista vazia quando não há QSA", () => {
    expect(buildPartners(apiResponse({ qsa: null }))).toEqual([]);
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
    const signals = extractSignals(
      apiResponse({ capital_social: 1234, qsa: [{ nome_socio: "X", qualificacao_socio: null }] }),
      referenceDate,
    );

    expect(signals.capitalSocial).toBe(1234);
    expect(signals.numeroSocios).toBe(1);
  });
});
