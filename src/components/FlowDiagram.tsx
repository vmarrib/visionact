import { Fragment } from "react";

export function FlowDiagram({
  steps,
  caption,
}: {
  steps: string[];
  caption?: string;
}) {
  return (
    <figure className="rounded-lg border border-border bg-surface p-6">
      <div className="flex flex-col items-center gap-0">
        {steps.map((step, i) => (
          <Fragment key={step + i}>
            <div className="w-full max-w-xs rounded-md border border-border bg-card px-4 py-2.5 text-center font-mono text-sm font-medium text-foreground shadow-sm">
              {step}
            </div>
            {i < steps.length - 1 && (
              <div className="my-1 h-5 w-px bg-border" aria-hidden>
                <div className="relative -left-[3px] top-4 h-0 w-0 border-x-[3px] border-t-[5px] border-x-transparent border-t-border" />
              </div>
            )}
          </Fragment>
        ))}
      </div>
      {caption && (
        <figcaption className="mt-5 text-center font-mono text-xs text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
