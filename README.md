# visionact

Código-fonte do portfólio de **Vanessa M. Ribeiro** — Engenheira & Cientista
de Dados.

**Site ao vivo:** [visionact.lovable.app](https://visionact.lovable.app)

Este repositório é duas coisas ao mesmo tempo:

1. **O site do portfólio em si** (`src/`) — React 19 + TanStack Start,
   Tailwind, shadcn/ui.
2. **Amostras de código curadas** (`showcases/`) dos projetos reais
   exibidos no site — versões generalizadas e bem documentadas, sem nomes
   reais de cliente, segredos ou dados de produção. Ver o README de cada
   pasta para o que foi omitido e por quê.

## Showcases

| Projeto | Pasta | O quê |
|---|---|---|
| PitaIA | [`showcases/pitaia`](./showcases/pitaia) | RLS multi-papel, RAG manual para contexto de saúde, scoring declarativo de instrumentos clínicos |
| Checagem de Risco | [`showcases/checagem-de-risco`](./showcases/checagem-de-risco) | Pipeline PySpark de diligência em lote, checagem de mídia própria, motor de regras configurável |
| Ponto Inteligente | [`showcases/ponto-inteligente`](./showcases/ponto-inteligente) | Geofencing, reconhecimento facial client-side, calibração estatística de limiares (FAR/FRR/EER, percentil de GPS) |

Todos os showcases Python têm testes reais rodáveis com `pytest` (sem
depender de PySpark instalado, por design — ver os READMEs). Os testes
TypeScript usam Vitest.

## Demo ao vivo

A página de **Checagem de Risco** no site tem uma demonstração funcional:
digite um CNPJ real, e ela consulta a BrasilAPI de verdade, aplica as
regras configuradas e mostra um dossiê completo. O código dessa demo (fora
de `showcases/`, porque é parte do próprio app, não uma amostra estática)
fica em:

- `src/lib/risk-check-rules.ts` — regras configuradas (campo, condição, peso)
- `src/lib/risk-check-dossier.ts` — schema da BrasilAPI e curadoria do dossiê
- `src/lib/risk-check-cache.ts` — cache de curta duração por CNPJ
- `src/lib/risk-check.functions.ts` — orquestração (server function)
- `src/components/projects/RiskCheckDemo.tsx` — interface

## Rodando localmente

```bash
bun install
bun run dev
```

## Testes

```bash
# TypeScript (Vitest) — cobre src/**/*.test.ts e showcases/**/*.test.ts
bun run test

# Python, dentro de cada pasta de showcase (pytest puro, sem PySpark):
pip install pytest pyyaml
pytest showcases/checagem-de-risco -v
pytest showcases/ponto-inteligente -v
```
