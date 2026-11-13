"use client";

/** SHA-256 hex digest of a file (used for duplicate detection). */
export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class UploadAbortedError extends Error {}

/**
 * PUTs a file to a Supabase signed upload URL with progress and cancellation.
 * (fetch() can't report upload progress, so XMLHttpRequest is used.)
 */
export function uploadToSignedUrl(
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (key) xhr.setRequestHeader("apikey", key);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(xhr.status === 413 ? "This file is too large." : "Upload failed. Check your connection and try again."));
    };
    xhr.onerror = () => reject(new Error("Network error — check your connection and try again."));
    xhr.onabort = () => reject(new UploadAbortedError("Upload cancelled."));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}
