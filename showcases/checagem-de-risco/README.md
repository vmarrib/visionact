# Checagem de Risco — amostra de código

> Reformulação de portfólio de um sistema de due diligence/KYC real, com o
> nome comercial do produto omitido de propósito. O objetivo aqui não é
> reproduzir o código de produção (que é uma aplicação web multi-tenant), mas
> demonstrar a mesma capacidade — orquestrar múltiplas fontes de risco,
> aplicar regras configuráveis e gerar um score auditável — sob uma ótica de
> **processamento em lote com PySpark**, útil quando é preciso checar uma
> carteira inteira de contrapartes de uma vez, não uma por vez pela tela de
> um app.

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
(`media_check.py`) produzem o **mesmo formato de sinal** (`document_id`,
`signal_id`, `kind`, `status`, `severity_hint`). O motor de regras
(`rules_engine.py`) nunca precisa saber se um sinal veio de uma consulta a
uma fonte estruturada ou de uma palavra-chave encontrada numa notícia — ele
só enxerga sinais. Isso significa que adicionar uma nova fonte (estruturada
ou não) nunca exige tocar no motor de regras.

**3. Checagem de mídia é um crawler + matcher, não um bureau**
Diferente de uma fonte estruturada (que responde uma pergunta objetiva —
"esta entidade está numa lista de sanções?"), a checagem de mídia varre a
web por menções à contraparte e sinaliza correspondências contra uma lista
configurável de palavras-chave de risco (ex.: termos associados a fraude,
investigação, sanção). Por não ter uma resposta binária confiável de uma
API oficial, o resultado é tratado como um **sinal de intensidade**, não um
veto automático — ver `media_check.py` e a seção de sinais ponderados em
`rules_engine.py`.

**4. Regras como configuração declarativa (YAML), não código**
Uma regra nova (ou um ajuste de peso) não deveria exigir alterar e reimplantar
o pipeline. `rules_config.example.yaml` descreve cada regra como dado —
quais sinais ela observa, se é veto ou ponderada, e seu peso — e
`rules_engine.py` interpreta essa configuração genericamente.

**5. Dossiê final como uma tabela, não um documento**
A saída do pipeline é uma tabela (`document_id`, `score`,
`flagged_rules`, `recommendation`, `generated_at`) — formato que se conecta
diretamente a um data warehouse, dashboard de BI ou exportação, sem exigir
parsing de um PDF/documento para reaproveitar o resultado em outro sistema.

## Stack

PySpark (DataFrame API), Python, YAML para configuração declarativa de
regras.

## Arquivos

- [`pyspark_pipeline.py`](./pyspark_pipeline.py) — orquestração: recebe o
  lote, chama fontes estruturadas e checagem de mídia, aplica regras, produz
  o dossiê final.
- [`sources.py`](./sources.py) — conectores de fontes estruturadas, com
  paralelismo via `mapPartitions` e tratamento de falha parcial por fonte.
- [`media_check.py`](./media_check.py) — checagem de mídia adversa: busca na
  web, normalização de texto e casamento por palavra-chave configurável.
- [`rules_engine.py`](./rules_engine.py) — motor de regras configurável
  (veto automático + score ponderado) sobre sinais normalizados.
- [`rules_config.example.yaml`](./rules_config.example.yaml) — exemplo de
  configuração declarativa de regras.

## O que foi omitido em relação ao projeto real

O nome comercial do produto, os nomes e endpoints reais das fontes
estruturadas integradas, os pesos/limiares de regra usados em produção, a
lista real de palavras-chave de risco, e qualquer dado real de contraparte.
A aplicação real é um produto web multi-tenant (não um pipeline batch); esta
amostra reformula deliberadamente o mesmo problema sob uma ótica de
engenharia de dados em lote, para fins de portfólio.
