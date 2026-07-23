# Checagem de Risco — amostra de código

> Reformulação de portfólio de um sistema de due diligence/KYC real, com o
> nome comercial do produto omitido de propósito. O objetivo aqui não é
> reproduzir o código de produção (que é uma aplicação web multi-tenant), mas
> demonstrar a mesma capacidade — orquestrar múltiplas fontes de risco,
> aplicar regras configuráveis e gerar um score auditável — sob uma ótica de
> **processamento em lote com PySpark**, útil quando é preciso checar uma
> carteira inteira de contrapartes de uma vez, não uma por vez pela tela de
> um app.

> **Demo ao vivo**: a página deste projeto no site do portfólio tem uma
> versão simplificada e real (uma contraparte por vez, sem Spark, só
> BrasilAPI) que roda de verdade contra a API pública — código em
> `src/lib/risk-check-*.ts`, `src/lib/risk-check.functions.ts` e
> `src/components/projects/RiskCheckDemo.tsx` na raiz do repositório
> `visionact` (fora desta pasta `showcases/`, porque é parte do próprio site,
> não uma amostra estática).
>
> **Correção registrada**: em produção, a demo recebeu HTTP 429 da BrasilAPI
> mesmo com cache de 5 minutos ativo — plataformas serverless costumam
> compartilhar IPs de saída entre vários apps, então o limite pode estar
> sendo atingido pela infraestrutura, não só por esta demo. Adicionado
> `risk-check-http.ts`: retry automático com backoff exponencial,
> respeitando o cabeçalho `Retry-After` quando presente, antes de mostrar o
> erro ao visitante.

## Problema

Antes de fechar negócio com um fornecedor, cliente ou terceiro, uma empresa
precisa avaliar risco de compliance — mas os dados relevantes estão
espalhados entre fontes públicas heterogêneas (cada uma com seu próprio
formato, autenticação e modo de falha), mais uma checagem de reputação em
mídia que não vem de nenhuma fonte estruturada. Rodar isso uma contraparte de
cada vez não escala quando a necessidade é analisar uma carteira inteira —
centenas ou milhares de CNPJs de uma vez, por exemplo, numa reavaliação
periódica de toda a base de fornecedores de uma empresa.

## Arquitetura

```
lote de contrapartes (document_id, nome)
        │
        ├──► fontes estruturadas (sources.py)   ──┐
        │      cada fonte roda em paralelo,       │
        │      particionada pelo Spark            │
        │                                          ├──► sinais normalizados
        └──► checagem de mídia (media_check.py) ──┘     (mesmo schema)
               NÃO é um bureau: varre a web e
               sinaliza por palavra-chave
                                                          │
                                                          ▼
                                          regras configuráveis (rules_engine.py)
                                          veto automático + score ponderado
                                                          │
                                                          ▼
                                          dossiê final: score, regras
                                          sinalizadas, recomendação
```

## Decisões técnicas e alternativas consideradas

**1. PySpark para checagem em lote, não um script sequencial**
Consultar uma contraparte por vez, em sequência, é aceitável para uma
análise pontual — mas se torna proibitivamente lento para revisar uma
carteira inteira periodicamente. O lote de contrapartes é distribuído entre
partições do Spark, e a consulta a cada fonte roda em paralelo por partição
(`mapPartitions`, ver `sources.py`), reutilizando a mesma conexão HTTP para
todas as linhas de uma partição em vez de abrir uma conexão por linha — a
diferença entre um job que leva minutos e um que levaria horas num loop
sequencial.

**2. Sinais normalizados sob um schema comum, venham de onde vierem**
Tanto uma fonte estruturada (`sources.py`) quanto a checagem de mídia
(`media_check.py`) produzem o **mesmo formato de sinal**, definido uma
única vez em `signal_schema.py` (`document_id`, `signal_id`, `kind`,
`status`, `intensity`, `detail`). O motor de regras (`rules_engine.py`)
nunca precisa saber se um sinal veio de uma consulta a uma fonte
estruturada ou de uma palavra-chave encontrada numa notícia — ele só
enxerga sinais. Isso significa que adicionar uma nova fonte (estruturada ou
não) nunca exige tocar no motor de regras.

