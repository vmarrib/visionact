# visionact

[![Tests](https://github.com/vmarrib/visionact/actions/workflows/tests.yml/badge.svg)](https://github.com/vmarrib/visionact/actions/workflows/tests.yml)

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
| Checagem de Risco | [`showcases/checagem-de-risco`](./showcases/checagem-de-risco) | Pipeline PySpark de diligência (KYS/KYE/KYC), 4 modelos de crédito, motor de compliance por campo, checagem de mídia por categoria de risco |
| Ponto Inteligente | [`showcases/ponto-inteligente`](./showcases/ponto-inteligente) | Geofencing, reconhecimento facial client-side, calibração estatística de limiares (FAR/FRR/EER, percentil de GPS) |

Todos os showcases Python têm testes reais rodáveis com `pytest` (sem
depender de PySpark instalado, por design — ver os READMEs). Os testes
TypeScript usam Vitest.

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
