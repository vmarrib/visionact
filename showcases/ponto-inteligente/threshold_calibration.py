"""
Ponto Inteligente — calibração estatística do limiar de FaceMatch.

Este arquivo responde a uma pergunta que o código do app (`face-match-client.ts`)
não responde sozinho: por que o limiar de similaridade é 0.6, e não 0.5 ou 0.8?

A resposta correta não é "escolhi um número que parecia razoável" — é uma
análise estatística clássica de sistemas biométricos, feita OFFLINE (uma vez,
numa fase de calibração) antes do valor virar uma constante no código que
roda no celular do funcionário:

  1. Colete pares de comparação rotulados: "genuínos" (selfie × referência da
     MESMA pessoa) e "impostores" (selfie × referência de pessoas diferentes).
  2. Para cada limiar candidato, calcule:
       FAR (False Accept Rate)  = % de impostores que o limiar aprovaria
       FRR (False Reject Rate)  = % de genuínos que o limiar reprovaria
  3. Ache o EER (Equal Error Rate) — o ponto onde FAR e FRR se cruzam. É a
     métrica padrão da indústria para comparar sistemas biométricos entre si.
  4. Escolha o limiar final não necessariamente no EER, mas no ponto que
     reflete a prioridade de negócio: para ponto eletrônico, aprovar um
     impostor (fraude) é pior do que um funcionário legítimo precisar tentar
     de novo — então o limiar real fica um pouco ACIMA do EER, priorizando
     FAR baixo mesmo à custa de mais FRR.

Os escores de exemplo abaixo são SIMULADOS (gerados por uma distribuição
conhecida, não capturados de pessoas reais) — nenhum dado biométrico real
aparece neste repositório.
"""

from __future__ import annotations

import random
from dataclasses import dataclass


def false_accept_rate(threshold: float, impostor_scores: list[float]) -> float:
    """
    Fração de comparações de PESSOAS DIFERENTES que o limiar aprovaria
    (similaridade >= threshold). É a métrica que mais importa para
    segurança: cada ponto percentual de FAR é uma fraude potencial que o
    sistema deixaria passar.
    """
    if not impostor_scores:
        return 0.0
    return sum(1 for s in impostor_scores if s >= threshold) / len(impostor_scores)


def false_reject_rate(threshold: float, genuine_scores: list[float]) -> float:
    """
    Fração de comparações da MESMA pessoa que o limiar reprovaria
    (similaridade < threshold). É a métrica que mais importa para
    usabilidade: cada ponto percentual de FRR é um funcionário legítimo
    tendo que tentar bater o ponto de novo.
    """
    if not genuine_scores:
        return 0.0
    return sum(1 for s in genuine_scores if s < threshold) / len(genuine_scores)


@dataclass(frozen=True)
class EqualErrorPoint:
    threshold: float
    far: float
    frr: float
    eer: float  # média de FAR e FRR no ponto de cruzamento


def find_equal_error_rate(
    genuine_scores: list[float],
    impostor_scores: list[float],
    resolution: int = 200,
) -> EqualErrorPoint:
    """
    Varre limiares de 0 a 1 e retorna o ponto onde |FAR - FRR| é mínimo — o
    Equal Error Rate. É a métrica padrão para RELATAR a qualidade de um
    sistema biométrico (quanto menor o EER, melhor o sistema separa
    genuínos de impostores), mas não é necessariamente o limiar que se usa
    em produção — ver `recommend_operating_threshold`.
    """
    best: EqualErrorPoint | None = None

    for step in range(resolution + 1):
        threshold = step / resolution
        far = false_accept_rate(threshold, impostor_scores)
        frr = false_reject_rate(threshold, genuine_scores)
        diff = abs(far - frr)

        if best is None or diff < abs(best.far - best.frr):
            best = EqualErrorPoint(threshold=threshold, far=far, frr=frr, eer=(far + frr) / 2)

    assert best is not None
    return best


def recommend_operating_threshold(
    genuine_scores: list[float],
    impostor_scores: list[float],
    max_acceptable_far: float,
    resolution: int = 200,
) -> EqualErrorPoint:
    """
    Recomenda o limiar de OPERAÇÃO (o que de fato vai para o código),
    priorizando FAR baixo — decisão de negócio explícita para ponto
    eletrônico: aprovar um impostor é mais caro (fraude, passivo
    trabalhista) do que um funcionário legítimo tentar de novo.

    Entre todos os limiares que mantêm FAR <= max_acceptable_far, escolhe o
    MENOR (o mais permissivo possível dentro da restrição de segurança) —
    isso minimiza o FRR resultante, sem violar o teto de FAR aceitável.
    """
    candidates: list[EqualErrorPoint] = []

    for step in range(resolution + 1):
        threshold = step / resolution
        far = false_accept_rate(threshold, impostor_scores)
        if far <= max_acceptable_far:
            frr = false_reject_rate(threshold, genuine_scores)
            candidates.append(EqualErrorPoint(threshold=threshold, far=far, frr=frr, eer=(far + frr) / 2))

    if not candidates:
        raise ValueError(
            f"nenhum limiar testado mantém FAR <= {max_acceptable_far}; "
            "o modelo de descritores pode não separar bem genuínos de impostores"
        )

    return min(candidates, key=lambda c: c.threshold)


def generate_example_dataset(
    n_genuine: int = 500,
    n_impostor: int = 500,
    seed: int = 42,
) -> tuple[list[float], list[float]]:
    """
    Gera um dataset SIMULADO de escores de similaridade — nenhuma foto ou
    descritor facial real é usado. Modelado como duas distribuições normais
    truncadas em [0, 1], com sobreposição parcial (como acontece em
    sistemas reais: a separação nunca é perfeita).

    Genuínos: média alta (0.85), pouca variância — pessoas comparadas
    consigo mesmas tendem a ter similaridade alta e consistente.
    Impostores: média baixa (0.35), variância maior — pessoas diferentes
    têm similaridade baixa, mas com cauda mais larga (parecenças ocasionais).
    """
    rng = random.Random(seed)

    def clamp(x: float) -> float:
        return max(0.0, min(1.0, x))

    genuine = [clamp(rng.gauss(0.85, 0.08)) for _ in range(n_genuine)]
    impostor = [clamp(rng.gauss(0.35, 0.15)) for _ in range(n_impostor)]

    return genuine, impostor


if __name__ == "__main__":
    genuine, impostor = generate_example_dataset()

    eer_point = find_equal_error_rate(genuine, impostor)
    print(f"EER: threshold={eer_point.threshold:.3f} far={eer_point.far:.3f} frr={eer_point.frr:.3f}")

    operating_point = recommend_operating_threshold(genuine, impostor, max_acceptable_far=0.02)
    print(
        f"Limiar recomendado (FAR <= 2%): threshold={operating_point.threshold:.3f} "
        f"far={operating_point.far:.3f} frr={operating_point.frr:.3f}"
    )
