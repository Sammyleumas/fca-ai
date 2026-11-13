import { SilkBackground } from "@/components/brand/silk-background";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export function AppFrame({
  name,
  avatarUrl,
  plan,
  unread,
  children,
}: {
  name: string;
  avatarUrl: string | null;
  plan: "free" | "premium";
  unread: number;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh">
      <SilkBackground className="fixed" />
      <Sidebar name={name} avatarUrl={avatarUrl} plan={plan} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <TopBar name={name} avatarUrl={avatarUrl} unread={unread} />
        <main id="main" className="flex-1 px-4 pb-32 pt-2 md:px-6 md:pb-10 lg:px-8">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
