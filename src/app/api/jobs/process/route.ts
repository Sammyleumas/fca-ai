import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processPendingJobs, sweepStaleUploads } from "@/lib/materials/worker";

export const maxDuration = 300;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/** Background worker endpoint for Vercel Cron (or any scheduler). Requires CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const swept = await sweepStaleUploads();
  const result = await processPendingJobs({ budgetMs: 270_000, maxJobs: 25 });
  return NextResponse.json({ ...result, staleUploadsRemoved: swept.removed });
}
