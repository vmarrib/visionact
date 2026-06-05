export function CodeBlock({
  code,
  filename,
}: {
  code: string;
  filename?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {filename && (
        <div className="border-b border-border bg-terminal px-4 py-2 font-mono text-xs text-terminal-muted">
          {filename}
        </div>
      )}
      <pre className="overflow-x-auto bg-terminal p-4 font-mono text-xs leading-relaxed text-terminal-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
