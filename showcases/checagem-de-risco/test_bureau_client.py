"""Testes de bureau_client.py — todos com pytest puro, sem PySpark."""

import bureau_client
from bureau_client import fetch_bureau_record, infer_tipo_documento, parse_bureau_payload


def _sem_sleep_de_verdade(monkeypatch):
    """Os testes de retry não deveriam esperar o backoff exponencial de
    verdade — só verificar quantas tentativas aconteceram."""
    monkeypatch.setattr(bureau_client.time, "sleep", lambda _seconds: None)


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self) -> dict:
        return self._payload


class _FakeSession:
    """Simula uma sequência de respostas HTTP, uma por chamada a `.get`."""

    def __init__(self, respostas):
        self._respostas = list(respostas)
        self.chamadas = 0

    def get(self, url, timeout):
        self.chamadas += 1
        item = self._respostas.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def test_infer_tipo_documento_cpf():
    assert infer_tipo_documento("12345678900") == "PF"


def test_infer_tipo_documento_cnpj():
    assert infer_tipo_documento("12345678000199") == "PJ"


def test_parse_bureau_payload_campo_ausente_usa_default_neutro():
    """Bureau respondeu mas omitiu score_externo_bureau: default é o meio
    da escala (neutro), não o pior caso — diferente de documento não
    encontrado."""
    record = parse_bureau_payload("12345678000199", {"nome": "Fornecedor Exemplo LTDA"})
    assert record.encontrado is True
    assert record.score_externo_bureau == 500.0
    assert record.situacao_cadastral == "DESCONHECIDA"


def test_parse_bureau_payload_campos_completos():
    payload = {
        "tipo_documento": "PJ",
        "nome": "Fornecedor Exemplo LTDA",
        "situacao_cadastral": "ATIVA",
        "tempo_atividade_meses": 48,
        "quantidade_socios": 2,
        "possui_sancao_ativa": False,
        "processos_civeis": 1,
        "processos_criminais": 0,
        "processos_trabalhistas": 3,
        "mandados_prisao_ativos": 0,
        "protestos": 1,
        "cheques_sem_fundo": 0,
        "divida_ativa": 5000.0,
        "capital_social_ou_renda_mensal": 20000.0,
        "faturamento_estimado_anual": 500000.0,
        "score_externo_bureau": 720.0,
        "setor_atividade": "TECNOLOGIA",
    }
    record = parse_bureau_payload("12345678000199", payload)
    assert record.tempo_atividade_meses == 48
    assert record.processos_trabalhistas == 3
    assert record.setor_atividade == "TECNOLOGIA"


def test_fetch_bureau_record_sucesso_na_primeira_tentativa():
    session = _FakeSession([_FakeResponse(200, {"nome": "Empresa X", "situacao_cadastral": "ATIVA"})])
    record = fetch_bureau_record(session, "https://fake", "12345678000199")
    assert record.encontrado is True
    assert record.nome == "Empresa X"
    assert session.chamadas == 1


def test_fetch_bureau_record_404_nao_consome_retry_e_nao_retenta():
    """404 é resposta válida (documento não cadastrado), não uma falha
    transitória — não deveria ser retentado."""
    session = _FakeSession([_FakeResponse(404)])
    record = fetch_bureau_record(session, "https://fake", "00000000000000", max_retries=2)
    assert record.encontrado is False
    assert session.chamadas == 1


def test_fetch_bureau_record_retenta_em_erro_de_rede_e_depois_sucede(monkeypatch):
    _sem_sleep_de_verdade(monkeypatch)
    session = _FakeSession([ConnectionError("timeout"), _FakeResponse(200, {"nome": "Empresa Y"})])
    record = fetch_bureau_record(session, "https://fake", "12345678000199", max_retries=2)
    assert record.encontrado is True
    assert record.nome == "Empresa Y"
    assert session.chamadas == 2


def test_fetch_bureau_record_esgota_retries_cai_no_sentinela_conservador(monkeypatch):
    _sem_sleep_de_verdade(monkeypatch)
    session = _FakeSession([ConnectionError("timeout"), ConnectionError("timeout"), ConnectionError("timeout")])
    record = fetch_bureau_record(session, "https://fake", "12345678000199", max_retries=2)
    assert record.encontrado is False
    assert record.score_externo_bureau == 0.0
    assert session.chamadas == 3
