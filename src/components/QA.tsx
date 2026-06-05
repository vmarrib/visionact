export function QA({
  question,
  area,
  answers,
}: {
  question: string;
  area?: string;
  answers: string[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      {area && (
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {area}
        </p>
      )}
      <p className="mt-1 font-medium text-foreground">“{question}”</p>
      <ul className="mt-3 space-y-1.5">
        {answers.map((a) => (
          <li key={a} className="flex gap-2 text-sm text-muted-foreground">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{a}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
