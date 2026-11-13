"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { limitsFor } from "@/lib/billing/plans";
import { getShellData } from "@/lib/data/shell";
import { CANONICAL_MIME, checkFileMeta, sanitizeFilename, titleFromFilename } from "@/lib/materials/file-types";
import { processPendingJobs } from "@/lib/materials/worker";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "materials";
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const uuid = z.uuid();
const optionalUuid = z.uuid().nullable().optional();

function revalidateLibrary() {
  revalidatePath("/library");
  revalidatePath("/dashboard");
}

function kickProcessing(userId: string) {
  after(() => processPendingJobs({ userId, budgetMs: 50_000 }).catch(() => undefined));
}

async function ownedMaterial(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("materials")
    .select("id, user_id, title, status, storage_path, file_type, original_filename")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/* ------------------------------------------------------------------ uploads */

const prepareSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  type: z.string().max(200).optional().default(""),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  subjectId: optionalUuid,
  folderId: optionalUuid,
  allowDuplicate: z.boolean().optional(),
  replaceMaterialId: optionalUuid,
});

export type PrepareUploadResult = Result<
  | { kind: "upload"; materialId: string; path: string; signedUrl: string }
  | { kind: "duplicate"; existing: { id: string; title: string } }
>;

/**
 * Validates a file the student wants to upload, enforces plan limits, detects
 * duplicates, creates the material row and returns a short-lived signed upload URL.
 * The browser then uploads the bytes straight to private storage.
 */
