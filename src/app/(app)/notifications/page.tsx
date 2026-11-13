import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { GlassCard } from "@/components/ui/glass-card";
import { requireOnboardedUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/types/db";
import { cn } from "@/lib/utils/format";
import { deleteNotification, markAllRead, markRead } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const { user, profile } = await requireOnboardedUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, scheduled_for, read_at")
    .eq("user_id", user.id)
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: false })
    .limit(100);
  if (error) throw new Error("Could not load notifications.");
  const items = (data ?? []) as NotificationRow[];
  const unread = items.filter((n) => !n.read_at).length;
  const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: profile.timezone });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-fg-2">{unread ? `${unread} unread` : "You're all caught up."}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings#notifications" className="focus-ring rounded-full px-4 py-2 text-sm text-fg-2 hover:text-fg">
            Preferences
          </Link>
          {unread > 0 && (
            <form action={markAllRead}>
              <Button type="submit" variant="secondary" size="sm">
                <CheckCheck className="size-4" aria-hidden="true" /> Mark all read
              </Button>
            </form>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <GlassCard>
          <EmptyState icon={<Bell className="size-6" />} title="No notifications yet" description="Reminders, plan changes and achievements will show up here." />
        </GlassCard>
      ) : (
        <ul className="space-y-2.5">
          {items.map((n) => (
            <li key={n.id}>
              <GlassCard as="article" className={cn("flex items-start gap-4 p-4", !n.read_at && "border-accent/30")}>
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", n.read_at ? "bg-white/15" : "bg-accent shadow-[0_0_8px_rgba(255,235,59,0.8)]")} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</h2>
                  {n.body && <p className="mt-0.5 text-sm text-fg-2">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted">
                    <time dateTime={n.scheduled_for}>{fmt.format(new Date(n.scheduled_for))}</time>
                    {!n.read_at && <span className="sr-only"> · unread</span>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!n.read_at && (
                    <form action={markRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="focus-ring flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-white/5 hover:text-fg" aria-label={`Mark "${n.title}" as read`}>
                        <Check className="size-4" />
                      </button>
                    </form>
                  )}
                  <form action={deleteNotification}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="focus-ring flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-white/5 hover:text-error" aria-label={`Delete "${n.title}"`}>
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
