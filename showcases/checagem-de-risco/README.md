# Checagem de Risco — amostra de código

> Reformulação de portfólio de um sistema de due diligence/KYC real, com o
> nome comercial do produto omitido de propósito. O objetivo aqui não é
> reproduzir o código de produção (que é uma aplicação web multi-tenant), mas
> demonstrar a mesma capacidade — orquestrar dados de bureau, aplicar regras
> de compliance configuráveis por campo, rodar modelos de crédito e gerar um
> resultado auditável — sob uma ótica de **processamento em lote com
> PySpark**, útil quando é preciso checar uma carteira inteira de
> contrapartes de uma vez, não uma por vez pela tela de um app.

> **Correção registrada**: rodando este showcase de verdade num workspace
> Databricks com compute serverless, uma versão anterior (que usava
> `df.rdd.mapPartitions(...)`) falhou com `[NOT_IMPLEMENTED] Using custom
> code using PySpark RDDs is not allowed on serverless compute` —
> serverless não expõe a API de RDD "crua", só a API de DataFrame. Todo
> ponto de integração Spark deste showcase (`bureau_client.py`,
> `diligence_pipeline.py`) usa `DataFrame.mapInPandas(...)`, que preserva a
> mesma estratégia (uma conexão HTTP por partição, não por linha) de forma
> compatível com serverless.

## Problema

Antes de fechar negócio com um fornecedor, contratar um colaborador ou
aprovar um cliente, uma empresa precisa avaliar risco de compliance e,
quando há exposição financeira, risco de crédito — mas os dados relevantes
vêm de fontes heterogêneas (um bureau de dados cadastrais/financeiros, mais
uma checagem de reputação em mídia que não vem de nenhuma fonte
estruturada), e o tipo de análise necessária muda conforme o papel da
contraparte: um fornecedor não é avaliado com as mesmas regras que um
candidato a colaborador ou um cliente. Rodar isso uma contraparte de cada
vez não escala quando é preciso reavaliar uma carteira inteira periodicamente.

## As 3 configurações (matrizes)

| Matriz | Papel da contraparte | Compliance por campo | Checagem de mídia | Modelos de crédito |
|---|---|---|---|---|
| **KYS** — Know Your Supplier | Fornecedor | Escopo amplo: sanção, mandado de prisão, processo criminal, situação cadastral, empresa recém-aberta, sem sócios, processos cíveis, dívida ativa | As 6 categorias da taxonomia — "qualquer envolvimento" | Não roda — risco de fornecedor aqui é reputacional/compliance, não inadimplência |
| **KYE** — Know Your Employee | Colaborador | Escopo restrito: mandado de prisão, processo criminal, processos trabalhistas recorrentes, processos cíveis | 3 categorias voltadas a risco pessoal (envolvimento criminal/violência, crime organizado, fraude/estelionato) — não faz sentido rodar sanção internacional (OFAC) ou cartel contra uma pessoa física candidata a colaborador | Não roda |
| **KYC** — Know Your Client | Cliente | Compliance básico: sanção, situação cadastral, dívida ativa | 2 categorias essenciais de compliance (sanções, lavagem de dinheiro) | **Roda os 4 modelos embarcados** — única matriz com camada de crédito, porque cliente é quem representa exposição financeira |

Cada matriz é dado, não código: uma lista de `ComplianceRule` (cada uma
observando um campo específico do bureau, veto ou ponderada) mais um
escopo de categorias de mídia. Ver `compliance_engine.py`.

## Arquitetura

```
lote de contrapartes (documento, nome)
        │
        ▼
bureau de dados cadastrais/creditícios (bureau_client.py)
        │  registro normalizado: cadastral + judicial + financeiro
        │
        ├──► motor de compliance por campo (compliance_engine.py)
        │      regras observam campos do bureau diretamente
        │      (não um "sinal" abstrato) — veto ou ponderada
        │
        ├──► checagem de mídia (media_check_categories.py)
        │      nome da contraparte + termos de cada categoria de risco,
        │      escopo de categorias definido pela matriz
        │
        ├──► [só KYC] 4 modelos de crédito embarcados (credit_models.py)
        │      capacidade de pagamento, comportamento de pagamento,
        │      estabilidade cadastral, concentração setorial
        │
        ▼
diligence_pipeline.py — orquestra os 3 acima por matriz
        │
        ▼
3 DataFrames de saída (um por matriz, schemas em pipeline_schemas.py)
score · veto · recommendation · regras/categorias sinalizadas ·
campos de bureau usados na decisão (para o analista revisar)
```

## Decisões técnicas e alternativas consideradas

**1. Regras de compliance por campo, não por "sinal" abstrato**
Cada `ComplianceRule` (`compliance_engine.py`) referencia diretamente um
atributo do `BureauRecord` — `possui_sancao_ativa`,
`mandados_prisao_ativos`, `processos_trabalhistas` etc. — em vez de um
sinal normalizado genérico. A decisão fica auditável: dá pra apontar
exatamente qual campo do bureau disparou cada regra, e `campos_para_analise`
devolve, junto do resultado, só os campos de bureau que aquela matriz
observou — o analista revisa a decisão sem precisar do registro inteiro.

**2. 3 matrizes como configuração, não 3 implementações**
KYS, KYE e KYC não são 3 pipelines separados: são 3 valores de
`ComplianceMatrix` (lista de regras + escopo de categorias de mídia + se
roda modelos de crédito) interpretados pelo mesmo motor
(`avaliar_matriz()`). Adicionar uma 4ª matriz é compor uma nova lista de
regras existentes, não escrever lógica nova.

