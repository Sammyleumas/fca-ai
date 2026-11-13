"use client";

import { useMemo } from "react";
import { Reader } from "@/components/reader/reader";
import type { ReaderApi } from "@/components/reader/reader-api";
import type { ReaderData } from "@/lib/data/reader";

/** DEVELOPMENT-ONLY: the real Reader wired to an in-memory API (no database, no AI). */
export function DemoReader({ data }: { data: ReaderData }) {
  const api = useMemo<ReaderApi>(() => {
    const id = () => crypto.randomUUID();
    const now = () => new Date().toISOString();
    return {
      async createHighlight(i) {
        return { ok: true, highlight: { id: id(), page_number: i.page, text: i.text, color: i.color, anchor: i.anchor, created_at: now() } };
      },
      async updateHighlightColor() { return { ok: true }; },
      async deleteHighlight() { return { ok: true }; },
      async saveNote(i) {
        return { ok: true, note: { id: i.id ?? id(), page_number: i.page, highlight_id: i.highlightId ?? null, title: null, body: i.body, updated_at: now() } };
      },
      async deleteNote() { return { ok: true }; },
      async toggleBookmark(_m, page) { return { ok: true, bookmark: { id: id(), page_number: page, label: null } }; },
      async saveReadingPrefs() { return { ok: true }; },
      async searchInMaterial(_m, q) {
        const results = (data.pages ?? []).filter((p) => p.content.toLowerCase().includes(q.toLowerCase())).map((p) => ({ page: p.page, snippet: p.content.slice(0, 120) }));
        return { ok: true, results: results.length ? results : [{ page: 2, snippet: `Sample result for “${q}” (demo data)` }] };
      },
      async saveProgress(b) { return { percent: Math.min(100, ((b.currentPage) / (data.material.page_count || 1)) * 100) }; },
      async fileUrl() { return "/dev-preview/sample-pdf"; },
      async explain(body) {
        const text = `**Demo response** (no AI is called in the preview).\n\nAction: ${body.action}. Selected: “${(body.selection ?? "").slice(0, 60)}”.\n\n- Real responses stream from the AI provider.\n- They are always labelled as AI, separate from the document.`;
        return new Response(text);
      },
      async completeTask() { return { ok: true, streak: 3 }; },
    };
  }, [data]);
  return <Reader data={data} api={api} aiEnabled backHref="/dev-preview/dashboard" task={{ id: "t1", title: "Computer Networks", start_page: 2, end_page: 3, status: "pending", session_id: "s1" }} />;
}
