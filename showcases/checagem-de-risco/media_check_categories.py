"""
Checagem de Risco — taxonomia de checagem de mídia adversa por categoria de risco.

Diferente de uma fonte estruturada (bureau, lista de sanções — responde uma
pergunta objetiva), a checagem de mídia varre a web por menções à
contraparte e sinaliza correspondências contra uma lista configurável de
palavras-chave, organizada por categoria de risco. Este módulo é só a
lógica pura: como montar a busca (nome da contraparte + termos de cada
categoria) e como transformar nº de artigos corroborantes numa intensidade
de 0 a 1 — a execução de verdade da busca (crawler/API de busca) fica de
fora do escopo deste showcase.

A taxonomia abaixo é a mesma usada para compor o escopo de cada conjunto
de regras de análise de risco: KYS (fornecedor) varre todas as categorias;
KYE (colaborador) varre um subconjunto voltado a envolvimento
pessoal/criminal; KYC (cliente) usa a checagem de compliance básica. Ver
`compliance_engine.py`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping

# Nº de artigos corroborantes a partir do qual a intensidade do sinal
# satura em 1.0 — uma notícia isolada não deveria pesar o mesmo que três
# reportagens independentes sobre o mesmo assunto.
CORROBORACAO_TETO = 3

# Intensidade mínima para uma categoria ser considerada "sinalizada" no
# resultado agregado (ao menos 1 artigo corroborante).
INTENSIDADE_MINIMA_SINALIZACAO = 1 / CORROBORACAO_TETO


@dataclass(frozen=True)
class MediaCategory:
    id: str
    nome: str
    # 5 grupos de busca por categoria; cada grupo é pesquisado como uma
    # query independente (nome da contraparte + termos do grupo em OR).
    grupos_busca: tuple[tuple[str, ...], ...]
    # Categorias de maior severidade (sanções internacionais, crime
    # organizado) — usadas para decidir veto automático no motor de
    # compliance, não só contribuição ponderada de score.
    alerta_maximo: bool = False


MEDIA_CATEGORIES: tuple[MediaCategory, ...] = (
    MediaCategory(
        id="corrupcao_crimes_estado",
        nome="Corrupção e Crimes contra o Estado",
        grupos_busca=(
            ("corrupção", "suborno", "propina", "peculato", "improbidade", "desvio de verbas"),
            ("CGU", "TCU", "Ministério Público Federal", "Polícia Federal", "operação policial", "inquérito", "indiciado"),
            ("ação penal", "denúncia criminal", "réu", "condenado", "improbidade administrativa", "enriquecimento ilícito", "tráfico de influência"),
            ("licitação fraudulenta", "superfaturamento", "dispensa indevida", "contrato irregular", "obra superfaturada"),
            ("Lava Jato", "Operação", "offshore", "paraíso fiscal", "conta no exterior", "Panama Papers", "Pandora Papers"),
        ),
    ),
    MediaCategory(
        id="lavagem_dinheiro_crimes_financeiros",
        nome="Lavagem de Dinheiro e Crimes Financeiros",
        grupos_busca=(
            ("lavagem de dinheiro", "ocultação de bens", "ocultação de valores", "crime financeiro", "evasão de divisas", "caixa dois"),
            ("COAF", "Receita Federal", "Banco Central", "CVM", "operação financeira suspeita", "comunicação de operação suspeita"),
            ("sonegação", "crime tributário", "nota fiscal fria", "fraude fiscal", "REFIS irregular", "dívida ativa fraudulenta"),
            ("câmbio ilegal", "dólar paralelo", "remessa ilegal", "doleiro", "offshore suspeito", "empresa fantasma", "laranja"),
            ("financiamento ao terrorismo", "terrorismo", "grupo terrorista", "lista do COAF", "bloqueio de ativos"),
        ),
        alerta_maximo=True,
    ),
    MediaCategory(
        id="fraude_estelionato_crimes_empresariais",
        nome="Fraude, Estelionato e Crimes Empresariais",
        grupos_busca=(
            ("fraude", "estelionato", "golpe", "crime empresarial", "prejuízo a investidores", "vítimas", "enganou"),
            ("fraude contábil", "balanço adulterado", "demonstrativo irregular", "auditoria negativa", "rombo financeiro", "passivo oculto"),
            ("falência fraudulenta", "recuperação judicial irregular", "blindagem patrimonial", "credores prejudicados", "desvio antes da falência"),
            ("pirâmide financeira", "esquema Ponzi", "PROCON", "fraude em investimento", "promessa falsa", "propaganda enganosa"),
            ("documento falso", "falsificação", "identidade falsa", "CNPJ laranja", "CPF de terceiros", "empresa de fachada", "sócio laranja"),
        ),
    ),
    MediaCategory(
        id="envolvimento_criminal_violencia",
        nome="Envolvimento Criminal e Violência",
        grupos_busca=(
            ("preso", "condenado", "sentenciado", "mandado de prisão", "foragido", "cumprindo pena", "regime fechado"),
            ("homicídio", "lesão corporal", "extorsão", "sequestro", "ameaça", "crime violento", "tentativa de homicídio", "agressão"),
            ("tráfico de drogas", "tráfico de entorpecentes", "apreensão de drogas", "associação ao tráfico", "narcotráfico"),
            ("operação policial", "delegacia", "boletim de ocorrência", "inquérito policial", "DEIC", "GAECO", "DENARC"),
            ("porte ilegal de arma", "tráfico de armas", "arma de fogo ilegal", "contravenção", "jogo ilegal", "bingo ilegal"),
        ),
    ),
    MediaCategory(
        id="sancoes_regulatorio_restricoes",
        nome="Sanções, Regulatório e Restrições",
        grupos_busca=(
            ("CEIS", "CNEP", "CEPIM", "cadastro de empresa inidônea", "empresa punida", "impedida de licitar", "inabilitada"),
            ("ANATEL", "ANVISA", "ANEEL", "CADE", "CVM", "auto de infração", "multa regulatória", "cassação de licença", "interdição"),
            ("CADE", "cartel", "prática anticoncorrencial", "dumping", "abuso de posição dominante", "acordo de leniência"),
            ("OFAC", "lista da ONU", "sanção internacional", "sancionado", "embargo internacional", "lista negra internacional"),
            ("IBAMA", "autuação ambiental", "crime ambiental", "lista suja", "trabalho escravo", "trabalho análogo à escravidão"),
        ),
        alerta_maximo=True,
    ),
    MediaCategory(
        id="crime_organizado_faccoes",
        nome="Crime Organizado e Facções",
        grupos_busca=(
            ("PCC", "Primeiro Comando da Capital", "crime organizado", "facção criminosa", "organização criminosa", "associação criminosa"),
            ("Comando Vermelho", "CV", "ADA", "Amigos dos Amigos", "TC", "Terceiro Comando", "boca de fumo", "tráfico do morro"),
            ("milícia", "grupo paramilitar", "grupo de extermínio", "esquadrão da morte", "pistoleiro", "jagunço", "capanga"),
            ("Sindicato do Crime", "Okaida", "Bonde dos 40", "GDE", "Guardiões do Estado", "Família do Norte", "FDN", "SDC"),
            ("empresa de fachada de facção", "lavagem para crime organizado", "financiamento de facção", "prestanome de facção", "testa de ferro do tráfico"),
        ),
        alerta_maximo=True,
    ),
)

_CATEGORIES_BY_ID: Mapping[str, MediaCategory] = {cat.id: cat for cat in MEDIA_CATEGORIES}


def get_category(category_id: str) -> MediaCategory:
    try:
        return _CATEGORIES_BY_ID[category_id]
    except KeyError:
        raise KeyError(f"categoria de mídia desconhecida: {category_id!r}") from None


@dataclass(frozen=True)
class MediaSearchQuery:
    category_id: str
    category_nome: str
    query: str


def build_media_search_queries(
    nome_contraparte: str, category_ids: Iterable[str] | None = None
) -> list[MediaSearchQuery]:
    """Monta uma query de busca por grupo de palavras-chave, por categoria
    — nome da contraparte entre aspas (busca exata) + termos do grupo em
    OR. `category_ids=None` cobre a taxonomia inteira (escopo KYS);
    conjuntos de regras mais restritos (KYE) passam um subconjunto."""
    categorias = MEDIA_CATEGORIES if category_ids is None else tuple(get_category(cid) for cid in category_ids)
    queries: list[MediaSearchQuery] = []
    for categoria in categorias:
        for grupo in categoria.grupos_busca:
            termos = " OR ".join(f'"{termo}"' for termo in grupo)
            queries.append(
                MediaSearchQuery(
                    category_id=categoria.id,
                    category_nome=categoria.nome,
                    query=f'"{nome_contraparte}" ({termos})',
                )
            )
    return queries


def calcular_intensidade(artigos_corroborantes: int) -> float:
    """Converte contagem de artigos corroborantes numa intensidade 0-1,
    crescimento linear até CORROBORACAO_TETO, depois saturando."""
    if artigos_corroborantes <= 0:
        return 0.0
    return round(min(1.0, artigos_corroborantes / CORROBORACAO_TETO), 4)


@dataclass(frozen=True)
class MediaCheckCategoryResult:
    category_id: str
    category_nome: str
    artigos_corroborantes: int
    intensidade: float
    alerta_maximo: bool
    sinalizado: bool


def avaliar_media_check(
    contagem_por_categoria: Mapping[str, int], category_ids: Iterable[str] | None = None
) -> tuple[MediaCheckCategoryResult, ...]:
    """Agrega o resultado de uma busca já executada (nº de artigos
    corroborantes por categoria, tipicamente vindo de uma API de busca ou
    crawler) na intensidade e sinalização de cada categoria do escopo.

    A contagem por categoria é o único dado de entrada aqui de propósito:
    a execução real da busca (rede, parsing de HTML, dedup de artigo) é
    responsabilidade de uma camada de integração fora deste showcase — o
    que se está demonstrando é a decisão de negócio (como agregar e
    sinalizar), não um crawler de verdade.
    """
    categorias = MEDIA_CATEGORIES if category_ids is None else tuple(get_category(cid) for cid in category_ids)
    resultados = []
    for categoria in categorias:
        artigos = contagem_por_categoria.get(categoria.id, 0)
        intensidade = calcular_intensidade(artigos)
        resultados.append(
            MediaCheckCategoryResult(
                category_id=categoria.id,
                category_nome=categoria.nome,
                artigos_corroborantes=artigos,
                intensidade=intensidade,
                alerta_maximo=categoria.alerta_maximo,
                sinalizado=intensidade >= INTENSIDADE_MINIMA_SINALIZACAO,
            )
        )
    return tuple(resultados)
