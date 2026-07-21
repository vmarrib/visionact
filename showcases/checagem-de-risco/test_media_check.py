"""
Testes de `media_check.py`.

Assim como em `test_sources.py`, nenhum teste aqui faz uma busca de verdade:
`FakeNewsSearchClient` implementa só `.search()`, retornando artigos
fabricados — o que se testa é a normalização, dedup, casamento de regras e o
cálculo de intensidade, não a integração com um provedor de busca real.
"""

from datetime import datetime, timedelta, timezone

from media_check import (
    Article,
    MediaKeywordRule,
    build_media_signals,
    deduplicate_articles,
    match_keyword_rules,
    normalize_text,
    score_media_hits,
)

NOW = datetime(2026, 6, 1, tzinfo=timezone.utc)

RULES = (
    MediaKeywordRule(signal_id="media_fraud_mention", keywords=("fraude",)),
    MediaKeywordRule(signal_id="media_investigation_mention", keywords=("investigacao",)),
)


def _article(title: str, snippet: str = "", days_ago: int = 1) -> Article:
    return Article(
        title=title,
        snippet=snippet,
        url=f"https://example.invalid/{title}",
        published_at=NOW - timedelta(days=days_ago),
    )


class FakeNewsSearchClient:
    def __init__(self, results: list[dict]):
        self._results = results

    def search(self, query: str) -> list[dict]:
        return self._results


def test_normalize_text_removes_accents_and_case():
    """
    'Investigação' (fonte A) e 'investigacao' (fonte B, sem acento) precisam
    casar contra a MESMA palavra-chave — normalização é o que garante isso.
    """
    assert normalize_text("Investigação") == normalize_text("investigacao") == "investigacao"


def test_normalize_text_collapses_whitespace():
    assert normalize_text("fraude   fiscal\n\tgrave") == "fraude fiscal grave"


def test_deduplicate_articles_by_normalized_title():
    """
    Duas fontes publicando a mesma notícia com o mesmo título (uma com
    acento, outra sem) devem contar como UM artigo, não dois — senão a
    intensidade do sinal seria inflada artificialmente por republicação.
    """
    articles = [
        _article("Empresa é alvo de investigação"),
        _article("empresa e alvo de investigacao"),  # mesmo título, normalizado
        _article("Outra notícia completamente diferente"),
    ]

    unique = deduplicate_articles(articles)

    assert len(unique) == 2


def test_match_keyword_rules_matches_in_title_or_snippet():
    article = _article(title="Nada aqui", snippet="suspeita de fraude em contrato")

    matched = match_keyword_rules(article, RULES)

    assert matched == ["media_fraud_mention"]


def test_match_keyword_rules_returns_multiple_rules_when_applicable():
    article = _article(title="Fraude e investigação no mesmo caso")

    matched = match_keyword_rules(article, RULES)

    assert set(matched) == {"media_fraud_mention", "media_investigation_mention"}


def test_match_keyword_rules_returns_empty_when_no_keyword_present():
    article = _article(title="Empresa anuncia resultados trimestrais")

    assert match_keyword_rules(article, RULES) == []


def test_score_media_hits_scales_linearly_below_ceiling():
    """Um artigo corroborante deve pesar menos que três, não a mesma coisa."""
    assert score_media_hits(1) < score_media_hits(2) < score_media_hits(3)


def test_score_media_hits_saturates_at_ceiling():
    """
    Acima do teto de corroboração, mais artigos não aumentam mais a
    intensidade — 6 artigos não deveriam pesar o dobro de 3.
    """
    assert score_media_hits(3) == 1.0
    assert score_media_hits(6) == 1.0


def test_score_media_hits_zero_articles_is_zero_intensity():
    assert score_media_hits(0) == 0.0


def test_build_media_signals_no_hit_when_nothing_matches():
    """
    Nenhuma regra casada ainda deve produzir um sinal explícito 'no_hit' —
    isso é o que distingue "checagem rodou e não achou nada" de "a checagem
    nem rodou", algo que o dossiê final precisa poder diferenciar.
    """
    client = FakeNewsSearchClient(
        [{"title": "Resultado trimestral", "url": "https://x", "published_at": NOW.isoformat()}]
    )

    signals = build_media_signals("doc-1", "Empresa Exemplo", client, RULES, now=NOW)

    assert len(signals) == 1
    assert signals[0]["status"] == "no_hit"
    assert signals[0]["intensity"] == 0.0


def test_build_media_signals_articles_outside_lookback_window_are_ignored():
    """
    Uma notícia de fraude de 3 anos atrás não deveria pesar como se fosse
    recente — está fora da janela de MEDIA_LOOKBACK_DAYS (365 dias) e é
    filtrada antes mesmo do casamento de regras.
    """
    client = FakeNewsSearchClient(
        [
            {
                "title": "Fraude descoberta",
                "url": "https://x",
                "published_at": (NOW - timedelta(days=365 * 3)).isoformat(),
            }
        ]
    )

    signals = build_media_signals("doc-1", "Empresa Exemplo", client, RULES, now=NOW)

    assert signals[0]["status"] == "no_hit"


def test_build_media_signals_hit_carries_proportional_intensity():
    client = FakeNewsSearchClient(
        [
            {"title": "Fraude no fornecedor A", "url": "https://a", "published_at": NOW.isoformat()},
            {"title": "Fraude no fornecedor B", "url": "https://b", "published_at": NOW.isoformat()},
        ]
    )

    signals = build_media_signals("doc-1", "Empresa Exemplo", client, RULES, now=NOW)

    assert len(signals) == 1
    assert signals[0]["signal_id"] == "media_fraud_mention"
    assert signals[0]["status"] == "hit"
    assert signals[0]["intensity"] == score_media_hits(2)


def test_build_media_signals_search_failure_yields_unavailable():
    """Uma falha na busca (ex.: provedor fora do ar) não deveria propagar exceção para o chamador."""

    class BrokenClient:
        def search(self, query: str):
            raise RuntimeError("provedor de busca fora do ar")

    signals = build_media_signals("doc-1", "Empresa Exemplo", BrokenClient(), RULES, now=NOW)

    assert signals[0]["status"] == "unavailable"
    assert "fora do ar" in signals[0]["detail"]
