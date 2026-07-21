"""
Testes de `sources.py`.

Nenhum destes testes usa rede real, PySpark, nem a biblioteca `requests` —
`_query_source_with_retry` recebe um objeto `session` fake que implementa só
o método `.get()`, o suficiente para testar a lógica de decisão (o que conta
como "encontrado", "não encontrado" e "indisponível") isoladamente.
"""

from sources import EXAMPLE_SOURCES, StructuredSource, _query_source_with_retry, _to_signal_row


class FakeResponse:
    def __init__(self, status_code: int, body: dict | None = None):
        self.status_code = status_code
        self._body = body or {}

    def json(self) -> dict:
        return self._body


class FakeSession:
    """
    Sessão fake cujo `.get()` retorna, em sequência, os itens de `responses`.
    Uma exceção na lista é levantada em vez de retornada — simula falha de
    rede (timeout, conexão recusada) num attempt específico.
    """

    def __init__(self, responses: list):
        self._responses = list(responses)
        self.calls = 0

    def get(self, url: str, timeout: float):
        self.calls += 1
        item = self._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


SOURCE = StructuredSource(signal_id="registry", base_url="https://example.invalid", max_retries=2)


def test_match_found_returns_hit_on_first_try():
    """Uma resposta 200 com `match: true` é um sinal 'hit', sem precisar de retry."""
    session = FakeSession([FakeResponse(200, {"match": True})])

    result = _query_source_with_retry(session, SOURCE, "123")

    assert result == {"status": "hit", "detail": None}
    assert session.calls == 1


def test_no_match_returns_no_hit():
    """Uma resposta 200 com `match: false` é 'no_hit' — a fonte respondeu, só não achou nada."""
    session = FakeSession([FakeResponse(200, {"match": False})])

    result = _query_source_with_retry(session, SOURCE, "123")

    assert result == {"status": "no_hit", "detail": None}


def test_404_is_treated_as_no_hit_not_as_error():
    """
    Regra de negócio documentada em sources.py: algumas fontes reais respondem
    404/403 quando não encontram o documento, em vez de 200 com corpo vazio.
    Isso não deveria contar como falha nem consumir um retry.
    """
    session = FakeSession([FakeResponse(404)])

    result = _query_source_with_retry(session, SOURCE, "123")

    assert result == {"status": "no_hit", "detail": None}
    assert session.calls == 1  # não tentou de novo — 404 não é uma falha transitória


def test_transient_failure_then_success_is_retried():
    """
    Uma exceção de rede na primeira tentativa não deveria ser fatal: a
    segunda tentativa (dentro de max_retries) que tiver sucesso deve
    prevalecer, e o resultado final não deve carregar o erro da tentativa
    anterior.
    """
    session = FakeSession([ConnectionError("timeout transitório"), FakeResponse(200, {"match": True})])

    result = _query_source_with_retry(session, SOURCE, "123")

    assert result == {"status": "hit", "detail": None}
    assert session.calls == 2


def test_exhausting_retries_returns_unavailable_with_reason():
    """
    Quando TODAS as tentativas falham, o sinal final é 'unavailable' — nunca
    uma exceção propagada, que derrubaria o processamento das outras linhas
    da mesma partição no pipeline real.
    """
    session = FakeSession(
        [ConnectionError("erro 1"), ConnectionError("erro 2"), ConnectionError("erro 3")]
    )

    result = _query_source_with_retry(session, SOURCE, "123")

    assert result["status"] == "unavailable"
    assert "erro 3" in result["detail"]  # motivo da ÚLTIMA tentativa, não da primeira
    assert session.calls == SOURCE.max_retries + 1


def test_to_signal_row_gives_max_intensity_to_structured_hit():
    """
    Sinais de fontes estruturadas são binários por natureza: um 'hit' vale
    intensidade máxima (1.0), diferente de um sinal de mídia (ver
    test_media_check.py), cuja intensidade é proporcional a evidência
    corroborante.
    """
    row = _to_signal_row(SOURCE, "123", {"status": "hit", "detail": None})

    assert row["intensity"] == 1.0
    assert row["kind"] == "structured"


def test_to_signal_row_gives_zero_intensity_to_no_hit():
    row = _to_signal_row(SOURCE, "123", {"status": "no_hit", "detail": None})

    assert row["intensity"] == 0.0


def test_example_sources_have_unique_signal_ids():
    """
    Sanity check de configuração: dois adapters com o mesmo signal_id
    colidiriam silenciosamente no agrupamento por contraparte do motor de
    regras — um erro de configuração que só apareceria em produção sem este
    teste.
    """
    ids = [s.signal_id for s in EXAMPLE_SOURCES]
    assert len(ids) == len(set(ids))
