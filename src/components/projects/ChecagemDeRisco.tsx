import { ProjectHeader } from "@/components/ProjectHeader";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TechStack } from "@/components/TechStack";
import { FeatureCards } from "@/components/FeatureCards";
import { CodeBlock } from "@/components/CodeBlock";
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
        problem="Antes de fechar negócio com um fornecedor, contratar um colaborador ou aprovar um cliente, uma empresa precisa avaliar risco — mas as regras certas mudam conforme o papel da contraparte, os dados vêm de um bureau externo mais uma checagem de reputação em mídia sem fonte estruturada, e quando há exposição financeira entra também análise de crédito. Rodar isso contraparte por contraparte não escala quando é preciso reavaliar uma carteira inteira de uma vez."
        stack={meta.stack}
        github={meta.github}
      />

      <Section label="Escala" title="Por que PySpark, e não um script sequencial">
        <p className="text-muted-foreground">
          Consultar uma contraparte por vez é aceitável para uma análise pontual, mas não escala
          para revisar uma carteira inteira periodicamente. O lote é distribuído entre partições do
          Spark via <code className="text-xs">mapInPandas</code> (compatível com compute
          serverless), reaproveitando a mesma conexão HTTP para todas as linhas de uma partição, em
          vez de abrir uma conexão por linha.
        </p>
      </Section>

      <Section label="3 matrizes" title="KYS, KYE, KYC: mesma engine, regras diferentes">
        <FeatureCards
          features={[
            {
              title: "KYS — Fornecedor",
              body: (
                <p>
                  Escopo mais amplo: compliance por campo (sanção, mandado de prisão, processo
                  criminal, situação cadastral, sócios, dívida ativa) + checagem de mídia nas 6
                  categorias da taxonomia — "qualquer envolvimento". Não roda modelo de crédito: o
                  risco de fornecedor aqui é reputacional, não de inadimplência.
                </p>
              ),
            },
            {
              title: "KYE — Colaborador",
              body: (
                <p>
                  Compliance restrito a processos, mandado de prisão e histórico trabalhista +
                  checagem de mídia num escopo pessoal (envolvimento criminal, crime organizado,
                  fraude) — sem sanção internacional (OFAC) ou cartel, que não fazem sentido contra
                  uma pessoa física.
                </p>
              ),
            },
            {
              title: "KYC — Cliente",
              body: (
                <p>
                  Compliance básico (sanção, situação cadastral, dívida ativa) + mídia em 2
                  categorias essenciais, <strong>mais os 4 modelos de crédito embarcados</strong> por
                  cima — capacidade de pagamento, comportamento de pagamento, estabilidade
                  cadastral, concentração setorial. Única matriz com camada de crédito.
                </p>
              ),
            },
            {
              title: "Regras por campo, não por sinal abstrato",
              body: (
                <p>
                  Cada regra observa diretamente um campo do bureau (<code className="text-xs">possui_sancao_ativa</code>,{" "}
                  <code className="text-xs">mandados_prisao_ativos</code>...) — veto automático ou
                  score ponderado. O resultado carrega também os campos usados na decisão, para o
                  analista revisar sem precisar do registro inteiro.
                </p>
              ),
            },
          ]}
        />
      </Section>

      <Section label="Checagem de mídia" title="Nome da contraparte + termos de cada categoria de risco">
        <p className="mb-4 text-muted-foreground">
          Não é um bureau: monta uma busca por nome da contraparte + palavras-chave, agrupadas em 6
          categorias de risco (corrupção, lavagem de dinheiro, fraude/estelionato, envolvimento
          criminal, sanções/regulatório, crime organizado), 5 grupos de termos cada. A intensidade
          do sinal satura a partir de 3 artigos corroborantes — uma menção isolada pesa menos que
          três reportagens independentes sobre o mesmo assunto. Categorias de maior severidade
          (lavagem de dinheiro, sanção internacional, crime organizado) viram veto automático; as
          demais contribuem ponderadamente. Cada matriz varre só o subconjunto de categorias que
          faz sentido para aquele papel.
        </p>
        <CodeBlock
          filename="exemplo de query gerada (media_check_categories.py)"
          code={`"Fornecedor Exemplo LTDA" ("corrupção" OR "suborno" OR "propina" OR
  "peculato" OR "improbidade" OR "desvio de verbas")`}
        />
      </Section>

      <Section label="Resultado" title="3 DataFrames, um por matriz — não um documento">
        <p className="mb-4 text-muted-foreground">
          A entrada de cada matriz é um lote de CNPJ/CPF; a saída é uma tabela tipada, pronta para
          um data warehouse ou dashboard de BI. Cada matriz tem seu próprio schema — só os campos de
          bureau que ela de fato usa — em vez de um mapa genérico.
        </p>
        <CodeBlock
          filename="KYC (schema de saída — inclui a análise de crédito)"
          code={`documento                      string
score                          double   -- 0 a 1
veto                           boolean
recommendation                 string   -- approve | manual_review | reject
flagged_rules                  array<string>
media_categorias_sinalizadas   array<string>
possui_sancao_ativa            boolean
situacao_cadastral             string
divida_ativa                   double
score_capacidade_pagamento     double
score_comportamento_pagamento  double
score_estabilidade_cadastral   double
score_concentracao_setorial    double
score_credito_final            double
generated_at                   timestamp
matrix_version                 string`}
        />
      </Section>

      <Section label="Testabilidade" title="Lógica de negócio testável sem cluster">
        <p className="text-muted-foreground">
          Cada módulo separa a lógica pura (retry, avaliação de regra, agregação de mídia, scorecard
          de crédito) da integração com Spark (<code className="text-xs">mapInPandas</code>,{" "}
          <code className="text-xs">DataFrame</code>) — a primeira nunca importa PySpark. Resultado:
          57 testes cobrindo cada decisão de negócio (veto vs. score ponderado, saturação da
          intensidade de mídia, os 4 modelos de crédito, o contrato de schema entre matriz e
          DataFrame de saída) rodam com <code className="text-xs">pytest</code> puro, em menos de 1
          segundo, sem precisar subir Spark nem Java.
        </p>
      </Section>

      <Section label="Arquitetura" title="Do bureau às 3 matrizes">
        <FlowDiagram
          steps={[
            "Lote de contrapartes (documento, nome)",
            "Bureau de dados cadastrais/creditícios",
            "Compliance por campo + checagem de mídia (por matriz)",
            "KYC: + 4 modelos de crédito embarcados",
            "3 DataFrames de saída (KYS, KYE, KYC)",
          ]}
          caption="O nome comercial real do produto e o bureau real integrado foram omitidos de propósito — esta é uma reformulação de portfólio sob uma ótica de processamento em lote."
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
