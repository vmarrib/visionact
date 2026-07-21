/**
 * Checagem de Risco (demo ao vivo) — validação e formatação de CNPJ.
 *
 * Validar o dígito verificador ANTES de chamar a BrasilAPI evita gastar uma
 * chamada de rede (e mostrar um erro genérico de "não encontrado") para um
 * CNPJ que é obviamente inválido — o algoritmo é conhecido e determinístico,
 * não depende de nenhuma fonte externa para rodar.
 */

const FIRST_CHECK_DIGIT_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_CHECK_DIGIT_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function computeCheckDigit(digits: number[], weights: number[]): number {
  const sum = digits.reduce((acc, digit, i) => acc + digit * weights[i], 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Remove tudo que não for dígito (pontos, barra, hífen, espaços). */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Valida um CNPJ pelo algoritmo oficial de dígito verificador (módulo 11).
 *
 * Não faz nenhuma chamada de rede — um CNPJ pode ser sintaticamente válido
 * (dígitos verificadores corretos) e ainda assim não corresponder a uma
 * empresa real; essa segunda checagem é responsabilidade da BrasilAPI.
 */
export function isValidCnpj(rawValue: string): boolean {
  const digits = onlyDigits(rawValue);
  if (digits.length !== 14) return false;

  // CNPJs com todos os dígitos iguais (ex.: "00000000000000") passam pela
  // aritmética do módulo 11 mas nunca são documentos reais.
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const numbers = digits.split("").map(Number);
  const base = numbers.slice(0, 12);

  const firstCheckDigit = computeCheckDigit(base, FIRST_CHECK_DIGIT_WEIGHTS);
  const secondCheckDigit = computeCheckDigit([...base, firstCheckDigit], SECOND_CHECK_DIGIT_WEIGHTS);

  return numbers[12] === firstCheckDigit && numbers[13] === secondCheckDigit;
}

/** Formata 14 dígitos como "00.000.000/0001-00". Assume entrada já validada. */
export function formatCnpj(rawValue: string): string {
  const digits = onlyDigits(rawValue);
  if (digits.length !== 14) return rawValue;
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}
