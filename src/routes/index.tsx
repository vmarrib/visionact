import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import { projects, profile } from "@/lib/projects";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vanessa M. Ribeiro, Engenheira & Cientista de Dados" },
      {
        name: "description",
        content:
          "Portfólio de Vanessa M. Ribeiro: engenharia de dados aplicada a domínios sensíveis do mundo real — saúde, compliance e biometria. Três projetos em produção, de ponta a ponta.",
      },
      { property: "og:title", content: "Vanessa M. Ribeiro, Engenheira & Cientista de Dados" },
      {
        property: "og:description",
        content:
          "Engenharia de dados aplicada a saúde, compliance e biometria — três projetos em produção, de ponta a ponta.",
      },
    ],
  }),
  component: Index,
});

const skills = [
  "Data Engineering",
  "PostgreSQL & RLS",
  "Supabase",
  "Applied AI / LLMs",
  "Computer Vision",
  "Compliance & Risk",
  "TypeScript / React",
];

function Index() {
  return (
    <Layout>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-5 pt-16 pb-10 sm:pt-24">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">
          Engenheira & Cientista de Dados
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          {profile.name}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {profile.summary}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="#projetos"
            className="rounded-md bg-foreground px-4 py-2 font-mono text-sm text-background transition-opacity hover:opacity-90"
          >
            ver projetos
          </a>
          <a
            href={`mailto:${profile.email}`}
            className="rounded-md border border-border px-4 py-2 font-mono text-sm text-foreground transition-colors hover:bg-secondary"
          >
            entrar em contato
          </a>
        </div>

        <ul className="mt-10 flex flex-wrap gap-2">
          {skills.map((s) => (
            <li
              key={s}
              className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground"
            >
              {s}
            </li>
          ))}
        </ul>
      </section>

      {/* Projects */}
      <section id="projetos" className="mx-auto max-w-5xl scroll-mt-16 px-5 pb-20">
        <div className="flex items-baseline justify-between border-b border-border pb-4">
          <h2 className="font-mono text-sm font-medium text-foreground">
            projetos
          </h2>
          <span className="font-mono text-xs text-muted-foreground">
            {projects.length} repositórios
          </span>
        </div>

        <ul>
          {projects.map((p) => (
            <li key={p.slug}>
              <Link
                to="/projects/$slug"
                params={{ slug: p.slug }}
                className="group block border-b border-border py-6 transition-colors hover:bg-secondary/50"
              >
                <div className="flex flex-col gap-4 px-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        /{p.index}
                      </span>
                      <h3 className="font-mono text-base font-semibold text-primary group-hover:underline">
                        {p.name}
                      </h3>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {p.description}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {p.stack.slice(0, 6).map((t) => (
                        <li
                          key={t}
                          className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground"
                        >
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="shrink-0 font-mono text-xs text-muted-foreground sm:text-right">
                    <span className="rounded-md border border-border px-2 py-1">
                      {p.domain}
                    </span>
                    <span className="mt-3 hidden items-center justify-end gap-1 text-foreground transition-transform group-hover:translate-x-0.5 sm:flex">
                      abrir →
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Layout>
  );
}
