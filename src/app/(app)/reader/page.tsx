import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { FileBadge } from "@/components/ui/file-badge";
import { GlassCard } from "@/components/ui/glass-card";
import { ProgressBar } from "@/components/ui/progress";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { clampPercent, formatMinutes } from "@/lib/utils/format";
import type { MaterialFileType } from "@/types/db";

export const metadata: Metadata = { title: "Reading Room" };

type Row = {
  id: string;
  title: string;
  file_type: MaterialFileType;
  page_count: number | null;
  last_opened_at: string | null;
  reading_progress: { percent_complete: number; current_page: number; total_seconds: number; last_read_at: string }[] | { percent_complete: number; current_page: number; total_seconds: number; last_read_at: string } | null;
};

export default async function ReadingRoomPage() {
  const { user } = await requireOnboardedUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("materials")
    .select("id, title, file_type, page_count, last_opened_at, reading_progress(percent_complete, current_page, total_seconds, last_read_at)")
    .eq("user_id", user.id)
    .eq("status", "ready")
    .order("last_opened_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = ((data ?? []) as Row[]).map((m) => ({ ...m, rp: Array.isArray(m.reading_progress) ? m.reading_progress[0] : m.reading_progress }));
  const started = rows.filter((r) => r.rp && Number(r.rp.percent_complete) < 100);
  const others = rows.filter((r) => !started.includes(r));

  const Card = ({ r }: { r: (typeof rows)[number] }) => (
    <Link href={`/reader/${r.id}`} className="focus-ring block rounded-[var(--radius-glass)]">
      <GlassCard className="flex items-center gap-4 p-4 transition hover:border-accent/40">
        <FileBadge type={r.file_type} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{r.title}</p>
          <p className="text-xs text-fg-2">
            {r.rp ? `Page ${r.rp.current_page}${r.page_count ? ` of ${r.page_count}` : ""} · ${formatMinutes(Math.round(r.rp.total_seconds / 60))} read` : r.page_count ? `${r.page_count} pages · not started` : "Not started"}
          </p>
          {r.rp && (
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar value={Number(r.rp.percent_complete)} label={`${r.title} progress`} />
              <span className="text-xs font-semibold">{clampPercent(Number(r.rp.percent_complete))}%</span>
            </div>
          )}
        </div>
      </GlassCard>
    </Link>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Reading Room</h1>
        <p className="mt-1 text-sm text-fg-2">Read your materials, highlight, take notes and ask AI about any passage. You&apos;ll always resume where you stopped.</p>
      </div>
      {!rows.length ? (
        <GlassCard>
          <EmptyState
            icon={<BookOpenText className="size-6" />}
            title="Nothing to read yet"
            description="Upload a material — once it's processed, it opens here."
            action={<ButtonLink href="/library?upload=1" size="sm">Upload material</ButtonLink>}
          />
        </GlassCard>
      ) : (
        <>
          {started.length > 0 && (
            <section aria-labelledby="continue">
              <h2 id="continue" className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-2">Continue reading</h2>
              <ul className="grid gap-3 md:grid-cols-2">{started.map((r) => <li key={r.id}><Card r={r} /></li>)}</ul>
            </section>
          )}
          {others.length > 0 && (
            <section aria-labelledby="all">
              <h2 id="all" className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-2">{started.length ? "Other materials" : "Your materials"}</h2>
              <ul className="grid gap-3 md:grid-cols-2">{others.map((r) => <li key={r.id}><Card r={r} /></li>)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
