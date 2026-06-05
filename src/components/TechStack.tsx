export function TechStack({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs text-surface-foreground"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
