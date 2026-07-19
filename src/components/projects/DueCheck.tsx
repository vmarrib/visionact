import { ProjectHeader } from "@/components/ProjectHeader";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TechStack } from "@/components/TechStack";
import { FeatureCards, BulletList } from "@/components/FeatureCards";
import { projects } from "@/lib/projects";

const meta = projects.find((p) => p.slug === "due-check")!;

export function DueCheck() {
  return (
    <>
      <ProjectHeader
        index={meta.index}
        name={meta.name}
        tagline={meta.tagline}
        domain={meta.domain}
        problem="Antes de fechar negócio com um fornecedor, cliente ou terceiro, uma empresa precisa avaliar risco de compliance — mas os dados relevantes estão espalhados entre fontes públicas heterogêneas (Receita Federal, Portal da Transparência/CGU, CNJ, listas de sanções). O Due Check centraliza essas consultas numa matriz de risco configurável por organização, calcula um score e gera um dossiê auditável."
        stack={meta.stack}
        github={meta.github}
      />

      <Section label="Multi-tenancy" title="Isolamento real via RLS, não só no app">
        <p className="text-muted-foreground">
          Toda tabela de negócio carrega <code className="text-xs">org_id</code> e uma policy que
          passa por{" "}
          <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">
            is_org_member()
          </code>
          , uma função <code className="text-xs">SECURITY DEFINER</code> central que evita
          recursão de política. Papéis (owner/admin/analyst/viewer) são checados tanto no client
          quanto reforçados de novo no servidor antes de qualquer ação sensível — como restaurar um
          dossiê excluído.
        </p>
      </Section>

      <Section label="Integrações" title="Adapter pattern para fontes de dados heterogêneas">
        <FeatureCards
          features={[
            {
              title: "8+ bureaus públicos",
              body: (
                <>
                  <p className="mb-2">Uma interface comum isola as peculiaridades de cada API:</p>
                  <BulletList
                    items={[
                      "CGU: duas chamadas paralelas (CEIS + CNEP)",
                      "CNJ DataJud: varre ~30 tribunais com timeout individual",
                      "Falhas parciais não derrubam o pipeline",
                    ]}
                  />
                </>
              ),
            },
            {
              title: "Media Check próprio",
              body: (
                <p>
                  Em vez de contratar uma API paga de mídia adversa, faz scraping estruturado do
                  Google News RSS com deduplicação e detecção de termos negativos configuráveis.
                </p>
              ),
            },
            {
              title: "Controle de custo",
              body: (
                <p>
                  Cache de 30 dias por bureau e limite mensal de consultas por organização — uma
                  decisão de produto tanto quanto técnica.
                </p>
              ),
            },
            {
              title: "Auditoria e soft-delete",
              body: (
                <p>
                  Toda decisão (score, exclusão, restauração) fica registrada em log de auditoria;
                  exclusão de dossiê nunca é definitiva.
                </p>
              ),
            },
          ]}
        />
      </Section>

      <Section label="Arquitetura" title="Da matriz de risco ao dossiê">
        <FlowDiagram
          steps={[
            "Matriz de risco configurada",
            "Consulta paralela a bureaus",
            "Motor de regras (score)",
            "Dossiê auditável (PDF/Excel)",
          ]}
          caption="Uma rota pública sem autenticação (link de coleta) usa um client isolado com privilégio de serviço, sem expor RLS a usuários anônimos."
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
