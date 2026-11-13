import type { MaterialFileType } from "@/types/db";

/** Accepted upload types. Other formats are rejected until reliable extraction exists. */
export const FILE_TYPES: Record<MaterialFileType, { extensions: string[]; mimes: string[]; label: string }> = {
  pdf: { extensions: ["pdf"], mimes: ["application/pdf"], label: "PDF" },
  docx: {
    extensions: ["docx"],
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    label: "Word (DOCX)",
  },
  txt: { extensions: ["txt", "text", "md"], mimes: ["text/plain", "text/markdown"], label: "Text" },
};

export const CANONICAL_MIME: Record<MaterialFileType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

export const ACCEPT_ATTR = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export type FileMeta = { name: string; size: number; type?: string | null };
export type FileCheck = { ok: true; fileType: MaterialFileType } | { ok: false; reason: string };

/** Final path segment only (defends against "../" and Windows separators in names). */
export function basename(name: string): string {
  return name.split(/[\\/]/).pop() ?? "";
}

export function extensionOf(name: string): string {
  const base = basename(name);
  const i = base.lastIndexOf(".");
  const ext = i > 0 ? base.slice(i + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

/** Validates name / size / declared type. Content is verified again server-side by magic bytes. */
export function checkFileMeta(file: FileMeta, maxBytes: number): FileCheck {
  const ext = extensionOf(file.name);
  const entry = (Object.entries(FILE_TYPES) as [MaterialFileType, (typeof FILE_TYPES)[MaterialFileType]][]).find(([, v]) =>
    v.extensions.includes(ext),
  );
  if (!entry) return { ok: false, reason: "Only PDF, DOCX and TXT files are supported." };
  const [fileType, def] = entry;
  // Browsers sometimes send an empty or generic type; only reject a clearly conflicting one.
  if (file.type && file.type !== "application/octet-stream" && !def.mimes.includes(file.type)) {
    return { ok: false, reason: `This file says it is ${file.type}, which doesn't match .${ext}.` };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, reason: "This file is empty." };
  if (file.size > maxBytes) {
    return { ok: false, reason: `Files on your plan can be up to ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  }
  if (file.name.length > 255) return { ok: false, reason: "The file name is too long." };
  return { ok: true, fileType };
}

/** Storage-safe file name: ASCII letters, digits, dot, dash, underscore. */
export function sanitizeFilename(name: string): string {
  name = basename(name);
  const ext = extensionOf(name);
  const base = (ext ? name.slice(0, -(ext.length + 1)) : name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${base || "document"}${ext ? `.${ext}` : ""}`;
}

/** "intro_to-CS_v2.pdf" -> "Intro to CS v2" */
export function titleFromFilename(name: string): string {
  name = basename(name);
  const ext = extensionOf(name);
  const base = ext ? name.slice(0, -(ext.length + 1)) : name;
  const t = base.replace(/[_]+/g, " ").replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "Untitled document";
  return (t[0].toUpperCase() + t.slice(1)).slice(0, 300);
}

/** Detects the real type from content. Returns null when it doesn't match any supported format. */
export function sniffFileType(bytes: Uint8Array, declared: MaterialFileType): MaterialFileType | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) return declared === "docx" ? "docx" : null; // ZIP container
  if (declared === "txt") {
    const sample = bytes.subarray(0, Math.min(bytes.length, 64 * 1024));
    if (sample.includes(0)) return null;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(sample.length < bytes.length ? trimPartialUtf8(sample) : sample);
      return "txt";
    } catch {
      return null;
    }
  }
  return null;
}

/** Drops a trailing incomplete UTF-8 sequence so a truncated sample still decodes. */
function trimPartialUtf8(b: Uint8Array): Uint8Array {
  let end = b.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const byte = b[end - i];
    if ((byte & 0xc0) === 0x80) continue;
    const need = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    if (need > i) end -= i;
    break;
  }
  return b.subarray(0, end);
}
