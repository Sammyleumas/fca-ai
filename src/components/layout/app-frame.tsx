import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";
import { SilkBackground } from "@/components/brand/silk-background";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export function AppFrame({
  name,
  avatarUrl,
  plan,
  unread,
  isGuest = false,
  children,
}: {
  name: string;
  avatarUrl: string | null;
  plan: "free" | "premium";
  unread: number;
  isGuest?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh">
      <SilkBackground className="fixed" />
      <Sidebar name={name} avatarUrl={avatarUrl} plan={plan} isGuest={isGuest} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <TopBar name={name} avatarUrl={avatarUrl} unread={unread} />
        <main id="main" className="flex-1 px-4 pb-32 pt-2 md:px-6 md:pb-10 lg:px-8">
          {isGuest && (
            <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-accent-2/40 bg-brand/40 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between" role="status">
              <p className="flex items-center gap-2">
                <UserRound className="size-4 shrink-0 text-accent-2" aria-hidden="true" />
                You&apos;re exploring as a guest. Save your account to keep your work.
              </p>
              <Link href="/account/save" className="focus-ring inline-flex items-center gap-1 self-start rounded font-semibold text-accent hover:underline sm:self-auto">
                Save account <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>
      <BottomNav isGuest={isGuest} />
    </div>
  );
}
