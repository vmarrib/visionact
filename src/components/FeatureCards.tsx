import type { ReactNode } from "react";

type Feature = {
  title: string;
  body: ReactNode;
};

export function FeatureCards({ features }: { features: Feature[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {features.map((f) => (
        <div key={f.title} className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-mono text-sm font-semibold text-foreground">
            {f.title}
          </h3>
          <div className="mt-2 text-sm text-muted-foreground">{f.body}</div>
        </div>
      ))}
    </div>
  );
}

export function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm text-muted-foreground">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
