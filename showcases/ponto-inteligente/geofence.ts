/**
 * Ponto Inteligente — amostra de geofencing.
 *
 * Generalizado a partir do código real: nomes reais de local e o raio de
 * tolerância configurado por cliente foram substituídos por um exemplo.
 *
 * Decisão: implementar a fórmula de Haversine diretamente em vez de trazer
 * uma biblioteca de geolocalização. É uma fórmula matemática estável e bem
 * documentada, fácil de testar isoladamente com coordenadas conhecidas (ex.:
 * a distância entre dois pontos de referência famosos é um valor público) —
 * não há necessidade de uma dependência externa para ~15 linhas de código
 * que não mudam.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface AuthorizedLocation extends Coordinates {
  id: string;
  name: string;
  radiusMeters: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Distância em metros entre duas coordenadas usando a fórmula de Haversine.
 *
 * Por que Haversine e não uma distância euclidiana simples entre
 * lat/long? Graus de latitude e longitude não representam a mesma distância
 * física em todo lugar do planeta (um grau de longitude "encolhe" perto dos
 * polos) — Haversine leva a curvatura da Terra em conta, com erro
 * desprezível para distâncias curtas como um raio de local de trabalho.
 */
export function haversineDistanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Encontra, entre os locais autorizados ativos, o mais próximo que contém
 * a posição atual dentro do próprio raio de tolerância.
 *
 * Por que "o mais próximo que contém", e não "o primeiro que contém"?
 * Locais autorizados podem ter raios sobrepostos (ex.: dois postos de
 * trabalho próximos um do outro) — usar o mais próximo evita atribuir uma
 * batida de ponto ao local errado quando os dois raios se sobrepõem.
 */
export function findAuthorizedLocation(
  position: Coordinates,
  locations: AuthorizedLocation[],
): AuthorizedLocation | null {
  const withinRange = locations
    .map((location) => ({
      location,
      distance: haversineDistanceMeters(position, location),
    }))
    .filter(({ location, distance }) => distance <= location.radiusMeters)
    .sort((a, b) => a.distance - b.distance);

  return withinRange[0]?.location ?? null;
}
