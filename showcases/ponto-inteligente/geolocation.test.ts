/**
 * Testes de `geolocation.ts`.
 *
 * `getCurrentPosition` depende da Geolocation API do navegador (não existe
 * fora de um browser real) — por isso não é testada aqui por unidade; o que
 * é testado é a lógica pura em torno dela: a decisão de confiabilidade da
 * leitura e as mensagens de erro por tipo de falha. Ver nota em
 * `pitaia/ai-context-service.test.ts` sobre rodar localmente.
 */

import { describe, expect, it } from "vitest";
import { describeAcquisitionError, isReadingReliable, type GeoReading } from "./geolocation";

function reading(accuracyMeters: number): GeoReading {
  return { latitude: 0, longitude: 0, accuracyMeters, capturedAt: new Date() };
}

describe("isReadingReliable", () => {
  it("aceita uma leitura de GPS de boa precisão (poucos metros de erro)", () => {
    expect(isReadingReliable(reading(10))).toBe(true);
  });

  it("aceita uma leitura exatamente no limite de precisão aceitável", () => {
    expect(isReadingReliable(reading(75))).toBe(true);
  });

  it("rejeita uma leitura imprecisa (ex.: dentro de um galpão, sinal de rede em vez de GPS)", () => {
    expect(isReadingReliable(reading(150))).toBe(false);
  });
});

describe("describeAcquisitionError", () => {
  it("orienta o usuário a ativar a localização quando a permissão foi negada", () => {
    expect(describeAcquisitionError("permission_denied")).toMatch(/ative o acesso/i);
  });

  it("orienta o usuário a tentar em área aberta quando a leitura expira", () => {
    expect(describeAcquisitionError("timeout")).toMatch(/tente novamente/i);
  });

  it("informa indisponibilidade quando o dispositivo não suporta geolocalização", () => {
    expect(describeAcquisitionError("position_unavailable")).toMatch(/indisponível/i);
  });

  it("retorna uma mensagem distinta para cada tipo de erro — nunca um texto genérico repetido", () => {
    const messages = [
      describeAcquisitionError("permission_denied"),
      describeAcquisitionError("timeout"),
      describeAcquisitionError("position_unavailable"),
    ];

    expect(new Set(messages).size).toBe(3);
  });
});
