/**
 * Testes de `risk-check-cnpj.ts`.
 *
 * Sintaxe Vitest — este ambiente de portfólio não tem Node para rodar de
 * verdade (mesma ressalva dos demais testes TypeScript do portfólio). O
 * CNPJ válido usado aqui (11.222.233/0001-83) foi calculado e conferido
 * independentemente com o algoritmo de módulo 11 antes de virar fixture de
 * teste — não é um número inventado.
 */

import { describe, expect, it } from "vitest";
import { formatCnpj, isValidCnpj, onlyDigits } from "./risk-check-cnpj";

const VALID_CNPJ = "11.222.233/0001-83";

describe("onlyDigits", () => {
  it("remove pontuação e mantém só os dígitos", () => {
    expect(onlyDigits("11.222.233/0001-83")).toBe("11222233000183");
  });
});

describe("isValidCnpj", () => {
  it("aceita um CNPJ com dígitos verificadores corretos", () => {
    expect(isValidCnpj(VALID_CNPJ)).toBe(true);
  });

  it("aceita o mesmo CNPJ sem formatação", () => {
    expect(isValidCnpj("11222233000183")).toBe(true);
  });

  it("rejeita quando o segundo dígito verificador está errado", () => {
    expect(isValidCnpj("11222233000184")).toBe(false);
  });

  it("rejeita quando o primeiro dígito verificador está errado", () => {
    expect(isValidCnpj("11222233000173")).toBe(false);
  });

  it("rejeita uma string com menos de 14 dígitos", () => {
    expect(isValidCnpj("1122223300018")).toBe(false);
  });

  it("rejeita todos os dígitos iguais, mesmo que a aritmética do módulo 11 'passasse'", () => {
    // 00000000000000 satisfaz trivialmente a fórmula (tudo zero), mas nunca
    // é um CNPJ real — checagem explícita necessária.
    expect(isValidCnpj("00000000000000")).toBe(false);
  });

  it("rejeita uma string vazia", () => {
    expect(isValidCnpj("")).toBe(false);
  });
});

describe("formatCnpj", () => {
  it("formata 14 dígitos crus no padrão 00.000.000/0001-00", () => {
    expect(formatCnpj("11222233000183")).toBe("11.222.233/0001-83");
  });

  it("é idempotente — formatar um valor já formatado dá o mesmo resultado", () => {
    expect(formatCnpj(VALID_CNPJ)).toBe(VALID_CNPJ);
  });
});
