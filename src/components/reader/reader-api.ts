"use client";

import {
  createHighlight,
  deleteHighlight,
  deleteNote,
  saveNote,
  saveReadingPrefs,
  searchInMaterial,
  toggleBookmark,
  updateHighlightColor,
} from "@/app/(app)/reader/actions";
import { setTaskDone } from "@/app/(app)/planner/actions";
import type { ReaderBookmark, ReaderHighlight, ReaderNote, ReadingPrefs } from "@/lib/data/reader";
import type { HighlightAnchor, HighlightColor } from "@/lib/reader/anchors";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export type ProgressBody = { materialId: string; currentPage: number; scrollOffset: number; pagesRead: number[]; seconds: number };

/** Everything the Reader persists. Swappable so the UI can be exercised without a backend. */
export type ReaderApi = {
  createHighlight(i: { materialId: string; page: number; text: string; color: HighlightColor; anchor: HighlightAnchor }): Promise<R<{ highlight: ReaderHighlight }>>;
  updateHighlightColor(id: string, c: HighlightColor): Promise<R>;
  deleteHighlight(id: string): Promise<R>;
  saveNote(i: { id?: string; materialId: string; page: number | null; highlightId?: string | null; body: string }): Promise<R<{ note: ReaderNote }>>;
  deleteNote(id: string): Promise<R>;
  toggleBookmark(materialId: string, page: number): Promise<R<{ bookmark: ReaderBookmark | null }>>;
  saveReadingPrefs(p: ReadingPrefs): Promise<R>;
  searchInMaterial(materialId: string, q: string): Promise<R<{ results: { page: number; snippet: string }[] }>>;
  saveProgress(body: ProgressBody, beacon?: boolean): Promise<{ percent: number } | null>;
  fileUrl(materialId: string): Promise<string>;
  explain(body: { materialId: string; page: number; action: string; selection?: string; question?: string }, signal: AbortSignal): Promise<Response>;
  completeTask(taskId: string): Promise<R<{ streak?: number }>>;
};

export const serverReaderApi: ReaderApi = {
  createHighlight,
  updateHighlightColor,
  deleteHighlight,
  saveNote,
  deleteNote,
  toggleBookmark,
  saveReadingPrefs,
  searchInMaterial,
  async saveProgress(body, beacon) {
    const json = JSON.stringify(body);
    if (beacon && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/reader/progress", new Blob([json], { type: "text/plain" }));
      return null;
    }
    const res = await fetch("/api/reader/progress", { method: "POST", body: json, headers: { "Content-Type": "application/json" }, keepalive: true });
    if (!res.ok) throw new Error("save failed");
    const data = (await res.json()) as { percent: number };
    return { percent: Number(data.percent) };
  },
  async fileUrl(materialId) {
    const res = await fetch(`/api/materials/${materialId}/url`, { cache: "no-store" });
    if (!res.ok) throw new Error("unavailable");
    return ((await res.json()) as { url: string }).url;
  },
  explain(body, signal) {
    return fetch("/api/ai/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  },
  completeTask: (id) => setTaskDone(id, true),
};
