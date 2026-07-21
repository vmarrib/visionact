"""Testes de `geofence_calibration.py`."""

import math

from geofence_calibration import (
    generate_example_readings,
    haversine_distance_meters,
    recommend_geofence_radius,
)


def test_haversine_distance_meters_matches_known_reference_value():
    """
    Mesmo par de coordenadas usado em `geofence.test.ts` (Praça da Sé e um
    ponto ~1.168 m ao sul) — o valor de referência é o mesmo nos dois
    idiomas, confirmando que as duas implementações (TS no app, Python na
    calibração) concordam.
    """
    distance = haversine_distance_meters(-23.5505, -46.6333, -23.561, -46.6333)

    assert 1148 < distance < 1188


def test_haversine_distance_meters_is_zero_for_identical_points():
    assert haversine_distance_meters(-27.6, -48.5, -27.6, -48.5) == 0.0


def test_recommend_geofence_radius_at_100_percent_covers_worst_case():
    """No percentil 100%, o raio recomendado precisa ser >= a MAIOR distância observada — nenhuma leitura legítima pode ficar de fora."""
    distances = [10.0, 30.0, 55.0, 90.0]

    radius = recommend_geofence_radius(distances, acceptance_rate=1.0)

    assert radius == 90.0


def test_recommend_geofence_radius_at_50_percent_is_the_median_ish_value():
    """Num conjunto pequeno e ordenado, o percentil 50 deveria cair perto do valor central."""
    distances = [10.0, 20.0, 30.0, 40.0, 50.0]

    radius = recommend_geofence_radius(distances, acceptance_rate=0.5)

    assert radius == 30.0


def test_recommend_geofence_radius_grows_with_acceptance_rate():
    """
    Pedir para aceitar uma fração maior das leituras nunca deveria resultar
    num raio MENOR — a relação é monotônica.
    """
    distances = [5.0, 15.0, 25.0, 35.0, 45.0, 55.0, 65.0, 75.0, 85.0, 95.0]

    r50 = recommend_geofence_radius(distances, acceptance_rate=0.5)
    r95 = recommend_geofence_radius(distances, acceptance_rate=0.95)

    assert r95 >= r50


def test_recommend_geofence_radius_rejects_empty_sample():
    """Calibrar um raio sem nenhuma leitura observada não faz sentido estatístico — deveria falhar de forma explícita."""
    try:
        recommend_geofence_radius([], acceptance_rate=0.95)
        assert False, "deveria ter levantado ValueError"
    except ValueError:
        pass


def test_generate_example_readings_cluster_around_true_location():
    """
    As leituras simuladas deveriam ficar, em média, próximas da coordenada
    verdadeira — não é um gerador de ruído completamente aleatório sem
    relação com o ponto de referência.
    """
    true_lat, true_lon = -27.5954, -48.5480
    readings = generate_example_readings(true_lat, true_lon, n_readings=300, typical_error_meters=20.0)

    distances = [haversine_distance_meters(true_lat, true_lon, lat, lon) for lat, lon in readings]
    mean_distance = sum(distances) / len(distances)

    # Para erro gaussiano 2D com desvio-padrão 20m por eixo, a distância
    # radial média esperada é ~ sigma * sqrt(pi/2) ≈ 25m — checamos uma
    # faixa ampla o suficiente para não ser um teste frágil por sorte de seed.
    assert mean_distance < 40.0


def test_generate_example_readings_is_deterministic_given_a_seed():
    a = generate_example_readings(-27.6, -48.5, n_readings=10, seed=99)
    b = generate_example_readings(-27.6, -48.5, n_readings=10, seed=99)

    assert a == b
