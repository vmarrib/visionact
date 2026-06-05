import { Link } from "@tanstack/react-router";
import { profile } from "@/lib/projects";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-mono text-xs text-muted-foreground">
          <p className="text-foreground">{profile.name}</p>
          <p className="mt-1">{profile.role}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
          <a href={`mailto:${profile.email}`} className="text-muted-foreground transition-colors hover:text-foreground">
            email
          </a>
          <a href={profile.github} target="_blank" rel="noreferrer" className="text-muted-foreground transition-colors hover:text-foreground">
            github
          </a>
          <a href={profile.linkedin} target="_blank" rel="noreferrer" className="text-muted-foreground transition-colors hover:text-foreground">
            linkedin
          </a>
          <Link to="/" className="text-muted-foreground transition-colors hover:text-foreground">
            início
          </Link>
        </div>
      </div>
    </footer>
  );
}
