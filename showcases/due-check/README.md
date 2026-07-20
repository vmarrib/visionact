# Due Check — amostra de código

> Amostra curada de decisões técnicas do Due Check, uma plataforma de due
> diligence/KYC multi-tenant. Os nomes reais de bureaus, limiares de score e
> dados de organizações foram generalizados — o objetivo é mostrar a
> arquitetura, não o schema de produção inteiro.

## Problema

Antes de fechar negócio com um fornecedor, cliente ou terceiro, uma empresa
precisa avaliar risco de compliance — mas os dados relevantes estão
espalhados entre fontes públicas heterogêneas, cada uma com seu próprio
formato de resposta, limites de taxa e modos de falha. O Due Check centraliza
essas consultas numa matriz de risco configurável por organização, aplica
regras automáticas de pontuação e gera um dossiê auditável.

## Decisões técnicas e alternativas consideradas

**1. Multi-tenancy real (RLS), não um filtro `WHERE org_id = ?` espalhado**
Um sistema B2B onde cada organização só pode ver seus próprios dados poderia
filtrar por `org_id` em cada query da aplicação. Optei por RLS porque um
único `WHERE` esquecido em um endpoint novo vira um vazamento de dados entre
clientes — o tipo de erro que só aparece em produção. Colocando a regra no
Postgres, toda query (mesmo uma nova, escrita às pressas) já nasce isolada.
Como no PitaIA, isso exige uma função `SECURITY DEFINER`
(`is_org_member()`) para evitar recursão de política — ver
`rls-multi-tenant.sql`.

**2. Adapter pattern para fontes de dados externas heterogêneas**
Cada fonte pública tem seu próprio formato de resposta, autenticação e modo
de falha (algumas retornam 403 quando não encontram nada, outras retornam
200 com corpo vazio). A alternativa seria um `if/else` gigante no código que
consulta os bureaus. Em vez disso, cada fonte implementa uma interface comum
(`BureauAdapter`), e um dispatcher genérico decide qual adapter chamar —
isolando a excentricidade de cada fonte no próprio adapter, sem vazar para o
motor de regras. Ver `bureau-adapter.ts`.

**3. Falha parcial não derruba o pipeline inteiro**
Ao consultar 5+ fontes em paralelo, é normal uma ou duas falharem
(timeout, fonte fora do ar). A decisão foi tratar cada consulta como
independente (`Promise.allSettled`, não `Promise.all`) — um dossiê com 6 de 8
fontes respondidas ainda é útil e é gerado, marcando explicitamente quais
fontes falharam, em vez de falhar a análise inteira por causa de uma fonte
lenta.

**4. "Regras automáticas" com sinais de veto separados de score ponderado**
Nem toda regra deveria "descontar pontos" — algumas são bloqueio automático
independente do score (ex.: uma sanção internacional ativa). Separar
"hard blocks" de "sinais ponderados" evita o cenário absurdo de uma entidade
sancionada passar porque teve boas pontuações em outros critérios. Ver
`risk-rules-engine.ts`.

## Stack

TypeScript, PostgreSQL (Row Level Security), Zod para validação de regras e
respostas de bureau.

## Arquivos

- [`rls-multi-tenant.sql`](./rls-multi-tenant.sql) — isolamento por
  organização com função `SECURITY DEFINER` anti-recursão.
- [`bureau-adapter.ts`](./bureau-adapter.ts) — padrão adapter para fontes de
  dados externas heterogêneas, com tratamento de falha parcial.
- [`risk-rules-engine.ts`](./risk-rules-engine.ts) — motor de regras
  automáticas com sinais de veto e score ponderado.

## O que foi omitido em relação ao projeto real

Nomes e endpoints reais das fontes públicas integradas, limiares de score
específicos por cliente, e qualquer dado real de contraparte (CNPJ, razão
social).
