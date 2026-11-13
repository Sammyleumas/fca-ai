import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Avatar } from "./avatar";

export function TopBar({ name, avatarUrl, unread }: { name: string; avatarUrl: string | null; unread: number }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/70 backdrop-blur-xl md:border-none md:bg-transparent md:backdrop-blur-none">
      <div className="flex h-16 items-center gap-3 px-4 md:h-20 md:px-6 lg:px-8">
        <Link href="/dashboard" className="focus-ring rounded-lg md:hidden" aria-label="FCA-AI dashboard">
          <LogoMark className="h-7" />
        </Link>
        <form action="/search" role="search" className="hidden flex-1 md:block md:max-w-xl">
          <label htmlFor="global-search" className="sr-only">
            Search materials, topics, or ask a question
          </label>
          <div className="glass relative flex h-12 items-center rounded-full">
            <Search className="pointer-events-none absolute left-4 size-[18px] text-fg-2" aria-hidden="true" />
            <input
              id="global-search"
              name="q"
              type="search"
              placeholder="Search for materials, topics, or ask a question…"
              className="h-full w-full rounded-full bg-transparent pl-11 pr-4 text-sm text-fg placeholder:text-muted outline-none focus:ring-2 focus:ring-accent/60"
              maxLength={200}
              autoComplete="off"
            />
          </div>
        </form>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/search"
            className="focus-ring glass flex size-11 items-center justify-center rounded-full text-fg-2 hover:text-fg md:hidden"
            aria-label="Search"
          >
            <Search className="size-5" />
          </Link>
          <Link
            href="/notifications"
            className="focus-ring glass relative flex size-11 items-center justify-center rounded-full text-fg-2 hover:text-fg"
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          >
            <Bell className="size-5" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <Link href="/settings" className="focus-ring rounded-full" aria-label="Your profile and settings">
            <Avatar name={name} url={avatarUrl} size={44} />
          </Link>
        </div>
      </div>
    </header>
  );
}
