import type { ComponentType } from "react";
import { createFileRoute, notFound, useRouter, Link } from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import { projects } from "@/lib/projects";
import { PitaIA } from "@/components/projects/PitaIA";
import { ChecagemDeRisco } from "@/components/projects/ChecagemDeRisco";
import { PontoInteligente } from "@/components/projects/PontoInteligente";

const content: Record<string, ComponentType> = {
  pitaia: PitaIA,
  "checagem-de-risco": ChecagemDeRisco,
  "ponto-inteligente": PontoInteligente,
};

export const Route = createFileRoute("/projects/$slug")({
  loader: ({ params }) => {
    const project = projects.find((p) => p.slug === params.slug);
    if (!project || !content[params.slug]) throw notFound();
    return { project };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.project;
    if (!p) return {};
    const title = `${p.name}, Vanessa M. Ribeiro`;
    return {
      meta: [
        { title },
        { name: "description", content: p.description },
        { property: "og:title", content: title },
        { property: "og:description", content: p.description },
      ],
    };
  },
  component: ProjectPage,
  notFoundComponent: ProjectNotFound,
  errorComponent: ProjectError,
});

function ProjectPage() {
  const { project } = Route.useLoaderData();
  const Content = content[project.slug];
  return (
    <Layout>
      <article className="mx-auto max-w-3xl px-5 pb-16">
        <Content />
        <NextProject currentSlug={project.slug} />
      </article>
    </Layout>
  );
}

function NextProject({ currentSlug }: { currentSlug: string }) {
  const idx = projects.findIndex((p) => p.slug === currentSlug);
  const next = projects[(idx + 1) % projects.length];
  return (
    <div className="mt-12 border-t border-border pt-8">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Próximo projeto
      </p>
      <Link
        to="/projects/$slug"
        params={{ slug: next.slug }}
        className="mt-2 flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-5 transition-colors hover:bg-secondary/50"
      >
        <div>
          <p className="font-mono text-sm font-semibold text-primary">{next.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{next.tagline}</p>
        </div>
        <span className="font-mono text-sm text-foreground">→</span>
      </Link>
    </div>
  );
}

function ProjectNotFound() {
  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Projeto não encontrado</h1>
        <Link to="/" hash="projetos" className="mt-4 inline-block font-mono text-sm text-primary hover:underline">
          ← voltar aos projetos
        </Link>
      </div>
    </Layout>
  );
}

function ProjectError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-4 rounded-md bg-foreground px-4 py-2 font-mono text-sm text-background"
        >
          tentar novamente
        </button>
      </div>
    </Layout>
  );
}
