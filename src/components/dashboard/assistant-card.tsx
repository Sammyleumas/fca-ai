"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bot, SendHorizontal } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

export function AssistantCard() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-gradient-to-br from-white/15 to-white/5 text-accent">
          <Bot className="size-8" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">AI Study Assistant</h2>
          <p className="mt-1 text-sm text-fg-2">Ask anything about your studies. I&apos;m here to help you learn better.</p>
        </div>
      </div>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = q.trim();
          router.push(v ? `/tutor?q=${encodeURIComponent(v.slice(0, 2000))}` : "/tutor");
        }}
      >
        <label htmlFor="assistant-q" className="sr-only">
          Ask the AI Study Assistant
        </label>
        <div className="glass flex h-14 items-center rounded-full pl-5 pr-1.5">
          <input
            id="assistant-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type your question…"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-muted outline-none"
            maxLength={2000}
          />
          <button
            type="submit"
            className="focus-ring flex size-11 items-center justify-center rounded-full bg-accent text-[#000000] transition hover:bg-[#e2ff63]"
            aria-label="Ask"
          >
            <SendHorizontal className="size-5" />
          </button>
        </div>
      </form>
    </GlassCard>
  );
}
