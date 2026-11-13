import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countWords } from "./extract/types";
import type { AiSectionRow, JobPatch, MaterialPatch, PageWrite, ProcessingStore } from "./pipeline";
import { computeLeaves, type SectionRow } from "./segmentation";
import type { SectionDraft } from "./structure";

const BUCKET = "materials";
const PAGE_BATCH = 100;

/** ProcessingStore backed by Supabase using the service-role client (trusted worker). */
export class SupabaseProcessingStore implements ProcessingStore {
  constructor(private readonly db: SupabaseClient) {}

  private check(error: { message: string } | null, what: string) {
    if (error) throw new Error(`${what}: ${error.message}`);
  }

  async getMaterial(id: string) {
    const { data, error } = await this.db
      .from("materials")
      .select("id, user_id, title, file_type, storage_path")
      .eq("id", id)
      .maybeSingle();
    this.check(error, "load material");
    return data;
  }

  async download(path: string) {
    const { data, error } = await this.db.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error(`download: ${error?.message ?? "no data"}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  async updateMaterial(id: string, patch: MaterialPatch) {
    const { error } = await this.db.from("materials").update(patch).eq("id", id);
    this.check(error, "update material");
  }

  async replacePages(materialId: string, userId: string, pages: PageWrite[]) {
    // Sections reference pages only by number, so they're cleared alongside.
    this.check((await this.db.from("document_sections").delete().eq("material_id", materialId)).error, "clear sections");
    this.check((await this.db.from("material_pages").delete().eq("material_id", materialId)).error, "clear pages");
    for (let i = 0; i < pages.length; i += PAGE_BATCH) {
      const rows = pages.slice(i, i + PAGE_BATCH).map((p) => ({
        material_id: materialId,
        user_id: userId,
        page_number: p.page,
        content: p.text,
        ocr_used: p.ocr_used,
      }));
      this.check((await this.db.from("material_pages").insert(rows)).error, "insert pages");
    }
  }

  async updatePages(materialId: string, pages: PageWrite[]) {
    for (const p of pages) {
      const { error } = await this.db
        .from("material_pages")
        .update({ content: p.text, ocr_used: p.ocr_used })
        .eq("material_id", materialId)
        .eq("page_number", p.page);
      this.check(error, "update page");
    }
  }

  async pageWordCounts(materialId: string) {
    const counts = new Map<number, number>();
    for (let from = 0; ; from += 500) {
      const { data, error } = await this.db
        .from("material_pages")
        .select("page_number, content")
        .eq("material_id", materialId)
        .order("page_number")
        .range(from, from + 499);
      this.check(error, "read pages");
      for (const row of data ?? []) counts.set(row.page_number, countWords(row.content));
      if (!data || data.length < 500) break;
    }
    return counts;
  }

  async pageCharCounts(materialId: string) {
    const counts = new Map<number, number>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db
        .from("material_pages")
        .select("page_number, char_count")
        .eq("material_id", materialId)
        .order("page_number")
        .range(from, from + 999);
      this.check(error, "read page sizes");
      for (const row of data ?? []) counts.set(row.page_number, row.char_count);
      if (!data || data.length < 1000) break;
    }
    return counts;
  }

  async getPages(materialId: string, from: number, to: number) {
    const { data, error } = await this.db
      .from("material_pages")
      .select("page_number, content")
      .eq("material_id", materialId)
      .gte("page_number", from)
      .lte("page_number", to)
      .order("page_number");
    this.check(error, "read pages");
    return (data ?? []).map((r) => ({ page: r.page_number as number, text: r.content as string }));
  }

  async listLeafSections(materialId: string) {
    const { data, error } = await this.db
      .from("document_sections")
      .select("id, parent_id, level, position, title, start_page, end_page")
      .eq("material_id", materialId)
      .limit(5000);
    this.check(error, "read sections");
    return computeLeaves((data ?? []) as SectionRow[]);
  }

  async deleteAiSections(materialId: string) {
    this.check((await this.db.from("document_sections").delete().eq("material_id", materialId).eq("source", "ai")).error, "clear AI sections");
  }

  async insertAiSections(materialId: string, userId: string, rows: AiSectionRow[]) {
    // Parents (level 1) first, then units.
    const ordered = [...rows].sort((a, b) => a.level - b.level);
    const payload = ordered.map((r) => ({ ...r, material_id: materialId, user_id: userId, source: "ai" }));
    for (let i = 0; i < payload.length; i += PAGE_BATCH) {
      this.check((await this.db.from("document_sections").insert(payload.slice(i, i + PAGE_BATCH))).error, "insert AI sections");
    }
  }

  async replaceSections(materialId: string, userId: string, sections: SectionDraft[]) {
    this.check((await this.db.from("document_sections").delete().eq("material_id", materialId)).error, "clear sections");
    const ids = new Map<string, string>();
    // Parents first so children can reference them.
    for (const level of [1, 2] as const) {
      const rows = sections
        .filter((s) => s.level === level)
        .map((s) => {
          const id = crypto.randomUUID();
          ids.set(s.key, id);
          return {
            id,
            material_id: materialId,
            user_id: userId,
            parent_id: s.parentKey ? (ids.get(s.parentKey) ?? null) : null,
            level: s.level,
            position: s.position,
            title: s.title,
            start_page: s.start_page,
            end_page: s.end_page,
            estimated_minutes: s.estimated_minutes,
          };
        });
      for (let i = 0; i < rows.length; i += PAGE_BATCH) {
        this.check((await this.db.from("document_sections").insert(rows.slice(i, i + PAGE_BATCH))).error, "insert sections");
      }
    }
  }

  async updateJob(id: string, patch: JobPatch) {
    const { error } = await this.db.from("document_processing_jobs").update(patch).eq("id", id);
    this.check(error, "update job");
  }

  async notify(userId: string, n: { kind: "processing"; title: string; body: string; link: string }) {
    await this.db.from("notifications").insert({ user_id: userId, ...n });
  }
}
