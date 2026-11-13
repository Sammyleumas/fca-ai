import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AlertTriangle, ArrowLeft, BookOpenText, CalendarDays, Clock, FileText, Info, ListTree, Loader2 } from "lucide-react";
import { MaterialActions } from "@/components/library/material-actions";
import { StatusPoller } from "@/components/library/status-poller";
import { FormMessage, EmptyState } from "@/components/ui/feedback";
import { FileBadge } from "@/components/ui/file-badge";
import { CardHeader, GlassCard } from "@/components/ui/glass-card";
import { ProgressBar } from "@/components/ui/progress";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { limitsFor } from "@/lib/billing/plans";
import { getLibrary, getMaterialDetail } from "@/lib/data/library";
import { getShellData } from "@/lib/data/shell";
import { isProcessing } from "@/lib/materials/library-filter";
import { clampPercent, formatBytes, formatMinutes } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Material" };
export const maxDuration = 60;

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploading",
  queued: "Queued",
  extracting: "Extracting text",
  analysing: "Analysing",
  structuring: "Structuring",
  ready: "Ready",
  failed: "Failed",
};

export default async function MaterialPage({ params }: PageProps<"/library/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { user, profile } = await requireOnboardedUser();
  const [m, library, shell] = await Promise.all([getMaterialDetail(user.id, id), getLibrary(user.id), getShellData(user.id)]);
  if (!m) notFound();

  const processing = isProcessing(m.status);
  const chapters = m.sections.filter((s) => s.level === 1).sort((a, b) => a.position - b.position);
  const subs = (parent: string) => m.sections.filter((s) => s.parent_id === parent).sort((a, b) => a.position - b.position);
  const totalMinutes = chapters.reduce((n, c) => n + (c.estimated_minutes ?? 0), 0);
  const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: profile.timezone });
  const pages = m.page_count ? `${m.pages_are_estimated ? "~" : ""}${m.page_count}` : "—";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {processing && <StatusPoller ids={[m.id]} />}
      <Link href="/library" className="focus-ring inline-flex items-center gap-2 rounded-full text-sm text-fg-2 hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> My Library
      </Link>

      <GlassCard className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <FileBadge type={m.file_type} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{m.title}</h1>
            <p className="mt-1 truncate text-sm text-fg-2">{m.original_filename}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              {[
                ["Pages", pages],
                ["Size", formatBytes(m.size_bytes)],
                ["Words", m.word_count ? m.word_count.toLocaleString() : "—"],
                ["Uploaded", dateFmt.format(new Date(m.created_at))],
                ["Status", STATUS_LABEL[m.status] ?? m.status],
                ["Subject", m.subject?.name ?? "—"],
                ["Folder", m.folder?.name ?? "—"],
                ["Reading", m.progress > 0 ? `${clampPercent(m.progress)}%` : "Not started"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="truncate font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <MaterialActions
          material={{ id: m.id, title: m.title, status: m.status, subjectId: m.subject?.id ?? null, folderId: m.folder?.id ?? null }}
          subjects={library.subjects}
          folders={library.folders}
          maxBytes={limitsFor(shell.plan).maxUploadBytes}
        />
      </GlassCard>

      {processing && (
        <GlassCard className="p-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" /> {m.status_detail ?? "Processing…"}
          </p>
          <ProgressBar value={m.processing_progress} className="mt-3" label="Processing progress" />
          <p className="mt-2 text-xs text-fg-2">You can leave this page — processing continues and you&apos;ll get a notification.</p>
        </GlassCard>
      )}
      {m.status === "failed" && <FormMessage>{m.processing_error ?? "Processing failed."} Use “Retry processing” above, or replace the file.</FormMessage>}
      {m.status === "ready" && m.processing_warning && (
        <FormMessage tone="info">
          <span className="sr-only">Note: </span>
          {m.processing_warning}
        </FormMessage>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <GlassCard className="p-5 sm:p-6">
          <CardHeader icon={<ListTree className="size-5" />} title="Structure" action={totalMinutes > 0 && <span className="flex items-center gap-1 text-xs text-fg-2"><Clock className="size-3.5" aria-hidden="true" /> ~{formatMinutes(totalMinutes)} reading</span>} />
          {chapters.length ? (
            <ol className="mt-4 space-y-2">
              {chapters.map((c) => (
                <li key={c.id} className="rounded-2xl border border-line bg-white/[0.03] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{c.title}</p>
                    <span className="shrink-0 text-xs text-fg-2">
                      {m.pages_are_estimated ? "~" : ""}p. {c.start_page}–{c.end_page}
                    </span>
                  </div>
                  {subs(c.id).length > 0 && (
                    <ol className="mt-2 space-y-1 border-l border-line pl-3">
                      {subs(c.id).map((s) => (
                        <li key={s.id} className="flex items-start justify-between gap-3 text-sm text-fg-2">
                          <span>{s.title}</span>
                          <span className="shrink-0 text-xs">p. {s.start_page}–{s.end_page}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              icon={<ListTree className="size-6" />}
              title={m.status === "ready" ? "No chapters detected" : "Structure appears after processing"}
              description={m.status === "ready" ? "AI segmentation into chapters and learning units arrives in the next build phase." : undefined}
              className="py-6"
            />
          )}
        </GlassCard>

        <GlassCard className="p-5 sm:p-6">
          <CardHeader icon={<FileText className="size-5" />} title="Preview" action={m.status !== "uploaded" && <a href={`/api/materials/${m.id}/file`} className="text-sm font-medium text-accent hover:underline">Download</a>} />
          {m.status === "uploaded" ? (
            <p className="mt-4 text-sm text-fg-2">The upload hasn&apos;t finished yet.</p>
          ) : m.file_type === "pdf" ? (
            <iframe
              src={`/api/materials/${m.id}/file?inline=1`}
              title={`Preview of ${m.title}`}
              className="mt-4 h-[28rem] w-full rounded-2xl border border-line bg-white"
            />
          ) : m.previewPages.length ? (
            <div className="mt-4 space-y-3">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Info className="size-3.5" aria-hidden="true" /> Extracted text from the original (formatting simplified).
              </p>
              <div className="max-h-[26rem] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-line bg-white/[0.03] p-4 text-sm leading-relaxed text-fg/90">
                {m.previewPages.map((p) => p.content).join("\n\n").slice(0, 6000)}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-fg-2">Preview appears once text has been extracted.</p>
          )}
        </GlassCard>
      </div>

      <GlassCard className="flex flex-wrap items-center gap-4 p-5">
        <BookOpenText className="size-6 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Study this material</p>
          <p className="text-sm text-fg-2">
            {m.plans.length ? `In plan: ${m.plans.map((p) => p.title).join(", ")}` : "Not in a study plan yet."}
          </p>
        </div>
        <Link href={`/planner/new?materials=${m.id}`} className="focus-ring glass inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold hover:bg-white/10">
          <CalendarDays className="size-4" aria-hidden="true" /> Create study plan
        </Link>
      </GlassCard>
      {m.ocr_page_count > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <AlertTriangle className="size-3.5" aria-hidden="true" /> {m.ocr_page_count} scanned page{m.ocr_page_count === 1 ? " was" : "s were"} transcribed with AI text recognition and may contain errors.
        </p>
      )}
    </div>
  );
}
