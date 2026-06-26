import { ProjectHeader } from "@/components/ProjectHeader";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TechStack } from "@/components/TechStack";

import { CodeBlock } from "@/components/CodeBlock";
import { FeatureCards, BulletList } from "@/components/FeatureCards";

const stack = [
  "Python",
  "Playwright",
  "FastAPI",
  "Transformers",
  "Pydantic",
  "Pandas",
  "Docker",
  "GitHub Actions",
  "Pytest",
];

export function MarketSentiment() {
  return (
    <>
      <ProjectHeader
        index="01"
        name="Market Sentiment Intelligence Platform"
        tagline="Inteligência de mercado com NLP"
        domain="Data Engineering · NLP"
        problem="Empresas precisam entender rapidamente o que consumidores falam sobre produtos, marcas e concorrentes, em escala e em tempo quase real."
        stack={stack}
      />

      <Section label="O que faz" title="Cole o link do produto e receba o relatório">
        <p className="mb-5 text-muted-foreground">
          O usuário cola o link de um produto e o sistema varre{" "}
          <strong>todas as opiniões e estrelas</strong>, lê as características do
          produto, roda um <strong>modelo de análise de sentimento</strong> em
          cada comentário e entrega um <strong>relatório quantitativo</strong>:
          quantos comentários, distribuição de estrelas, percentual de
          sentimento e principais elogios e reclamações.
        </p>
        <FeatureCards
          features={[
            {
              title: "1 · Coleta (web scraping)",
              body: (
                <BulletList
                  items={[
                    "Recebe o link do produto",
                    "Abre a página com navegador real (Playwright)",
                    "Lê características, preço e avaliação média",
                    "Varre TODAS as opiniões e estrelas, paginando o modal completo",
                  ]}
                />
              ),
            },
            {
              title: "2 · Sentimento + relatório",
              body: (
                <BulletList
                  items={[
                    "Classifica cada comentário: positivo, neutro ou negativo",
                    "Calcula score médio e distribuição de estrelas",
                    "Extrai termos de elogio e de reclamação",
                    "Exporta relatório em JSON, Markdown e CSV",
                  ]}
                />
              ),
            },
          ]}
        />
      </Section>

      <Section label="Projeto no GitHub" title="Pronto para clonar e importar">
        <p className="mb-3 text-muted-foreground">
          Pacote Python instalável, com CLI (cola o link), API FastAPI,
          Dockerfile, CI no GitHub Actions, testes e um relatório de exemplo.
        </p>
        <CodeBlock
          filename="market-sentiment/"
          code={`market-sentiment
├── README.md
├── pyproject.toml
├── requirements.txt
├── Dockerfile
├── .github/workflows/ci.yml
├── market_sentiment
│   ├── cli.py            # python -m market_sentiment <url>
│   ├── api.py            # POST /analisar
│   ├── config.py
│   ├── models.py         # contratos de dados
│   ├── scraper           # Playwright: opiniões + estrelas + características
│   ├── sentiment         # léxico PT-BR ou transformer
│   └── report            # JSON · Markdown · CSV
├── tests
└── examples              # relatório real da JBL Boombox 3`}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href="/market-sentiment-ai.zip"
            download
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 font-mono text-sm text-foreground transition-colors hover:bg-secondary"
          >
            ↓ baixar projeto completo (.zip)
          </a>
          <a
            href="/mercadolivre_crawler_colab.py"
            download
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 font-mono text-sm text-foreground transition-colors hover:bg-secondary"
          >
            ↓ baixar coletor (.py)
          </a>
        </div>
      </Section>

      <Section label="Como usar" title="Da CLI ao relatório">
        <CodeBlock
          filename="terminal"
          code={`pip install -r requirements.txt
playwright install chromium

python -m market_sentiment \\
  "https://www.mercadolivre.com.br/.../p/MLB46273431"`}
        />
        <p className="mt-4 mb-2 text-muted-foreground">
          Saída do relatório (resumo):
        </p>
        <CodeBlock
          code={`Comentários coletados: 12  |  com estrelas: 12
Estrelas: 5★ 7 · 4★ 2 · 3★ 0 · 2★ 2 · 1★ 1   (média 4.0)
Sentimento: positivo 75% · neutro 0% · negativo 25%
Elogios:    potente, qualidade, recomendo
Reclamações: defeito, caro, esquentando`}
        />
      </Section>

      <Section label="Arquitetura" title="Pipeline ponta a ponta">
        <FlowDiagram
          steps={[
            "Link do produto",
            "Playwright",
            "Opiniões + estrelas",
            "Modelo de sentimento",
            "Métricas",
            "Relatório",
          ]}
          caption="Contratos de dados (dataclasses) desacoplam scraping, modelo e relatório, facilitando adicionar novos marketplaces."
        />
        <div className="mt-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Tecnologias
          </p>
          <TechStack items={stack} />
        </div>
      </Section>

      <Section label="Features avançadas" title="Além da classificação básica">
        <FeatureCards
          features={[
            {
              title: "Topic Modeling",
              body: (
                <>
                  <p className="mb-2">Descobre automaticamente os temas recorrentes:</p>
                  <BulletList
                    items={[
                      "Problemas de bateria",
                      "Entrega",
                      "Qualidade",
                      "Atendimento",
                    ]}
                  />
                </>
              ),
            },
            {
              title: "Resumo executivo com LLM",
              body: (
                <div className="rounded-md border border-border bg-surface p-3 font-mono text-xs leading-relaxed text-surface-foreground">
                  Foram analisados 45.000 comentários. 73% apresentam sentimento
                  positivo. Os principais problemas relatados foram atraso na
                  entrega e baixa durabilidade.
                </div>
              ),
            },
          ]}
        />
      </Section>

      <Section label="Fundamentação técnica" title="Decisões de arquitetura documentadas">
        <FeatureCards
          features={[
            {
              title: "Escalabilidade do crawler",
              body: (
                <p>
                  Filas Kafka, paralelismo de workers e controle de rate
                  limiting desacoplam coleta de processamento e absorvem picos
                  sem perder dados.
                </p>
              ),
            },
            {
              title: "Deduplicação de comentários",
              body: (
                <p>
                  Hash MD5 por comentário na camada de ETL garante
                  idempotência e evita reprocessar avaliações repetidas.
                </p>
              ),
            },
            {
              title: "BERT em vez de TF-IDF",
              body: (
                <p>
                  Modelos transformer capturam contexto semântico das
                  avaliações, reduzindo erro de classificação em frases com
                  ironia e negação.
                </p>
              ),
            },
          ]}
        />
      </Section>

    </>
  );
}
