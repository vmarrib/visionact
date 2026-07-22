import { ProjectHeader } from "@/components/ProjectHeader";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TechStack } from "@/components/TechStack";
import { FeatureCards, BulletList } from "@/components/FeatureCards";
import { projects } from "@/lib/projects";

const meta = projects.find((p) => p.slug === "pitaia")!;

export function PitaIA() {
  return (
    <>
      <ProjectHeader
        index={meta.index}
        name={meta.name}
        tagline={meta.tagline}
        domain={meta.domain}
        problem="Dados de saúde ficam espalhados entre apps de treino, sono, humor, exames e ciclo menstrual — e o acompanhamento entre paciente e profissional (psicólogo, trainer) é descontínuo. O PitaIA unifica esse histórico num só lugar e usa IA com contexto real do usuário para gerar insights, respeitando limites claros sobre o que pode ser compartilhado."
        stack={meta.stack}
        github={meta.github}
        liveUrl="https://apitaia.com"
      />

      <Section label="Demo" title="O app está no ar — sem simulação nesta página">
        <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-primary/30 bg-accent p-5 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-accent-foreground">
              Diferente do Checagem de Risco (que tem uma demo embutida), o PitaIA é um produto
              completo em produção — a forma mais honesta de mostrar é te mandar direto pra lá.
            </p>
            <p className="mt-1 text-sm text-accent-foreground/80">
              Cadastro gratuito, sem cartão de crédito.
            </p>
          </div>
          <a
            href="https://apitaia.com"
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-md bg-foreground px-5 py-2.5 font-mono text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Criar conta grátis →
          </a>
        </div>
      </Section>

      <Section label="Modelagem de acesso" title="RLS multi-papel, não só autenticação">
        <p className="text-muted-foreground">
          Toda a base é multiusuário com Row Level Security no Postgres: funções{" "}
          <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">
            is_professional_of()
          </code>{" "}
          e{" "}
          <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">
            has_role()
          </code>{" "}
          (declaradas <code className="text-xs">SECURITY DEFINER</code> para evitar recursão de
          política) permitem que um trainer ou psicólogo veja check-ins e treinos do paciente. O
          diário pessoal, porém, tem uma policy exclusiva — nenhum profissional tem acesso de
          leitura, decisão registrada explicitamente no schema.
        </p>
      </Section>

      <Section label="Camada de IA" title="RAG manual, sem framework">
        <FeatureCards
          features={[
            {
              title: "Contexto agregado + tendência calculada",
              body: (
                <p>
                  Uma edge function monta o prompt agregando até 90 dias de check-ins, treinos,
                  medidas e exames, e já inclui a tendência de humor/energia calculada em código
                  (metade recente vs. anterior do período) — "sua energia caiu" nunca é uma
                  inferência do modelo, é aritmética determinística feita antes do prompt.
                </p>
              ),
            },
            {
              title: "Streaming persistente",
              body: (
                <p>
                  A resposta da IA chega via streaming (SSE) e é parseada e persistida
                  incrementalmente, sem esperar o fim da geração para gravar no histórico.
                </p>
              ),
            },
            {
              title: "Custo de IA híbrido",
              body: (
                <>
                  <p className="mb-2">Estratégia de produto, não só técnica:</p>
                  <BulletList
                    items={[
                      "Features leves via gateway compartilhado",
                      "Chat completo via chave própria do usuário (BYOK)",
                    ]}
                  />
                </>
              ),
            },
            {
              title: "Instrumentos clínicos validados",
              body: (
                <>
                  <p className="mb-2">Modelados como dados declarativos, com scoring uniforme:</p>
                  <BulletList items={["PHQ-9", "GAD-7", "PSS-10", "DASS-21", "WHO-5", "PSQI"]} />
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section label="Arquitetura" title="Do check-in ao insight">
        <FlowDiagram
          steps={[
            "Check-in diário",
            "Supabase (RLS por papel)",
            "Edge Function (contexto 90 dias)",
            "Claude API (streaming)",
            "Insight persistido",
          ]}
          caption="A edge function é o único ponto que agrega dados sensíveis antes de expô-los à IA — o client nunca monta esse contexto."
        />
        <p className="mt-4 text-sm text-muted-foreground">
          18 testes Vitest cobrem a janela de contexto, o cálculo de tendência e o scoring dos
          instrumentos clínicos — cada função pura testável sem depender de Supabase ou da API do
          Claude.
        </p>
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
