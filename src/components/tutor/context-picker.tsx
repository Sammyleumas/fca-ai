"use client";

import { useRouter } from "next/navigation";
import { BookOpenText } from "lucide-react";

/** Chooses whether a new conversation answers from a material or from general knowledge. */
export function ContextPicker({ materials, value }: { materials: { id: string; title: string }[]; value: string | null }) {
  const router = useRouter();
  return (
    <label className="glass mb-4 flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm">
      <BookOpenText className="size-4 shrink-0 text-accent" aria-hidden="true" />
      <span className="shrink-0 text-fg-2">Answer from</span>
      <select
        value={value ?? ""}
        onChange={(e) => router.push(e.target.value ? `/tutor?material=${e.target.value}` : "/tutor")}
        className="min-w-0 flex-1 bg-transparent font-medium text-fg outline-none [&>option]:bg-bg-2"
        aria-label="Answer from"
      >
        <option value="">General knowledge</option>
        {materials.map((m) => (
          <option key={m.id} value={m.id}>
            {m.title}
          </option>
        ))}
      </select>
    </label>
  );
}