**3. Checagem de mídia é um crawler + matcher, não um bureau — e seu sinal
carrega intensidade, não um binário**
Diferente de uma fonte estruturada (que responde uma pergunta objetiva —
"esta entidade está numa lista de sanções?"), a checagem de mídia varre a
web por menções à contraparte e sinaliza correspondências contra uma lista
configurável de palavras-chave de risco. Uma única notícia isolada não
deveria pesar o mesmo que três reportagens independentes sobre o mesmo
assunto — por isso `score_media_hits()` converte a contagem de artigos
corroborantes numa intensidade de 0 a 1 (crescimento linear até um teto de
corroboração, depois saturando), em vez de um "hit"/"no_hit" binário. Ver
`media_check.py` e os testes em `test_media_check.py`.

**4. Regras como configuração declarativa (YAML), não código**
Uma regra nova (ou um ajuste de peso) não deveria exigir alterar e reimplantar
o pipeline. `rules_config.example.yaml` descreve cada regra como dado —
quais sinais ela observa, se é veto ou ponderada, e seu peso — e
`rules_engine.py` interpreta essa configuração genericamente. O score
ponderado usa a `intensity` de cada sinal (não um binário), então um sinal
de mídia parcialmente corroborado contribui proporcionalmente, nunca como
tudo-ou-nada.

**5. Dossiê final como uma tabela, não um documento**
A saída do pipeline é uma tabela (`document_id`, `score`,
`flagged_rules`, `recommendation`, `generated_at`) — formato que se conecta
diretamente a um data warehouse, dashboard de BI ou exportação, sem exigir
parsing de um PDF/documento para reaproveitar o resultado em outro sistema.

**6. Lógica de negócio separada da integração com Spark, para ser testável
sem cluster**
Cada módulo (`sources.py`, `media_check.py`, `rules_engine.py`) segue o
mesmo padrão: a lógica pura (decisão de retry, normalização de texto,
avaliação de regras) fica no topo do arquivo, sem importar PySpark; a
integração com Spark (`mapPartitions`, `DataFrame`, `UDF`) fica isolada no
final, importando PySpark só ali dentro. Isso é o que torna os 29 testes em
`test_*.py` executáveis com `pytest` puro, sem PySpark nem Java instalados —
uma escolha deliberada para que a lógica de negócio seja testada em
milissegundos, não em minutos de subida de um cluster local.

## Stack

PySpark (DataFrame API) para a integração distribuída, Python puro para a
lógica de negócio, YAML para configuração declarativa de regras, pytest
para os testes.

## Arquivos

- [`pyspark_pipeline.py`](./pyspark_pipeline.py) — orquestração: recebe o
  lote, chama fontes estruturadas e checagem de mídia, aplica regras, produz
  o dossiê final. (Requer PySpark para rodar de verdade.)
- [`sources.py`](./sources.py) — conectores de fontes estruturadas: lógica
  pura de retry/interpretação de resposta no topo, integração Spark
  (`mapPartitions`) no final.
- [`media_check.py`](./media_check.py) — checagem de mídia adversa: busca,
  normalização, dedup, casamento de regras e cálculo de intensidade —
  mesma separação lógica pura / integração Spark.
- [`rules_engine.py`](./rules_engine.py) — motor de regras configurável
  (veto automático + score ponderado por intensidade).
- [`rules_config.example.yaml`](./rules_config.example.yaml) — exemplo de
  configuração declarativa de regras.
- [`signal_schema.py`](./signal_schema.py) — schema comum de sinal,
  compartilhado por `sources.py` e `media_check.py`.
- [`test_sources.py`](./test_sources.py),
  [`test_media_check.py`](./test_media_check.py),
  [`test_rules_engine.py`](./test_rules_engine.py) — 29 testes, todos
  rodáveis com `pytest` puro (sem PySpark instalado). Cada teste documenta,
  no nome e no docstring, QUAL comportamento de negócio ele protege — não
  só "o que" o código faz.

## Como rodar os testes

```bash
pip install pytest pyyaml
pytest -v
```

Rodar o pipeline de verdade (`pyspark_pipeline.py`) exige, além disso,
PySpark e `requests` instalados — os testes acima cobrem toda a lógica de
decisão sem essa dependência pesada.

## O que foi omitido em relação ao projeto real

O nome comercial do produto, os nomes e endpoints reais das fontes
estruturadas integradas, os pesos/limiares de regra usados em produção, a
lista real de palavras-chave de risco, e qualquer dado real de contraparte.
A aplicação real é um produto web multi-tenant (não um pipeline batch); esta
amostra reformula deliberadamente o mesmo problema sob uma ótica de
engenharia de dados em lote, para fins de portfólio.
