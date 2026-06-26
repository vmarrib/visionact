import { ProjectHeader } from "@/components/ProjectHeader";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TechStack } from "@/components/TechStack";
import { FeatureCards, BulletList } from "@/components/FeatureCards";
import { MarketSentimentDemo } from "@/components/projects/MarketSentimentDemo";

const REPO_URL = "https://github.com/vanessamarrib/market-sentiment-ai";

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
        problem="Os usuários gastam muito tempo lendo dezenas de comentários e caçando as características dos produtos antes de decidir. A ferramenta gera em poucos minutos um relatório com as características do produto e analisa as avaliações de forma quantitativa e qualitativa, num formato visual fácil de entender."
        stack={stack}
      />

      <Section label="Demo ao vivo" title="Cole o link e veja o resultado na hora">
        <p className="mb-5 text-muted-foreground">
          Cole o link de um produto (ex.: Mercado Livre) e o sistema varre as{" "}
          <strong>opiniões e estrelas</strong>, lê as{" "}
          <strong>características do produto</strong>, classifica cada comentário com
          um <strong>modelo de sentimento PT-BR</strong> e devolve um{" "}
          <strong>relatório quantitativo e qualitativo</strong> em segundos. Use o
          modo <strong>comparar 2</strong> para colar dois links e ver lado a lado
          qual produto tem a melhor avaliação.
        </p>
        <MarketSentimentDemo />

        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 font-mono text-sm text-background transition-opacity hover:opacity-90"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
            </svg>
            ver projeto no GitHub
          </a>
        </div>

      </Section>

      <Section label="O que faz" title="Da coleta ao relatório">
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

      <Section label="Front-end & back-end" title="O mesmo código que roda aqui está no GitHub">
        <p className="mb-4 text-muted-foreground">
          A demo acima é o <strong>front-end</strong> deste site chamando o{" "}
          <strong>back-end</strong> em produção. O repositório no GitHub traz o{" "}
          mesmo pipeline (coleta → modelo de sentimento → relatório), pronto para
          clonar e rodar localmente — front e back-end iguais ao que você vê aqui.
        </p>
        <FeatureCards
          features={[
            {
              title: "Front-end (este site)",
              body: (
                <BulletList
                  items={[
                    "React + TanStack Start (SSR)",
                    "Cole o link e veja o relatório na hora",
                    "Modo comparar dois produtos lado a lado",
                    "Gráficos de estrelas e sentimento",
                  ]}
                />
              ),
            },
            {
              title: "Back-end (no GitHub)",
              body: (
                <BulletList
                  items={[
                    "Server function chama o coletor (Firecrawl/Playwright)",
                    "Motor de sentimento PT-BR + estrelas",
                    "Relatório quantitativo e qualitativo em JSON",
                    "Mesmo contrato de dados do site",
                  ]}
                />
              ),
            },
          ]}
        />
        <div className="mt-4">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 font-mono text-sm text-background transition-opacity hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
            </svg>
            ver projeto no GitHub
          </a>
        </div>
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

      <Section label="Tecnologias & modelos" title="O que roda por baixo">
        <FeatureCards
          features={[
            {
              title: "Coleta — Firecrawl + Playwright",
              body: (
                <p>
                  Navegador real que executa o JavaScript da página, clica em{" "}
                  <strong>“Mostrar todas as opiniões”</strong> e rola até o fim
                  para capturar todos os comentários e estrelas — não só os
                  primeiros visíveis.
                </p>
              ),
            },
            {
              title: "Modelo — Léxico PT-BR (padrão)",
              body: (
                <>
                  <p className="mb-2">
                    Baseline transparente e auditável, sem download de modelos:
                  </p>
                  <BulletList
                    items={[
                      "Dicionário ponderado (-3 a +3)",
                      "Trata negação: \u201cnão recomendo\u201d",
                      "Trata intensificadores: \u201cmuito bom\u201d",
                      "Estrelas como sinal forte combinado ao texto",
                    ]}
                  />
                </>
              ),
            },
            {
              title: "Modelo — Transformer (opcional)",
              body: (
                <p>
                  Modelo HuggingFace multilíngue para maior cobertura semântica
                  (ironia, contexto), ativável por variável de ambiente quando há
                  GPU disponível.
                </p>
              ),
            },
            {
              title: "Stack completa",
              body: <TechStack items={stack} />,
            },
          ]}
        />
      </Section>

      <Section label="Motivações" title="Por que construí assim">
        <FeatureCards
          features={[
            {
              title: "Decidir mais rápido",
              body: (
                <p>
                  Ler dezenas de avaliações e caçar especificações cansa. O
                  objetivo é transformar opiniões dispersas em um relatório claro
                  em minutos — e comparar dois produtos lado a lado.
                </p>
              ),
            },
            {
              title: "Coletar tudo, não uma amostra",
              body: (
                <p>
                  O marketplace carrega opiniões via JavaScript e mostra poucas
                  por vez. Por isso uso navegador real, abro o modal completo e
                  rolo até esgotar, deduplicando por prefixo do texto.
                </p>
              ),
            },
            {
              title: "Transparência e reprodutibilidade",
              body: (
                <p>
                  O léxico PT-BR é auditável (dá pra ver por que um comentário
                  ficou positivo ou negativo) e roda sem GPU. O transformer entra
                  quando há necessidade de cobertura semântica — sem mudar o
                  resto do pipeline.
                </p>
              ),
            },
          ]}
        />
      </Section>



    </>
  );
}