export async function prepareUpload(input: z.input<typeof prepareSchema>): Promise<PrepareUploadResult> {
  const user = await requireUser();
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "This upload request is invalid." };
  const { name, size, type, checksum, subjectId, folderId, allowDuplicate, replaceMaterialId } = parsed.data;

  if (!hasAdminClient()) return { ok: false, error: "Uploads aren't configured on this server yet." };
  const { plan } = await getShellData(user.id);
  const limits = limitsFor(plan);
  const check = checkFileMeta({ name, size, type }, limits.maxUploadBytes);
  if (!check.ok) return { ok: false, error: check.reason };

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("check_rate_limit", { p_key: "upload", p_limit: 60, p_window_seconds: 3600 });
  if (allowed === false) return { ok: false, error: "You've uploaded a lot in the last hour. Please try again later." };

  const safeName = sanitizeFilename(name);
  const objectName = `${crypto.randomUUID().slice(0, 8)}-${safeName}`;

  if (replaceMaterialId) {
    const existing = await ownedMaterial(replaceMaterialId);
    if (!existing) return { ok: false, error: "Material not found." };
    if (!["ready", "failed"].includes(existing.status)) {
      return { ok: false, error: "Wait until this material has finished processing before replacing it." };
    }
    const path = `${user.id}/${existing.id}/${objectName}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: "Could not start the upload. Please try again." };
    return { ok: true, kind: "upload", materialId: existing.id, path, signedUrl: data.signedUrl };
  }

  const { count } = await supabase.from("materials").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= limits.maxMaterials) {
    return { ok: false, error: `The ${limits.label} plan includes up to ${limits.maxMaterials} materials. Delete some to upload more.` };
  }

  if (!allowDuplicate) {
    const { data: dup } = await supabase
      .from("materials")
      .select("id, title")
      .eq("user_id", user.id)
      .eq("checksum_sha256", checksum)
      .limit(1)
      .maybeSingle();
    if (dup) return { ok: true, kind: "duplicate", existing: dup };
  }

  const materialId = crypto.randomUUID();
  const path = `${user.id}/${materialId}/${objectName}`;
  const { error: insertError } = await supabase.from("materials").insert({
    id: materialId,
    user_id: user.id,
    subject_id: subjectId ?? null,
    folder_id: folderId ?? null,
    title: titleFromFilename(name),
    original_filename: name.slice(0, 300),
    file_type: check.fileType,
    mime_type: CANONICAL_MIME[check.fileType],
    size_bytes: size,
    storage_path: path,
    checksum_sha256: checksum,
    status: "uploaded",
    status_detail: "Uploading…",
  });
  if (insertError) return { ok: false, error: "Could not create this material. Please try again." };

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    await supabase.from("materials").delete().eq("id", materialId);
    return { ok: false, error: "Could not start the upload. Please try again." };
  }
  return { ok: true, kind: "upload", materialId, path, signedUrl: data.signedUrl };
}

const finalizeSchema = z.object({
  materialId: uuid,
  path: z.string().min(1).max(500),
  replace: z.boolean().optional(),
  name: z.string().min(1).max(255).optional(),
  size: z.number().int().positive().optional(),
  checksum: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});

/** Confirms the uploaded object exists, then queues processing. */
export async function finalizeUpload(input: z.input<typeof finalizeSchema>): Promise<Result> {
  const user = await requireUser();
  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { materialId, path, replace, name, size, checksum } = parsed.data;
  const prefix = `${user.id}/${materialId}/`;
  if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) return { ok: false, error: "Invalid upload path." };

  const material = await ownedMaterial(materialId);
  if (!material) return { ok: false, error: "Material not found." };
  const admin = createAdminClient();

  const objectName = path.slice(prefix.length);
  const { data: listing } = await admin.storage.from(BUCKET).list(`${user.id}/${materialId}`, { search: objectName, limit: 5 });
  const object = listing?.find((o) => o.name === objectName);
  if (!object) return { ok: false, error: "The upload didn't complete. Please try again." };

  const { plan } = await getShellData(user.id);
  const storedSize = Number((object.metadata as { size?: number } | null)?.size ?? 0);
  if (storedSize > limitsFor(plan).maxUploadBytes) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "This file is larger than your plan allows." };
  }

  // Cancel any active job before (re)queueing.
  await admin
    .from("document_processing_jobs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("material_id", materialId)
    .in("status", ["queued", "running"]);

  if (replace) {
    if (!name || !size || !checksum) return { ok: false, error: "Invalid request." };
    const check = checkFileMeta({ name, size }, limitsFor(plan).maxUploadBytes);
    if (!check.ok) return { ok: false, error: check.reason };
    const oldPath = material.storage_path;
    const { error } = await admin
      .from("materials")
      .update({
        storage_path: path,
        original_filename: name.slice(0, 300),
        file_type: check.fileType,
        mime_type: CANONICAL_MIME[check.fileType],
        size_bytes: storedSize || size,
        checksum_sha256: checksum,
        page_count: null,
        word_count: null,
        processing_error: null,
        processing_warning: null,
        status: "queued",
        status_detail: "Waiting to be processed…",
        processing_progress: 0,
      })
      .eq("id", materialId);
    if (error) return { ok: false, error: "Could not replace the file." };
    if (oldPath && oldPath !== path) await admin.storage.from(BUCKET).remove([oldPath]);
  } else {
    if (material.storage_path !== path) return { ok: false, error: "Invalid upload path." };
    await admin
      .from("materials")
      .update({ status: "queued", status_detail: "Waiting to be processed…", processing_progress: 0, size_bytes: storedSize || undefined })
      .eq("id", materialId);
  }

  const { error: jobError } = await admin
    .from("document_processing_jobs")
    .insert({ material_id: materialId, user_id: user.id, status: "queued", stage: "queued" });
  if (jobError) return { ok: false, error: "Could not queue processing. Use Retry on the material." };

  if (!replace) {
    const supabase = await createClient();
    await supabase.rpc("record_study_activity", { p_kind: "material_uploaded", p_reference_id: materialId });
  }
  kickProcessing(user.id);
  revalidateLibrary();
  return { ok: true };
}

/** Removes a material whose upload was cancelled or failed before finalising. */
export async function cancelUpload(materialId: string, replacePath?: string): Promise<Result> {
  const user = await requireUser();
  if (!uuid.safeParse(materialId).success) return { ok: false, error: "Invalid request." };
  const material = await ownedMaterial(materialId);
  if (!material) return { ok: true };
  const supabase = await createClient();
  if (replacePath) {
    if (replacePath.startsWith(`${user.id}/${materialId}/`) && replacePath !== material.storage_path) {
      await supabase.storage.from(BUCKET).remove([replacePath]);
    }
    return { ok: true };
  }
  if (material.status !== "uploaded") return { ok: false, error: "This upload has already finished." };
  await supabase.storage.from(BUCKET).remove([material.storage_path]);
  await supabase.from("materials").delete().eq("id", materialId);
  revalidateLibrary();
  return { ok: true };
}

export async function retryProcessing(materialId: string): Promise<Result> {
  const user = await requireUser();
  if (!uuid.safeParse(materialId).success) return { ok: false, error: "Invalid request." };
  const material = await ownedMaterial(materialId);
  if (!material) return { ok: false, error: "Material not found." };
  if (material.status !== "failed") return { ok: false, error: "Only failed materials can be retried." };
  const admin = createAdminClient();
  await admin
    .from("materials")
    .update({ status: "queued", status_detail: "Waiting to be processed…", processing_error: null, processing_progress: 0 })
    .eq("id", materialId);
  const { error } = await admin
    .from("document_processing_jobs")
    .insert({ material_id: materialId, user_id: user.id, status: "queued", stage: "queued" });
  if (error) return { ok: false, error: "Processing is already queued for this material." };
  kickProcessing(user.id);
  revalidateLibrary();
  return { ok: true };
}

/** Re-runs AI analysis (learning units) for a ready material, e.g. one processed before AI was enabled. */
export async function analyseMaterial(materialId: string): Promise<Result> {
  const user = await requireUser();
  if (!uuid.safeParse(materialId).success) return { ok: false, error: "Invalid request." };
  const material = await ownedMaterial(materialId);
  if (!material) return { ok: false, error: "Material not found." };
  if (material.status !== "ready") return { ok: false, error: "Wait until this material is ready." };
  const { isAIConfigured } = await import("@/lib/ai");
  if (!isAIConfigured()) return { ok: false, error: "AI analysis isn't configured on this server yet." };
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("check_rate_limit", { p_key: "analyse", p_limit: 10, p_window_seconds: 3600 });
  if (allowed === false) return { ok: false, error: "Please wait a while before analysing again." };
  const admin = createAdminClient();
  const { error } = await admin.from("document_processing_jobs").insert({
    material_id: materialId,
    user_id: user.id,
    status: "queued",
    stage: "analysing",
    state: { step: "analyse" },
  });
  if (error) return { ok: false, error: "This material is already being processed." };
  await admin
    .from("materials")
    .update({ status: "analysing", status_detail: "Analysing topics and learning units…", processing_progress: 60 })
    .eq("id", materialId);
  kickProcessing(user.id);
  revalidateLibrary();
  revalidatePath(`/library/${materialId}`);
  return { ok: true };
}

/* --------------------------------------------------------- organise / delete */

export async function deleteMaterials(ids: string[]): Promise<Result<{ deleted: number }>> {
  const user = await requireUser();
  const parsed = z.array(uuid).min(1).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { data: owned } = await supabase.from("materials").select("id").in("id", parsed.data);
  const ownedIds = (owned ?? []).map((m) => m.id as string);
  if (!ownedIds.length) return { ok: true, deleted: 0 };

  // Remove every object under each material's folder (current file and any leftovers).
  for (const id of ownedIds) {
    const { data: files } = await supabase.storage.from(BUCKET).list(`${user.id}/${id}`, { limit: 100 });
    if (files?.length) {
      const { error } = await supabase.storage.from(BUCKET).remove(files.map((f) => `${user.id}/${id}/${f.name}`));
      if (error) return { ok: false, error: "Could not delete the stored files. Nothing was removed." };
    }
  }
  const { error } = await supabase.from("materials").delete().in("id", ownedIds);
  if (error) return { ok: false, error: "Could not delete these materials." };
  revalidateLibrary();
  return { ok: true, deleted: ownedIds.length };
}

const updateSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1, "Give this material a title.").max(300).optional(),
  subjectId: optionalUuid,
  folderId: optionalUuid,
});

export async function updateMaterial(input: z.input<typeof updateSchema>): Promise<Result> {
  await requireUser();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { id, title, subjectId, folderId } = parsed.data;
  const patch: Record<string, unknown> = {};
  if (title !== undefined) patch.title = title;
  if (subjectId !== undefined) patch.subject_id = subjectId;
  if (folderId !== undefined) patch.folder_id = folderId;
  const supabase = await createClient();
  const { error, count } = await supabase.from("materials").update(patch, { count: "exact" }).eq("id", id);
  if (error || !count) return { ok: false, error: "Could not update this material." };
  revalidateLibrary();
  revalidatePath(`/library/${id}`);
  return { ok: true };
}

export async function moveMaterials(input: { ids: string[]; subjectId?: string | null; folderId?: string | null }): Promise<Result> {
  await requireUser();
  const parsed = z
    .object({ ids: z.array(uuid).min(1).max(200), subjectId: optionalUuid, folderId: optionalUuid })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const patch: Record<string, unknown> = {};
  if (parsed.data.subjectId !== undefined) patch.subject_id = parsed.data.subjectId;
  if (parsed.data.folderId !== undefined) patch.folder_id = parsed.data.folderId;
  if (!Object.keys(patch).length) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.from("materials").update(patch).in("id", parsed.data.ids);
  if (error) return { ok: false, error: "Could not move these materials." };
  revalidateLibrary();
  return { ok: true };
}

const subjectSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  kind: z.enum(["subject", "course", "examination"]),
  examDate: z.iso.date().nullable().optional(),
});

export async function createSubject(input: z.input<typeof subjectSchema>): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  const parsed = subjectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subjects")
    .insert({ user_id: user.id, name: parsed.data.name, kind: parsed.data.kind, exam_date: parsed.data.examDate ?? null })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.code === "23505" ? "You already have one with that name." : "Could not save." };
  revalidateLibrary();
  return { ok: true, id: data.id as string };
}

export async function renameSubject(id: string, name: string): Promise<Result> {
  await requireUser();
  const p = z.object({ id: uuid, name: z.string().trim().min(1).max(120) }).safeParse({ id, name });
  if (!p.success) return { ok: false, error: "Enter a valid name." };
  const supabase = await createClient();
  const { error } = await supabase.from("subjects").update({ name: p.data.name }).eq("id", p.data.id);
  if (error) return { ok: false, error: error.code === "23505" ? "That name is already used." : "Could not rename." };
  revalidateLibrary();
  return { ok: true };
}

export async function deleteSubject(id: string): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  // Materials keep existing; their subject is cleared by the FK (on delete set null).
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not delete." };
  revalidateLibrary();
  return { ok: true };
}

const folderSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  kind: z.enum(["folder", "collection"]),
});

export async function createFolder(input: z.input<typeof folderSchema>): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  const parsed = folderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folders")
    .insert({ user_id: user.id, name: parsed.data.name, kind: parsed.data.kind })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Could not save." };
  revalidateLibrary();
  return { ok: true, id: data.id as string };
}

export async function renameFolder(id: string, name: string): Promise<Result> {
  await requireUser();
  const p = z.object({ id: uuid, name: z.string().trim().min(1).max(120) }).safeParse({ id, name });
  if (!p.success) return { ok: false, error: "Enter a valid name." };
  const supabase = await createClient();
  const { error } = await supabase.from("folders").update({ name: p.data.name }).eq("id", p.data.id);
  if (error) return { ok: false, error: "Could not rename." };
  revalidateLibrary();
  return { ok: true };
}

export async function deleteFolder(id: string): Promise<Result> {
  await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not delete." };
  revalidateLibrary();
  return { ok: true };
}
