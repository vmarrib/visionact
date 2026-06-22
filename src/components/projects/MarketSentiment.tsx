import { ProjectHeader } from "@/components/ProjectHeader";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TechStack } from "@/components/TechStack";

import { FeatureCards, BulletList } from "@/components/FeatureCards";

const stack = [
  "Python",
  "Scrapy",
  "Selenium",
  "BeautifulSoup",
  "Kafka",
  "PostgreSQL",
  "Docker",
  "Airflow",
  "Pandas",
  "Transformers",
  "Streamlit",
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

      <Section label="O que faz" title="Da palavra-chave ao resumo executivo">
        <p className="mb-5 text-muted-foreground">
          A partir de uma única palavra-chave, a plataforma orquestra um crawler,
          estrutura os dados coletados e roda um pipeline de NLP que entrega
          sentimento, reclamações, elogios e um resumo executivo pronto para
          decisão.
        </p>
        <FeatureCards
          features={[
            {
              title: "1 · Coleta",
              body: (
                <BulletList
                  items={[
                    "Recebe uma palavra-chave",
                    "Executa o crawler",
                    "Coleta: loja, produto, preço, nº de vendas, avaliação e comentários",
                    "Persiste os dados brutos em banco",
                  ]}
                />
              ),
            },
            {
              title: "2 · Processamento",
              body: (
                <BulletList
                  items={[
                    "Executa o pipeline de NLP",
                    "Classifica sentimento: positivo, negativo e neutro",
                    "Extrai principais reclamações e elogios",
                    "Gera resumo executivo",
                  ]}
                />
              ),
            },
          ]}
        />
      </Section>

      <Section label="Arquitetura" title="Pipeline de dados ponta a ponta">
        <FlowDiagram
          steps={[
            "Crawler",
            "Kafka",
            "Raw Data Lake",
            "ETL",
            "PostgreSQL",
            "NLP Pipeline",
            "Dashboard",
          ]}
          caption="Ingestão assíncrona desacopla a coleta do processamento e permite reprocessar dados históricos."
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
