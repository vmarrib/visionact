"""
Ponto Inteligente — calibração estatística do raio de geofence.

Mesma pergunta de `threshold_calibration.py`, aplicada à geolocalização:
por que o raio de tolerância do geofence é 150 m, e não 50 m ou 300 m?

Metodologia (calibração empírica por percentil, a mesma técnica usada para
definir SLOs de latência em engenharia de confiabilidade — aqui aplicada a
erro de posicionamento em vez de tempo de resposta):

  1. Colete uma amostra de leituras de GPS reais feitas DENTRO do local
     autorizado (ex.: peça a alguns funcionários para abrir o app parados
     na entrada da planta, por alguns dias, em horários diferentes).
  2. Calcule a distância Haversine de cada leitura até a coordenada exata
     cadastrada do local.
  3. Um raio pequeno demais rejeitaria leituras legítimas com ruído normal
     de GPS; um raio grande demais aceitaria alguém a uma rua de distância.
     A escolha correta é um PERCENTIL da distribuição observada, não um
     "chute redondo" — ex.: o raio que aceitaria 95% das leituras
     legítimas coletadas.

Os valores de exemplo abaixo são SIMULADOS — nenhuma coordenada real de
funcionário ou planta aparece neste repositório.
"""

from __future__ import annotations

import math
import random


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Mesma fórmula de `geofence.ts` — reimplementada aqui em Python para a análise offline."""
    earth_radius_meters = 6_371_000
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(d_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))

    return earth_radius_meters * c


def recommend_geofence_radius(observed_distances_meters: list[float], acceptance_rate: float = 0.95) -> float:
    """
    Retorna o percentil `acceptance_rate` da amostra de distâncias
    observadas — o raio mínimo necessário para aceitar essa fração das
    leituras legítimas coletadas em campo.

    Por que percentil e não média + N desvios-padrão? O erro de GPS não é
    simetricamente distribuído ao redor de zero (não existe distância
    negativa) — a distribuição tem cauda longa à direita (multipath urbano,
    sinal fraco em ambiente fechado). Um percentil direto sobre os dados
    observados não assume nenhuma forma de distribuição, diferente de uma
    regra baseada em desvio-padrão.
    """
    if not observed_distances_meters:
        raise ValueError("é preciso pelo menos uma leitura observada para calibrar o raio")

    sorted_distances = sorted(observed_distances_meters)
    index = math.ceil(acceptance_rate * len(sorted_distances)) - 1
    index = max(0, min(index, len(sorted_distances) - 1))

    return sorted_distances[index]


def generate_example_readings(
    true_lat: float,
    true_lon: float,
    n_readings: int = 200,
    typical_error_meters: float = 25.0,
    seed: int = 7,
) -> list[tuple[float, float]]:
    """
    Simula leituras de GPS ao redor de uma coordenada verdadeira, com erro
    seguindo uma distribuição aproximadamente normal em metros, convertida
    de volta para graus. Não representa nenhuma planta ou local real.
    """
    rng = random.Random(seed)
    meters_per_degree_lat = 111_320.0

    readings = []
    for _ in range(n_readings):
        offset_north = rng.gauss(0, typical_error_meters)
        offset_east = rng.gauss(0, typical_error_meters)

        meters_per_degree_lon = meters_per_degree_lat * math.cos(math.radians(true_lat))

        reading_lat = true_lat + offset_north / meters_per_degree_lat
        reading_lon = true_lon + offset_east / meters_per_degree_lon
        readings.append((reading_lat, reading_lon))

    return readings


if __name__ == "__main__":
    TRUE_LOCATION = (-27.5954, -48.5480)  # exemplo ilustrativo (Florianópolis), não um local real de cliente

    readings = generate_example_readings(*TRUE_LOCATION)
    distances = [haversine_distance_meters(*TRUE_LOCATION, lat, lon) for lat, lon in readings]

    for percentile in (0.5, 0.9, 0.95, 0.99):
        radius = recommend_geofence_radius(distances, acceptance_rate=percentile)
        print(f"Raio para aceitar {percentile:.0%} das leituras legítimas: {radius:.1f} m")
