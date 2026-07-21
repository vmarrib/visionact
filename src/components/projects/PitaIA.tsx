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
      />

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
