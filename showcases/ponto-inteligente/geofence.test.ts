/**
 * Testes de `geofence.ts`.
 *
 * Sintaxe Vitest — ver nota em `pitaia/ai-context-service.test.ts` sobre
 * rodar estes testes localmente (este ambiente de portfólio não tem Node).
 *
 * As coordenadas de referência usadas aqui (Praça da Sé, em São Paulo, e um
 * ponto ~0,0105 grau de latitude ao sul) são públicas — a distância entre
 * elas (calculada com a própria fórmula de Haversine, ~1.168 m) foi
 * verificada de forma independente antes de virar asserção de teste, não
 * "chutada" a partir do delta de coordenadas.
 */

import { describe, expect, it } from "vitest";
import { findAuthorizedLocation, haversineDistanceMeters, type AuthorizedLocation } from "./geofence";

const PRACA_DA_SE = { latitude: -23.5505, longitude: -46.6333 };
const NEARBY_POINT = { latitude: -23.561, longitude: -46.6333 };

describe("haversineDistanceMeters", () => {
  it("retorna zero para duas coordenadas idênticas", () => {
    expect(haversineDistanceMeters(PRACA_DA_SE, PRACA_DA_SE)).toBe(0);
  });

  it("calcula uma distância consistente com o valor de referência (~1.168 m)", () => {
    // Tolerância de 20m cobre eventual diferença de precisão numérica entre
    // implementações, não um erro de fórmula.
    const distance = haversineDistanceMeters(PRACA_DA_SE, NEARBY_POINT);

    expect(distance).toBeGreaterThan(1148);
    expect(distance).toBeLessThan(1188);
  });

  it("é simétrica — a distância de A para B é igual à de B para A", () => {
    const ab = haversineDistanceMeters(PRACA_DA_SE, NEARBY_POINT);
    const ba = haversineDistanceMeters(NEARBY_POINT, PRACA_DA_SE);

    expect(ab).toBeCloseTo(ba, 6);
  });
});

describe("findAuthorizedLocation", () => {
  const locations: AuthorizedLocation[] = [
    { id: "planta-a", name: "Planta A", ...PRACA_DA_SE, radiusMeters: 200 },
    { id: "planta-b", name: "Planta B", ...NEARBY_POINT, radiusMeters: 200 },
  ];

  it("retorna null quando nenhum local autorizado contém a posição", () => {
    const farAway = { latitude: -23.6, longitude: -46.7 };

    expect(findAuthorizedLocation(farAway, locations)).toBeNull();
  });

  it("retorna o local quando a posição está dentro do raio configurado", () => {
    const result = findAuthorizedLocation(PRACA_DA_SE, locations);

    expect(result?.id).toBe("planta-a");
  });

  it("escolhe o local MAIS PRÓXIMO quando dois raios se sobrepõem", () => {
    // Um local extra, bem no meio do caminho entre A e B, com raio grande
    // o bastante para sobrepor os dois — o mais próximo da posição exata
    // de "planta-a" deveria continuar sendo "planta-a", não o overlap.
    const overlapping: AuthorizedLocation = {
      id: "overlap",
      name: "Local sobreposto",
      latitude: (PRACA_DA_SE.latitude + NEARBY_POINT.latitude) / 2,
      longitude: PRACA_DA_SE.longitude,
      radiusMeters: 2000,
    };

    const result = findAuthorizedLocation(PRACA_DA_SE, [...locations, overlapping]);

    expect(result?.id).toBe("planta-a");
  });

  it("não seleciona um local fora da lista informada (ex.: local desativado, já filtrado pelo chamador)", () => {
    const result = findAuthorizedLocation(NEARBY_POINT, [locations[0]]);

    expect(result).toBeNull();
  });
});