**3. Checagem de mídia por categoria, com escopo configurável por matriz**
`media_check_categories.py` define 6 categorias de risco (corrupção,
lavagem de dinheiro, fraude, envolvimento criminal, sanções/regulatório,
crime organizado), cada uma com 5 grupos de palavras-chave.
`build_media_search_queries()` monta a query (nome da contraparte + termos
em OR) por grupo; `avaliar_media_check()` converte contagem de artigos
corroborantes numa intensidade 0–1, saturando a partir de 3 artigos — um
hit isolado não deveria pesar o mesmo que 3 reportagens independentes.
Categorias de maior severidade (lavagem de dinheiro, sanções
internacionais, crime organizado) viram veto automático; as demais
contribuem ponderadamente. Cada matriz varre só o subconjunto de
categorias que faz sentido para aquele papel — KYE, por exemplo, nunca
consulta sanção internacional (OFAC) ou cartel (CADE), categorias que não
se aplicam a uma pessoa física candidata a colaborador.

**4. 4 modelos de crédito determinísticos, não um modelo treinado**
`credit_models.py` roda 4 scorecards independentes sobre o registro do
bureau — capacidade de pagamento (dívida/receita), comportamento de
pagamento (protestos + cheques sem fundo, saturando), estabilidade
cadastral (tempo de atividade + quadro societário) e concentração setorial
(risco-base por setor) — combinados num score único ponderado. São
determinísticos e não um modelo de ML "treinado" porque não existe aqui uma
base real de inadimplência rotulada para treinar contra; um scorecard
com pesos explícitos e documentados é a alternativa honesta a fabricar um
dataset de treino que não existe.

**5. Risco de crédito extremo rejeita sozinho, como um veto de compliance**
Na KYC, o score final combina compliance (peso 0.4) e crédito (peso 0.6) —
mas 0.6 sozinho nunca atingiria o limiar geral de rejeição (0.66), o que
deixaria uma contraparte de risco de crédito máximo presa em "revisão
manual" mesmo com os 4 modelos no teto. `LIMIAR_CREDITO_REJEICAO_AUTOMATICA`
resolve isso: um score de crédito isolado acima de 0.85 rejeita
automaticamente, independente do resto — a mesma lógica de um veto de
compliance, aplicada ao lado de crédito. Ver
`test_kyc_credito_critico_rejeita_mesmo_sem_achado_de_compliance` em
`test_compliance_engine.py`.

**6. 3 DataFrames com schema próprio, não um schema genérico com mapa**
Cada matriz produz colunas tipadas específicas para os campos que ela de
fato usa (`pipeline_schemas.py`) — não um `map<string,string>` genérico.
O contrato entre o nome de cada `campo` em `compliance_engine.py` e o nome
de coluna do schema de saída é travado por teste
(`test_diligence_pipeline.py`), sem precisar importar PySpark para isso.

**7. Lógica de negócio separada da integração com Spark**
Cada módulo segue o mesmo padrão: lógica pura (retry, avaliação de regra,
agregação de mídia, scorecard de crédito) sem importar PySpark; integração
Spark (`mapInPandas`, schema, `DataFrame`) isolada e importada de forma
lazy, só dentro da função que precisa. 57 testes cobrem cada decisão de
negócio e rodam com `pytest` puro, em menos de 1 segundo, sem subir Spark
nem Java.

## Stack

PySpark (`mapInPandas`, compatível com compute serverless) para a
integração distribuída, Python puro para a lógica de negócio (regras,
scorecards de crédito, taxonomia de mídia), pytest para os testes.

## Arquivos

- [`bureau_client.py`](./bureau_client.py) — cliente do bureau de dados
  cadastrais/creditícios: registro normalizado (`BureauRecord`), retry com
  backoff exponencial, integração `mapInPandas`.
- [`bureau_schema.py`](./bureau_schema.py) — schema Spark do registro de
  bureau (único ponto que importa PySpark neste par de arquivos).
- [`credit_models.py`](./credit_models.py) — os 4 modelos de crédito
  determinísticos + combinação num score único.
- [`media_check_categories.py`](./media_check_categories.py) — taxonomia
  de 6 categorias × 5 grupos de busca, montagem de query e agregação de
  intensidade por corroboração.
- [`compliance_engine.py`](./compliance_engine.py) — motor de regras por
  campo (veto/ponderada) + as 3 matrizes `KYS_MATRIX`, `KYE_MATRIX`,
  `KYC_MATRIX`.
- [`diligence_pipeline.py`](./diligence_pipeline.py) — orquestração:
  `run_kys_analysis`, `run_kye_analysis`, `run_kyc_analysis`, cada uma
  produzindo um DataFrame a partir de um lote (`documento`, `nome`).
- [`pipeline_schemas.py`](./pipeline_schemas.py) — os 3 schemas Spark de
  saída, um por matriz.
- `test_*.py` — 57 testes, todos rodáveis com `pytest` puro (sem PySpark
  instalado).

## Como rodar os testes

```bash
pip install pytest
pytest -v
```

Rodar o pipeline de verdade (`diligence_pipeline.py`) exige, além disso,
PySpark e `requests` instalados — os testes acima cobrem toda a lógica de
decisão sem essa dependência pesada.

## O que foi omitido em relação ao projeto real

O nome comercial do produto, o bureau real integrado (endpoint,
autenticação, formato de payload), os pesos/limiares de regra e de modelo
de crédito usados em produção, a lista real de palavras-chave de risco por
categoria, e qualquer dado real de contraparte. A execução de verdade de
uma busca de mídia (crawler ou API de busca) também fica fora do escopo —
este showcase demonstra a decisão de negócio (como montar a query e
agregar o resultado), não um crawler de produção. A aplicação real é um
produto web multi-tenant (não um pipeline batch); esta amostra reformula
deliberadamente o mesmo problema sob uma ótica de engenharia de dados em
lote, para fins de portfólio.
