import type { ReactNode } from "react";

export function Section({
  label,
  title,
  children,
}: {
  label?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border py-10 first:border-t-0">
      <div className="mb-5">
        {label && (
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            {label}
          </p>
        )}
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
