import type { MaterialFileType, MaterialStatus } from "@/types/db";

export type LibraryItem = {
  id: string;
  title: string;
  original_filename: string;
  file_type: MaterialFileType;
  size_bytes: number;
  page_count: number | null;
  pages_are_estimated: boolean;
  status: MaterialStatus;
  status_detail: string | null;
  processing_progress: number;
  processing_error: string | null;
  processing_warning: string | null;
  created_at: string;
  last_opened_at: string | null;
  subject: { id: string; name: string; kind: string } | null;
  folder: { id: string; name: string; kind: string } | null;
  progress: number;
  lastReadAt: string | null;
  plans: { id: string; title: string; status: string }[];
};

export const LIBRARY_FILTERS = ["all", "pdf", "docx", "txt", "recent", "studying", "completed", "processing", "failed"] as const;
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];
export const LIBRARY_SORTS = ["recent", "opened", "title", "progress"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export type LibraryQuery = {
  filter: LibraryFilter;
  subject?: string;
  folder?: string;
  q?: string;
  sort: LibrarySort;
};

const PROCESSING: MaterialStatus[] = ["uploaded", "queued", "extracting", "analysing", "structuring"];
const RECENT_DAYS = 7;

/** An upload the browser never finished (tab closed, network lost). */
export function isStaleUpload(m: Pick<LibraryItem, "status" | "created_at">, now = Date.now()) {
  return m.status === "uploaded" && now - new Date(m.created_at).getTime() > 30 * 60_000;
}

export function isProcessing(status: MaterialStatus) {
  return PROCESSING.includes(status);
}

/** Currently studying = started reading but not finished, or part of an active plan. */
export function isStudying(m: LibraryItem) {
  if (m.status !== "ready" || m.progress >= 100) return false;
  return m.progress > 0 || m.plans.some((p) => p.status === "active");
}

export function matchesFilter(m: LibraryItem, filter: LibraryFilter, now = Date.now()): boolean {
  switch (filter) {
    case "all":
      return true;
    case "pdf":
    case "docx":
    case "txt":
      return m.file_type === filter;
    case "recent":
      return now - new Date(m.created_at).getTime() <= RECENT_DAYS * 86_400_000;
    case "studying":
      return isStudying(m);
    case "completed":
      return m.status === "ready" && m.progress >= 100;
    case "processing":
      return isProcessing(m.status);
    case "failed":
      return m.status === "failed";
  }
}

export function parseLibraryQuery(sp: Record<string, string | string[] | undefined>): LibraryQuery {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filter = (LIBRARY_FILTERS as readonly string[]).includes(one("filter") ?? "") ? (one("filter") as LibraryFilter) : "all";
  const sort = (LIBRARY_SORTS as readonly string[]).includes(one("sort") ?? "") ? (one("sort") as LibrarySort) : "recent";
  const uuid = /^[0-9a-f-]{36}$/i;
  const subject = one("subject");
  const folder = one("folder");
  return {
    filter,
    sort,
    subject: subject && (uuid.test(subject) || subject === "none") ? subject : undefined,
    folder: folder && (uuid.test(folder) || folder === "none") ? folder : undefined,
    q: one("q")?.trim().slice(0, 200) || undefined,
  };
}

export function applyLibraryQuery(items: LibraryItem[], query: LibraryQuery, now = Date.now()): LibraryItem[] {
  const q = query.q?.toLowerCase();
  const out = items.filter(
    (m) =>
      matchesFilter(m, query.filter, now) &&
      (!query.subject || (query.subject === "none" ? !m.subject : m.subject?.id === query.subject)) &&
      (!query.folder || (query.folder === "none" ? !m.folder : m.folder?.id === query.folder)) &&
      (!q || m.title.toLowerCase().includes(q) || m.original_filename.toLowerCase().includes(q)),
  );
  const time = (s: string | null) => (s ? new Date(s).getTime() : 0);
  const sorters: Record<LibrarySort, (a: LibraryItem, b: LibraryItem) => number> = {
    recent: (a, b) => time(b.created_at) - time(a.created_at),
    opened: (a, b) => Math.max(time(b.last_opened_at), time(b.lastReadAt)) - Math.max(time(a.last_opened_at), time(a.lastReadAt)) || time(b.created_at) - time(a.created_at),
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
    progress: (a, b) => b.progress - a.progress || a.title.localeCompare(b.title),
  };
  return out.sort(sorters[query.sort]);
}

export function filterCounts(items: LibraryItem[], now = Date.now()): Record<LibraryFilter, number> {
  return Object.fromEntries(LIBRARY_FILTERS.map((f) => [f, items.filter((m) => matchesFilter(m, f, now)).length])) as Record<
    LibraryFilter,
    number
  >;
}
