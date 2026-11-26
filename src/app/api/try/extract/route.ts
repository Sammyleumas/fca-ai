import { NextResponse } from "next/server";
import { extract, ExtractionError } from "@/lib/materials/extract";
import { checkFileMeta, sniffFileType, titleFromFilename } from "@/lib/materials/file-types";
import { TRY_LIMITS, takeToken, visitorKey } from "@/lib/try/limits";
import { jsonError } from "@/lib/try/request";

export const maxDuration = 60;

/**
 * "Try it": reads the text of an uploaded PDF, Word or text file. Nothing is stored;
 * the text goes back to the student's browser. No AI is used here.
 */
export async function POST(request: Request) {
  const wait = takeToken(`upload:${visitorKey(request.headers)}`, TRY_LIMITS.uploadsPerHour);
  if (wait) return jsonError("Too many uploads for now. Please try again later or paste your notes instead.", 429, { "Retry-After": String(wait) });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return jsonError("Couldn't read the upload. Please try again.", 400);
  }
  if (!file) return jsonError("Choose a file to upload.", 400);
  const check = checkFileMeta({ name: file.name, size: file.size, type: file.type }, TRY_LIMITS.maxUploadBytes);
  if (!check.ok) return jsonError(check.reason, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileType = sniffFileType(bytes, check.fileType);
  if (!fileType) return jsonError("That file doesn't look like a valid PDF, Word or text document.", 400);
  try {
    const result = await extract(fileType, bytes);
    const full = result.pages.map((p) => p.text.trim()).filter(Boolean).join("\n\n");
    if (full.replace(/\s/g, "").length < 40) {
      return jsonError(
        result.scannedPages.length ? "This looks like a scanned document with no selectable text. Try a text-based PDF, or paste your notes." : "We couldn't find any text in this file.",
        422,
      );
    }
    const truncated = full.length > TRY_LIMITS.maxMaterialChars;
    return NextResponse.json(
      { title: titleFromFilename(file.name), text: truncated ? full.slice(0, TRY_LIMITS.maxMaterialChars) : full, truncated, words: result.wordCount },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ExtractionError) return jsonError(error.message, 422);
    return jsonError("We couldn't read this file. Try another file or paste your notes.", 422);
  }
}
