import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendReminderEmails } from "@/lib/email/reminders";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/** Hourly reminder generation for all active students (time-zone aware, deduplicated). */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminClient()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const { data, error } = await createAdminClient().rpc("generate_all_notifications");
  if (error) return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  const email = await sendReminderEmails();
  return NextResponse.json({ created: data, email });
}
