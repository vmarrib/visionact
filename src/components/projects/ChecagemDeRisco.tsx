import { ProjectHeader } from "@/components/ProjectHeader";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TechStack } from "@/components/TechStack";
import { FeatureCards, BulletList } from "@/components/FeatureCards";
import { CodeBlock } from "@/components/CodeBlock";
import { RiskCheckDemo } from "./RiskCheckDemo";
import { projects } from "@/lib/projects";

const meta = projects.find((p) => p.slug === "checagem-de-risco")!;

export function ChecagemDeRisco() {
  return (
    <>
      <ProjectHeader
        index={meta.index}
        name={meta.name}
        tagline={meta.tagline}
        domain={meta.domain}
        problem="Antes de fechar negócio com um fornecedor, cliente ou terceiro, uma empresa precisa avaliar risco de compliance — mas os dados relevantes estão espalhados entre fontes públicas heterogêneas, mais uma checagem de reputação em mídia que não vem de nenhuma fonte estruturada. Rodar isso contraparte por contraparte não escala quando é preciso reavaliar uma carteira inteira de uma vez."
        stack={meta.stack}
        github={meta.github}
      />

      <Section label="Demo" title="Uma checagem individual, rodando de verdade">
        <p className="mb-4 text-muted-foreground">
          O pipeline PySpark abaixo é para lote (uma carteira inteira de contrapartes). Esta caixa
          é uma versão simplificada — <strong>uma contraparte por vez</strong>, sem Spark — usando
          apenas a BrasilAPI como fonte, exatamente para você conferir o resultado real de uma
          consulta, não uma simulação. Construída em TypeScript (TanStack Start + Zod), com 39
          testes Vitest cobrindo validação de CNPJ, curadoria do dossiê, avaliação de regras e o
          cache de resultado — código em{" "}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">src/lib/risk-check-*.ts</code>{" "}
          na raiz do repositório (fora de <code className="rounded bg-secondary px-1 py-0.5 text-xs">showcases/</code>, por ser parte do próprio app).
        </p>
        <RiskCheckDemo />
      </Section>

      <Section label="Escala" title="Por que PySpark, e não um script sequencial">
        <p className="text-muted-foreground">
          Consultar uma contraparte por vez é aceitável para uma análise pontual, mas não escala
          para revisar uma carteira inteira periodicamente. O lote é distribuído entre partições do
          Spark, e a consulta a cada fonte roda em paralelo por partição — reaproveitando a mesma
          conexão HTTP para todas as linhas de uma partição, em vez de abrir uma conexão por linha.
        </p>
      </Section>

      <Section label="Fontes" title="Sinais normalizados, venham de onde vierem">
        <FeatureCards
          features={[
            {
              title: "Fontes estruturadas",
              body: (
                <>
                  <p className="mb-2">Cada fonte pública tem seu próprio formato e modo de falha:</p>
                  <BulletList
                    items={[
                      "Paralelizadas via mapPartitions, não um loop sequencial",
                      "Falha parcial não derruba as demais fontes",
                    ]}
                  />
                </>
              ),
            },
            {
              title: "Checagem de mídia própria",
              body: (
                <p>
                  Não é um bureau: varre a web por menções à contraparte e sinaliza
                  correspondências contra uma lista configurável de palavras-chave. A intensidade
                  do sinal é proporcional ao número de artigos corroborantes — uma menção isolada
                  pesa menos que três reportagens independentes sobre o mesmo assunto.
                </p>
              ),
            },
            {
              title: "Schema único de sinal",
              body: (
                <p>
                  Fonte estruturada e checagem de mídia emitem o mesmo formato de sinal — o motor
                  de regras nunca precisa saber de onde um sinal veio.
                </p>
              ),
            },
            {
              title: "Regras como configuração",
              body: (
                <p>
                  Veto automático separado de score ponderado — em YAML no pipeline PySpark
                  (<code className="text-xs">rules_config.example.yaml</code>), em um objeto
                  TypeScript comentado na demo acima (<code className="text-xs">risk-check-rules.ts</code>).
                  Reponderar uma regra é mudança de configuração, não de lógica.
                </p>
              ),
            },
          ]}
        />
      </Section>

      <Section label="Resultado" title="Dossiê final: uma tabela, não um documento">
        <p className="mb-4 text-muted-foreground">
          A saída do pipeline é uma tabela pronta para um data warehouse ou dashboard de BI, sem
          exigir parsing de um documento para reaproveitar o resultado em outro sistema.
        </p>
        <CodeBlock
          filename="dossie (schema de saída)"
          code={`document_id       string
score             double   -- 0 a 1
flagged_rules     array<string>
recommendation    string   -- approve | manual_review | reject
generated_at      timestamp
rule_version      string`}
        />
      </Section>

      <Section label="Testabilidade" title="Lógica de negócio testável sem cluster">
        <p className="text-muted-foreground">
          Cada módulo separa a lógica pura (retry, normalização de texto, avaliação de regras) da
          integração com Spark (`mapPartitions`, `DataFrame`, UDFs) — a primeira nunca importa
          PySpark. Resultado: 29 testes cobrindo cada decisão de negócio (o que conta como
          "não encontrado" vs. "fonte fora do ar", saturação da intensidade de mídia, veto vs.
          score ponderado) rodam com <code className="text-xs">pytest</code> puro, em segundos,
          sem precisar subir Spark nem Java.
        </p>
      </Section>

      <Section label="Arquitetura" title="Do lote ao dossiê">
        <FlowDiagram
          steps={[
            "Lote de contrapartes",
            "Fontes estruturadas + checagem de mídia (paralelo)",
            "Sinais normalizados (schema único)",
            "Regras configuráveis (veto + score)",
            "Dossiê final (tabela)",
          ]}
          caption="O nome comercial real do produto foi omitido de propósito — esta é uma reformulação de portfólio sob uma ótica de processamento em lote."
        />
        <div className="mt-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Tecnologias
          </p>
          <TechStack items={meta.stack} />
        </div>
      </Section>
    </>
  );
}
