import { Link } from "@tanstack/react-router";
import { profile } from "@/lib/projects";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
        <Link to="/" className="group flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground font-mono text-xs font-semibold text-background">
            va
          </span>
          <span className="font-mono text-sm font-medium tracking-tight text-foreground">
            {profile.siteName}
          </span>
        </Link>
        <nav className="flex items-center gap-1 font-mono text-xs">
          <Link
            to="/"
            hash="projetos"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            projetos
          </Link>
          <a
            href={profile.github}
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            github
          </a>
          <a
            href={`mailto:${profile.email}`}
            className="rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-foreground hover:text-background"
          >
            contato
          </a>
        </nav>
      </div>
    </header>
  );
}
