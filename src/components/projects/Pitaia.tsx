import { ProjectHeader } from "@/components/ProjectHeader";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TechStack } from "@/components/TechStack";
import { CodeBlock } from "@/components/CodeBlock";
import { FeatureCards, BulletList } from "@/components/FeatureCards";

const stack = [
  "React",
  "Lovable",
  "Supabase",
  "PostgreSQL",
  "Edge Functions",
  "OpenAI",
  "Vercel",
];

const market = [
  { label: "TAM", value: "US$ 400B", desc: "Mercado total de saúde mental digital" },
  { label: "SAM", value: "US$ 40B", desc: "Segmento atingível com IA clínica" },
  { label: "SOM", value: "US$ 400M", desc: "Fatia capturável no horizonte do plano" },
];

export function Pitaia() {
  return (
    <>
      <ProjectHeader
        index="03"
        name="PitaIA Digital Health Ecosystem"
        tagline="Saúde digital com IA clínica"
        domain="Product · Applied AI"
        problem="Saúde mental precisa de acompanhamento contínuo e personalizado. O PitaIA combina check-in emocional, IA clínica e dados comportamentais consentidos — demonstrando visão de produto, não apenas código."
        stack={stack}
      />

      <Section label="Posicionamento" title="Pensamento de fundadora, não só engenharia">
        <p className="text-muted-foreground">
          Este é o projeto mais importante porque demonstra visão de produto. A
          ideia não é só entregar features, mas estruturar um ecossistema —
          documentação de visão, roadmap, design system e pesquisa de mercado
          tratados como parte do produto.
        </p>
      </Section>

      <Section label="Repositório" title="Estrutura como produto">
        <CodeBlock
          filename="pitaia-platform/"
          code={`pitaia-platform
├── docs
│   ├── vision.md
│   ├── roadmap.md
│   └── architecture.md
├── frontend
├── backend
├── mobile
├── design-system
├── market-research
└── ai`}
        />
      </Section>

      <Section label="Design System" title="Base de consistência visual">
        <TechStack
          items={[
            "Tipografia",
            "Componentes",
            "Tokens",
            "Cores",
            "Espaçamentos",
            "Guidelines",
          ]}
        />
      </Section>

      <Section label="Funcionalidades" title="O que o ecossistema entrega">
        <FeatureCards
          features={[
            {
              title: "Check-in emocional",
              body: (
                <>
                  <p className="mb-2">Escalas de acompanhamento diário:</p>
                  <BulletList items={["Humor", "Ansiedade", "Energia", "Sono"]} />
                </>
              ),
            },
            {
              title: "IA clínica",
              body: (
                <>
                  <p className="mb-2">Geração assistida de:</p>
                  <BulletList items={["Insights", "Protocolos", "Tendências"]} />
                </>
              ),
            },
            {
              title: "Dados sociais (opt-in)",
              body: (
                <>
                  <p className="mb-2">Captura opcional e consentida de:</p>
                  <BulletList items={["Instagram", "X", "Reddit", "TikTok"]} />
                  <p className="mt-2 text-xs">
                    Para análise comportamental agregada e consentida.
                  </p>
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section label="Arquitetura" title="Fluxo orientado a eventos">
        <FlowDiagram
          steps={[
            "Frontend",
            "Supabase",
            "Event Bus",
            "AI Layer",
            "Clinical Insights",
          ]}
          caption="Um event bus desacopla a captura de dados da camada de IA, permitindo evoluir os modelos sem tocar no produto."
        />
        <div className="mt-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Tecnologias
          </p>
          <TechStack items={stack} />
        </div>
      </Section>

      <Section label="Visão de mercado" title="TAM · SAM · SOM">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3 font-medium">Mercado</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Descrição</th>
              </tr>
            </thead>
            <tbody>
              {market.map((m) => (
                <tr key={m.label} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-mono font-semibold text-primary">
                    {m.label}
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-foreground">
                    {m.value}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {m.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
