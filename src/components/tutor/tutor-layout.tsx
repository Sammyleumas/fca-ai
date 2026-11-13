import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils/format";

export type ConversationSummary = { id: string; title: string; updated_at: string };

export function TutorLayout({
  conversations,
  activeId,
  children,
}: {
  conversations: ConversationSummary[];
  activeId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden lg:block" aria-label="Conversations">
        <Link
          href="/tutor"
          className="focus-ring glass flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold hover:bg-white/10"
        >
          <MessageSquarePlus className="size-4" aria-hidden="true" /> New chat
        </Link>
        <ul className="mt-4 space-y-1">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/tutor/${c.id}`}
                aria-current={c.id === activeId ? "page" : undefined}
                className={cn(
                  "focus-ring block truncate rounded-xl px-3 py-2 text-sm",
                  c.id === activeId ? "bg-white/10 text-fg" : "text-fg-2 hover:bg-white/5 hover:text-fg",
                )}
              >
                {c.title}
              </Link>
            </li>
          ))}
          {conversations.length === 0 && <li className="px-3 text-sm text-muted">No conversations yet.</li>}
        </ul>
      </aside>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">AI Tutor</h1>
          <Link href="/tutor" className="focus-ring glass flex h-10 items-center gap-2 rounded-full px-4 text-sm lg:hidden">
            <MessageSquarePlus className="size-4" aria-hidden="true" /> New
          </Link>
        </div>
        {children}
      </section>
    </div>
  );
}
