export default function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] animate-pulse space-y-5" aria-busy="true" aria-label="Loading">
      <div className="glass h-52 rounded-[var(--radius-glass)]" />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="glass h-64 rounded-[var(--radius-glass)]" />
        <div className="glass h-64 rounded-[var(--radius-glass)]" />
      </div>
    </div>
  );
}
