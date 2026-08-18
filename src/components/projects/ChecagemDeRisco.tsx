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
        problem="Quem aprova ou bloqueia uma contraparte é o time de compras, crédito ou comercial. Esse time não trabalha dentro de uma ferramenta de compliance; trabalha dentro do ERP e do CRM. O dado de risco, porém, vive fora: bureaus por API REST, provedores expostos como servidores MCP, e checagem de reputação em mídia sem fonte estruturada. Este pipeline é o ETL que fecha esse vão: extrai das fontes, aplica regras de compliance e modelos de crédito, e carrega o resultado como atributos de risco no cadastro que o negócio já usa, para uma carteira inteira de uma vez."
        stack={meta.stack}
        github={meta.github}
      />

      <Section label="Posicionamento" title="Análise que chega onde o analista trabalha">
        <p className="text-muted-foreground">
          A saída não é um PDF que alguém precisa abrir. O pipeline grava atributos tipados
          (situação, faixa de risco, score de crédito, regras sinalizadas) diretamente no cadastro
          do fornecedor no ERP ou da conta do cliente no CRM. O analista vê{" "}
          <code className="text-xs">BLOQUEADO</code>,{" "}
          <code className="text-xs">EM_ANÁLISE</code> ou{" "}
          <code className="text-xs">LIBERADO</code> na mesma tela de sempre, sem trocar de sistema e
          sem pedir parecer por e-mail.
        </p>
        <div className="mt-6">
          <FeatureCards
            features={[
              {
                title: "Extract: REST + MCP na mesma camada",
                body: (
                  <p>
                    Bureaus tradicionais entram por HTTP, e provedores que publicam servidores MCP
                    entram por <code className="text-xs">tools/call</code>, com o{" "}
                    <code className="text-xs">Accept</code> de Streamable HTTP que o SDK oficial
                    exige (sem ele, 406). As duas fontes implementam o mesmo protocolo{" "}
                    <code className="text-xs">RiskDataSource</code>, e a regra nunca sabe de onde
                    veio o dado.
                  </p>
                ),
              },
              {
                title: "Transform: regras por campo + crédito",
                body: (
                  <p>
                    Motor de compliance declarativo (veto ou score ponderado) sobre campos concretos
                    do bureau, mais os 4 modelos de crédito embarcados na camada de cliente.
                    Compliance e crédito compõem um score único, com limiar independente para risco
                    de crédito extremo.
                  </p>
                ),
              },
              {
                title: "Load: upsert idempotente",
                body: (
                  <p>
                    Cada registro carrega um <code className="text-xs">payload_hash</code> do
                    conteúdo de negócio, sem o timestamp. Reprocessar a carteira sem mudança de dado
                    nem de versão de regra grava zero linha: ERP costuma cobrar por chamada e
                    disparar workflow a cada escrita.
                  </p>
                ),
              },
              {
                title: "Métricas junto da decisão",
                body: (
                  <p>
                    Taxa de reprovação, veto, distribuição de recomendação, score médio de crédito e
                    top regras sinalizadas saem do mesmo pipeline. Recalcular isso numa camada de BI
                    separada cria duas implementações da mesma regra, e num comitê de risco a
                    divergência derruba a credibilidade do número inteiro.
                  </p>
                ),
              },
            ]}
          />
        </div>
      </Section>

      <Section label="Fontes" title="Precedência declarada e procedência por campo">
        <p className="mb-4 text-muted-foreground">
          Em due diligence é normal ter duas fontes para o mesmo campo: um bureau tem o processo
          judicial, outro tem a situação cadastral mais atualizada. A ordem das fontes é a política
          de confiança, escrita no ponto de configuração e não escondida num if. Cada valor do
          registro final guarda de qual fonte veio, então "por que essa contraparte foi reprovada"
          vira uma coluna da tabela de saída, não uma arqueologia de log de rede. Fonte que falha
          entra em <code className="text-xs">fontes_com_falha</code> e as demais seguem: perder um
          enriquecimento opcional não é o mesmo que perder a análise.
        </p>
        <CodeBlock
          filename="data_sources.py (configuração de fontes, ordem = precedência)"
          code={`fontes = [
    RestBureauSource(
        nome="bureau_cadastral",
        base_url=BUREAU_URL,
        transport=http_json,
        field_map={"cad_situacao": "situacao_cadastral", ...},
    ),
    McpToolSource(
        nome="mcp_sancoes",
        server_url=MCP_URL,
        tool_name="consultar_sancoes",
        transport=http_json,   # Accept: application/json, text/event-stream
        field_map={"sanctioned": "possui_sancao_ativa"},
    ),
]

merged = coletar_de_fontes(documento, tipo_documento, fontes)
merged.field_provenance["situacao_cadastral"]  # "bureau_cadastral"`}
        />
        <p className="mt-4 text-muted-foreground">
          Sem nenhuma fonte respondendo, a situação cadastral fica{" "}
          <code className="text-xs">DESCONHECIDA</code> em vez de <code className="text-xs">ATIVA</code>
          , o que faz a regra de irregularidade disparar: ausência de dado não é ausência de risco.
        </p>
      </Section>

      <Section label="Modelos de crédito" title="4 scorecards embarcados, com racional legível">
        <p className="mb-4 text-muted-foreground">
          Rodam na análise de cliente, que é onde existe exposição financeira. São determinísticos e
          não um modelo treinado por um motivo concreto: não há aqui uma base real de inadimplência
          rotulada, e um scorecard de pesos explícitos é a alternativa honesta a fabricar um dataset
          de treino que não existe. Cada modelo devolve, junto do score, o racional em texto que o
          analista lê para revisar a decisão.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Modelo</th>
                <th className="px-4 py-3 font-medium">Sinal</th>
                <th className="px-4 py-3 font-medium">Peso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-4 py-3 font-mono text-xs">capacidade_pagamento</td>
                <td className="px-4 py-3 text-muted-foreground">
                  Dívida ativa sobre receita anualizada
                </td>
                <td className="px-4 py-3 font-mono text-xs">0.35</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs">comportamento_pagamento</td>
                <td className="px-4 py-3 text-muted-foreground">
                  Protestos e cheques sem fundo, saturando em 3 ocorrências
                </td>
                <td className="px-4 py-3 font-mono text-xs">0.35</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs">estabilidade_cadastral</td>
                <td className="px-4 py-3 text-muted-foreground">
                  Tempo de atividade e quadro societário
                </td>
                <td className="px-4 py-3 font-mono text-xs">0.15</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs">concentracao_setorial</td>
                <td className="px-4 py-3 text-muted-foreground">Risco base do setor de atividade</td>
                <td className="px-4 py-3 font-mono text-xs">0.15</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-muted-foreground">
          No score final do cliente, compliance pesa 0.4 e crédito 0.6. Só que 0.6 sozinho nunca
          alcança o limiar de rejeição (0.66), o que prenderia em revisão manual uma contraparte com
          os 4 modelos no teto. Por isso existe um limiar independente: crédito isolado acima de
          0.85 rejeita sozinho, exatamente como um veto de compliance.
        </p>
      </Section>

      <Section label="Regras" title="KYS, KYE, KYC: mesma engine, escopos diferentes">
        <FeatureCards
          features={[
            {
              title: "KYS · Fornecedor",
              body: (
                <p>
                  Escopo mais amplo: compliance por campo (sanção, mandado de prisão, processo
                  criminal, situação cadastral, sócios, dívida ativa) e checagem de mídia nas 6
                  categorias da taxonomia. Não roda crédito: o risco de fornecedor aqui é
                  reputacional, não de inadimplência.
                </p>
              ),
            },
            {
              title: "KYE · Colaborador",
              body: (
                <p>
                  Compliance restrito a processos, mandado de prisão e histórico trabalhista, com
                  mídia num escopo pessoal (envolvimento criminal, crime organizado, fraude). Sem
                  sanção internacional ou cartel, que não se aplicam a uma pessoa física candidata.
                </p>
              ),
            },
            {
              title: "KYC · Cliente",
              body: (
                <p>
                  Compliance básico (sanção, situação cadastral, dívida ativa), mídia em 2
                  categorias essenciais e <strong>os 4 modelos de crédito por cima</strong>. Único
                  conjunto de regras com camada de crédito.
                </p>
              ),
            },
            {
              title: "Regra é dado, não código",
              body: (
                <p>
                  Os 3 conjuntos não são 3 pipelines: são 3 valores de{" "}
                  <code className="text-xs">RiskAnalysisRules</code> (lista de regras, escopo de
                  mídia, usa crédito ou não) interpretados pelo mesmo motor. Um 4º conjunto é uma
                  nova composição, não lógica nova.
                </p>
              ),
            },
          ]}
        />
      </Section>

      <Section label="Checagem de mídia" title="Nome da contraparte mais termos por categoria de risco">
        <p className="mb-4 text-muted-foreground">
          Não é um bureau: monta buscas por nome da contraparte e palavras-chave agrupadas em 6
          categorias de risco (corrupção, lavagem de dinheiro, fraude, envolvimento criminal,
          sanções, crime organizado), 5 grupos de termos cada. A intensidade satura a partir de 3
          artigos corroborantes, porque uma menção isolada não pesa como três reportagens
          independentes. Categorias de maior severidade viram veto automático; as demais contribuem
          ponderadamente.
        </p>
        <CodeBlock
          filename="exemplo de query gerada (media_check_categories.py)"
          code={`"Fornecedor Exemplo LTDA" ("corrupção" OR "suborno" OR "propina" OR
  "peculato" OR "improbidade" OR "desvio de verbas")`}
        />
      </Section>

      <Section label="Carga" title="Contrato de campos do ERP e do CRM">
        <p className="mb-4 text-muted-foreground">
          O mapeamento é um dicionário único e explícito: é ele que o time de integração lê quando
          pergunta qual campo do CRM recebe o quê. Adicionar uma regra ao motor não altera o
          contrato. Campo ausente é omitido em vez de virar nulo, porque KYS e KYE não rodam crédito
          e enviar <code className="text-xs">null</code> apagaria o score gravado por uma análise de
          cliente anterior da mesma contraparte.
        </p>
        <CodeBlock
          filename="erp_crm_load.py (atributos gravados na contraparte)"
          code={`risco_documento          12345678000199
risco_tipo_pessoa        PJ
risco_status             BLOQUEADO      -- LIBERADO | EM_ANALISE | BLOQUEADO
risco_faixa              ALTO           -- BAIXO | MEDIO | ALTO
risco_score              0.91
risco_score_credito      0.88
risco_regras_sinalizadas ["sancao_ativa", "divida_ativa_registrada"]
risco_midia_categorias   ["lavagem_dinheiro_crimes_financeiros"]
risco_origem_analise     kyc
risco_versao_regras      1.0.0
risco_atualizado_em      2026-01-14T03:22:10Z

payload_hash             sha256 do conteúdo de negócio, sem timestamp
                         -> reprocessar sem mudança grava 0 linha`}
        />
        <p className="mt-4 text-muted-foreground">
          A chave do delta inclui o conjunto de regras: a mesma empresa pode ser fornecedor e
          cliente ao mesmo tempo, e a carga de uma análise de cliente não pode suprimir a de
          fornecedor.
        </p>
      </Section>

      <Section label="Escala" title="Por que PySpark, e não um script sequencial">
        <p className="text-muted-foreground">
          Consultar uma contraparte por vez serve para uma análise pontual, não para reavaliar a
          carteira inteira periodicamente. O lote é distribuído entre partições via{" "}
          <code className="text-xs">mapInPandas</code>, que reaproveita a mesma sessão HTTP para
          todas as linhas de uma partição em vez de abrir uma conexão por linha. A escolha por{" "}
          <code className="text-xs">mapInPandas</code> em vez de{" "}
          <code className="text-xs">rdd.mapPartitions</code> veio de um erro real em compute
          serverless, que não expõe a API de RDD.
        </p>
      </Section>

      <Section label="Testabilidade" title="Lógica de negócio testável sem cluster">
        <p className="text-muted-foreground">
          Cada módulo separa a lógica pura (retry, avaliação de regra, agregação de mídia, scorecard
          de crédito, merge de fontes, hash de idempotência) da integração com Spark. A primeira
          nunca importa PySpark, e o transporte HTTP é injetável, então nem rede nem mock de rede
          entram nos testes. Resultado: 74 testes cobrindo cada decisão de negócio rodam com{" "}
          <code className="text-xs">pytest</code> puro em menos de 1 segundo, sem subir Spark nem
          Java.
        </p>
      </Section>

      <Section label="Arquitetura" title="Da fonte ao cadastro no ERP">
        <FlowDiagram
          steps={[
            "Lote de contrapartes (documento, nome)",
            "Extract: bureaus REST + servidores MCP, merge com procedência",
            "Transform: compliance por campo, mídia por categoria, 4 modelos de crédito",
            "3 DataFrames tipados (KYS, KYE, KYC) + métricas da carteira",
            "Load: upsert idempotente de atributos de risco no ERP/CRM",
          ]}
          caption="O nome comercial do produto e os bureaus reais integrados foram omitidos de propósito: esta é uma reformulação de portfólio sob uma ótica de processamento em lote."
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
