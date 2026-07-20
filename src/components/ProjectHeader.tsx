import { Link } from "@tanstack/react-router";
import { TechStack } from "./TechStack";

export function ProjectHeader({
  index,
  name,
  tagline,
  domain,
  problem,
  stack,
  github,
}: {
  index: string;
  name: string;
  tagline: string;
  domain: string;
  problem: string;
  stack: string[];
  github?: string;
}) {
  return (
    <header className="border-b border-border py-10">
      <Link
        to="/"
        hash="projetos"
        className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        ← todos os projetos
      </Link>
      <div className="mt-6 flex items-center gap-3 font-mono text-xs">
        <span className="text-muted-foreground">/{index}</span>
        <span className="rounded-md bg-accent px-2 py-0.5 text-accent-foreground">
          {domain}
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {name}
      </h1>
      <p className="mt-2 text-lg text-muted-foreground">{tagline}</p>
      {github && (
        <a
          href={github}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-mono text-xs text-foreground transition-colors hover:bg-secondary"
        >
          ver código no GitHub →
        </a>
      )}

      <div className="mt-6 rounded-lg border border-border bg-surface p-5">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">
          Problema
        </p>
        <p className="mt-2 text-foreground">{problem}</p>
      </div>

      <div className="mt-6">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Stack
        </p>
        <TechStack items={stack} />
      </div>
    </header>
  );
}
