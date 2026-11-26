/**
 * "Try it" mode runs without accounts or a database, so it is protected by
 * request-size caps and a per-visitor rate limit. The limiter is in memory (per
 * server instance): a best-effort guard against casual abuse that keeps the AI
 * quota available. For hard limits, add a Vercel Firewall rate-limit rule on
 * /api/try/* (see docs/DEPLOYMENT.md).
 */
export const TRY_LIMITS = {
  /** Characters of study material sent with each AI request. */
  maxMaterialChars: 60_000,
  /** Vercel rejects request bodies over ~4.5 MB, so uploads stay under that. */
  maxUploadBytes: 4 * 1024 * 1024,
  maxMessageChars: 2_000,
  /** Earlier turns sent as conversation history. */
  maxHistoryMessages: 20,
  /** AI requests per visitor per hour (chat + quiz + flashcards). */
  aiPerHour: 30,
  /** File uploads per visitor per hour. */
  uploadsPerHour: 20,
} as const;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Fixed-window limiter. Returns seconds to wait, or 0 when the request is allowed. */
export function takeToken(key: string, limit: number, windowMs = 3_600_000, now = Date.now()): number {
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 0;
  }
  if (b.count >= limit) return Math.max(1, Math.ceil((b.resetAt - now) / 1000));
  b.count++;
  return 0;
}

export function resetTryLimitsForTests() {
  buckets.clear();
}

/** The visitor's IP as reported by the hosting proxy (Vercel sets x-forwarded-for / x-real-ip). */
export function visitorKey(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || "unknown";
}
