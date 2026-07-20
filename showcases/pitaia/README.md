# PitaIA — amostra de código

> Esta pasta é uma **amostra curada** de decisões técnicas do PitaIA, um app de
> inteligência pessoal de saúde. Não é o código de produção: os nomes de
> tabela, limiares de negócio e dados de usuário reais foram generalizados ou
> omitidos. O objetivo aqui é mostrar *como* os problemas foram resolvidos e
> *por que*, não expor o schema de produção inteiro.

## Problema

Dados de saúde (humor, sono, treino, exames, ciclo menstrual, diário) costumam
ficar espalhados entre apps diferentes, sem uma visão unificada — e o
acompanhamento entre paciente e profissional (psicólogo, personal trainer) é
descontínuo. O PitaIA junta esse histórico num único lugar e usa um LLM com
contexto real do usuário para gerar insights, mantendo limites claros sobre o
que pode ser compartilhado com terceiros.

## Decisões técnicas e alternativas consideradas

**1. Isolamento de dados na camada de banco (RLS), não só na aplicação**
Dava para checar permissão de leitura só no backend/API. Optei por levar a
regra para dentro do Postgres via Row Level Security porque qualquer novo
client (mobile, integração futura, um bug de autorização na API) continua
protegido — a regra não depende de "lembrar" de checar em cada endpoint.
O trade-off é complexidade: políticas de RLS mal escritas causam recursão
infinita quando uma policy consulta a própria tabela que ela protege. A
solução (ver `rls-policies.sql`) é isolar essa checagem numa função
`SECURITY DEFINER`, um padrão recomendado pelo próprio Postgres/Supabase.

**2. Isolamento adicional para dados íntimos**
Mesmo dentro do modelo de RLS "paciente compartilha com profissional", o
diário pessoal tem uma política própria, sem policy de leitura para
profissionais — decisão de produto (privacidade por padrão) implementada como
regra de dados, não como uma checagem opcional na UI.

**3. RAG manual em vez de framework (LangChain/LlamaIndex)**
Para um contexto relativamente pequeno e estável (até ~90 dias de histórico
estruturado), montar o prompt manualmente é mais simples de auditar e
depurar do que introduzir um framework de orquestração — dá para ver
exatamente o que entra no prompt, linha por linha. A troca é ter que resolver
na mão problemas que um framework resolveria (chunking, memória de longo
prazo) — aceitável porque o volume de dados por usuário é limitado e
estruturado, não texto livre não-estruturado.

**4. Streaming persistido incrementalmente**
A resposta do LLM chega via streaming (Server-Sent Events) e é parseada e
gravada no banco pedaço a pedaço, em vez de esperar a resposta completa. Isso
evita perder a resposta inteira se a conexão cair no meio, e permite mostrar
a resposta sendo "digitada" na interface.

**5. Instrumentos clínicos como dados declarativos**
Escalas validadas (PHQ-9, GAD-7, DASS-21 etc.) têm estruturas de scoring
diferentes entre si (algumas têm subescalas, algumas têm itens invertidos,
algumas têm multiplicador). Em vez de escrever uma função de cálculo por
instrumento, modelei cada um como dado (perguntas, pesos, itens invertidos) e
escrevi um motor de scoring único que interpreta esse dado — adicionar um
novo instrumento não exige escrever lógica nova, só descrever seus metadados.

## Stack

TypeScript, PostgreSQL (Row Level Security), Edge Functions (Deno),
Anthropic Claude API, Zod para validação de entrada/saída.

## Arquivos

- [`rls-policies.sql`](./rls-policies.sql) — políticas de RLS multi-papel com
  função `SECURITY DEFINER` anti-recursão, e isolamento do diário pessoal.
- [`ai-context-service.ts`](./ai-context-service.ts) — construção do contexto
  para o LLM e persistência incremental da resposta via streaming.
- [`clinical-scoring.ts`](./clinical-scoring.ts) — motor de scoring
  declarativo para instrumentos clínicos validados.

## O que foi omitido em relação ao projeto real

Nomes reais de tabela, colunas específicas do domínio (dados de ciclo
menstrual, exames laboratoriais), qualquer dado de usuário, chaves de API e
o prompt de sistema completo usado em produção.
