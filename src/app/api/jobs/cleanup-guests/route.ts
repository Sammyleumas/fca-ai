import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { removeUserFiles } from "@/lib/account/files";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/** Daily: deletes guest sessions (anonymous users) that haven't been used for 30 days, files included. */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminClient()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createAdminClient();
  const { data: ids, error } = await admin.rpc("stale_guest_ids", { p_days: 30, p_limit: 100 });
  if (error) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  let deleted = 0;
  let failed = 0;
  for (const id of (ids ?? []) as string[]) {
    const ok = (await removeUserFiles(admin, id)) && !(await admin.auth.admin.deleteUser(id)).error;
    if (ok) deleted++;
    else failed++;
  }
  return NextResponse.json({ deleted, failed });
}
