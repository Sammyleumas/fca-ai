import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, sendEmail } from "./send";
import { reminderEmail } from "./templates";

const EMAIL_KINDS = ["study_reminder", "upcoming_session", "unfinished_task", "quiz_reminder", "streak", "plan_changed", "achievement", "system"];

/**
 * Emails recent in-app reminders to students who opted in to email. Each
 * notification is processed once (emailed_at marks it as handled either way).
 */
export async function sendReminderEmails(limit = 200): Promise<{ sent: number; skipped: number }> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  // Without the site URL emails would have no working links: leave everything queued.
  if (!emailConfigured() || !site) return { sent: 0, skipped: 0 };
  const admin = createAdminClient();
  const since = new Date(Date.now() - 2 * 3600_000).toISOString();
  const { data: queue } = await admin
    .from("notifications")
    .select("id, user_id, title, body, link")
    .is("emailed_at", null)
    .gte("created_at", since)
    .in("kind", EMAIL_KINDS)
    .order("created_at")
    .limit(limit);
  if (!queue?.length) return { sent: 0, skipped: 0 };
  const userIds = [...new Set(queue.map((n) => n.user_id as string))];
  const { data: profiles } = await admin.from("profiles").select("id, preferred_name, notification_prefs").in("id", userIds);
  const prefs = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  let sent = 0;
  let skipped = 0;
  const emails = new Map<string, string | null>();
  for (const n of queue) {
    // Claim the notification first, so overlapping runs never email it twice.
    const { data: claimed } = await admin
      .from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", n.id)
      .is("emailed_at", null)
      .select("id");
    if (!claimed?.length) continue;
    const p = prefs.get(n.user_id as string);
    const wants = Boolean((p?.notification_prefs as { email?: boolean } | null)?.email);
    if (!wants) {
      skipped++;
      continue;
    }
    try {
      if (!emails.has(n.user_id as string)) {
        const { data } = await admin.auth.admin.getUserById(n.user_id as string);
        emails.set(n.user_id as string, data.user?.email ?? null);
      }
      const to = emails.get(n.user_id as string);
      if (!to) {
        skipped++; // guests and accounts without an email
        continue;
      }
      await sendEmail(to, reminderEmail({ name: (p?.preferred_name as string) || "there", title: n.title as string, body: n.body as string | null, link: n.link as string | null, siteUrl: site }));
      sent++;
    } catch (e) {
      // Release the claim so the next run retries (within the 2-hour window).
      await admin.from("notifications").update({ emailed_at: null }).eq("id", n.id);
      console.error(JSON.stringify({ level: "error", msg: "reminder email failed", error: e instanceof Error ? e.message : String(e) }));
    }
  }
  return { sent, skipped };
}
