"""Testes de `threshold_calibration.py`."""

from threshold_calibration import (
    false_accept_rate,
    false_reject_rate,
    find_equal_error_rate,
    generate_example_dataset,
    recommend_operating_threshold,
)


def test_false_accept_rate_at_zero_threshold_accepts_everyone():
    """Um limiar de 0 aprova qualquer similaridade — FAR deveria ser 100%."""
    assert false_accept_rate(0.0, [0.1, 0.5, 0.9]) == 1.0


def test_false_accept_rate_at_max_threshold_rejects_everyone():
    """Um limiar de 1 só aprova similaridade perfeita — nenhum impostor real passa."""
    assert false_accept_rate(1.0, [0.1, 0.5, 0.99]) == 0.0


def test_false_reject_rate_at_zero_threshold_accepts_everyone():
    """Um limiar de 0 nunca rejeita um genuíno — FRR deveria ser 0%."""
    assert false_reject_rate(0.0, [0.1, 0.5, 0.9]) == 0.0


def test_far_and_frr_move_in_opposite_directions_as_threshold_rises():
    """
    Esta é a relação fundamental de qualquer sistema biométrico: subir o
    limiar sempre reduz FAR (mais rigoroso com impostores) e sempre aumenta
    ou mantém FRR (mais rigoroso com genuínos também) — nunca os dois
    melhoram ao mesmo tempo só por mexer no limiar.
    """
    genuine = [0.9, 0.85, 0.7, 0.6]
    impostor = [0.5, 0.4, 0.3, 0.2]

    far_low = false_accept_rate(0.3, impostor)
    far_high = false_accept_rate(0.8, impostor)
    frr_low = false_reject_rate(0.3, genuine)
    frr_high = false_reject_rate(0.8, genuine)

    assert far_high <= far_low
    assert frr_high >= frr_low


def test_find_equal_error_rate_on_perfectly_separated_scores_is_near_zero():
    """
    Se genuínos e impostores nunca se sobrepõem, existe um limiar perfeito
    (FAR=0 e FRR=0 ao mesmo tempo) — o EER encontrado deveria refletir isso.
    """
    genuine = [0.9, 0.95, 1.0]
    impostor = [0.0, 0.05, 0.1]

    result = find_equal_error_rate(genuine, impostor)

    assert result.eer < 0.05
    assert 0.1 < result.threshold < 0.9


def test_find_equal_error_rate_on_overlapping_scores_is_higher():
    """Quando as distribuições se sobrepõem bastante, nenhum limiar separa bem — o EER deveria refletir isso."""
    genuine = [0.5, 0.55, 0.6, 0.45]
    impostor = [0.4, 0.45, 0.5, 0.55]

    result = find_equal_error_rate(genuine, impostor)

    assert result.eer > 0.2  # sistemas mal separados têm EER alto


def test_recommend_operating_threshold_respects_far_ceiling():
    """O limiar recomendado nunca deveria resultar em FAR acima do teto pedido."""
    genuine, impostor = generate_example_dataset()

    result = recommend_operating_threshold(genuine, impostor, max_acceptable_far=0.02)

    assert result.far <= 0.02


def test_recommend_operating_threshold_picks_most_permissive_valid_option():
    """
    Entre os limiares que satisfazem o teto de FAR, o escolhido deveria ser
    o MENOR — priorizar o mínimo de atrito para o usuário legítimo, dado
    que a restrição de segurança já está satisfeita.
    """
    genuine, impostor = generate_example_dataset()

    lenient = recommend_operating_threshold(genuine, impostor, max_acceptable_far=0.10)
    strict = recommend_operating_threshold(genuine, impostor, max_acceptable_far=0.01)

    assert lenient.threshold <= strict.threshold


def test_generate_example_dataset_is_deterministic_given_a_seed():
    """A mesma seed deveria sempre gerar o mesmo dataset — essencial para testes reprodutíveis."""
    genuine_a, impostor_a = generate_example_dataset(seed=1)
    genuine_b, impostor_b = generate_example_dataset(seed=1)

    assert genuine_a == genuine_b
    assert impostor_a == impostor_b


def test_generate_example_dataset_genuine_scores_average_higher_than_impostor():
    """Sanity check do gerador: genuínos deveriam, em média, ter similaridade bem mais alta que impostores."""
    genuine, impostor = generate_example_dataset()

    assert (sum(genuine) / len(genuine)) > (sum(impostor) / len(impostor)) + 0.2
