import type { Metadata } from "next";
import Link from "next/link";
import { BotMessageSquare, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { FileBadge } from "@/components/ui/file-badge";
import { GlassCard } from "@/components/ui/glass-card";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { MaterialRow } from "@/types/db";

export const metadata: Metadata = { title: "Search" };

/** Escapes LIKE wildcards so user input is matched literally. */
function likeEscape(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { user } = await requireOnboardedUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  let materials: MaterialRow[] = [];
  if (q) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("materials")
      .select("id, title, file_type, size_bytes, page_count, status, created_at, last_opened_at")
      .eq("user_id", user.id)
      .ilike("title", `%${likeEscape(q)}%`)
      .order("created_at", { ascending: false })
      .limit(25);
    materials = (data ?? []) as MaterialRow[];
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
      <form role="search" action="/search">
        <label htmlFor="search-page-q" className="sr-only">Search materials or ask a question</label>
        <div className="glass relative flex h-14 items-center rounded-full">
          <Search className="absolute left-5 size-5 text-fg-2" aria-hidden="true" />
          <input id="search-page-q" name="q" defaultValue={q} type="search" autoFocus maxLength={200} placeholder="Search materials, topics, or ask a question…" className="h-full w-full rounded-full bg-transparent pl-13 pr-5 text-fg placeholder:text-muted outline-none focus:ring-2 focus:ring-accent/60" />
        </div>
      </form>
      {q && (
        <>
          <Link href={`/tutor?q=${encodeURIComponent(q)}`} className="focus-ring block rounded-[var(--radius-glass)]">
            <GlassCard className="flex items-center gap-4 p-4 transition hover:border-accent/40">
              <BotMessageSquare className="size-6 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">Ask the AI Tutor: <span className="text-fg-2">“{q}”</span></span>
            </GlassCard>
          </Link>
          <GlassCard className="p-2">
            {materials.length ? (
              <ul>
                {materials.map((m) => (
                  <li key={m.id}>
                    <Link href={`/library/${m.id}`} className="focus-ring flex items-center gap-3 rounded-2xl p-3 hover:bg-white/5">
                      <FileBadge type={m.file_type} size={32} />
                      <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                      <span className="text-xs text-fg-2">{m.page_count ? `${m.page_count} pages` : m.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Search className="size-6" />} title="No materials match" description="Try a different word, or ask the AI Tutor instead." />
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
