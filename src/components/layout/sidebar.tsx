"use client";

import Link from "next/link";
import { SignOutForm } from "./sign-out-button";
import { usePathname } from "next/navigation";
import { ArrowRight, Crown, LogOut } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { Avatar } from "./avatar";
import { NAV_ITEMS, isActive } from "./nav-config";
import { cn } from "@/lib/utils/format";

export function Sidebar({ name, avatarUrl, plan, isGuest = false }: { name: string; avatarUrl: string | null; plan: "free" | "premium"; isGuest?: boolean }) {
  const pathname = usePathname();
  return (
    <aside
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-gradient-to-b from-bg-2/80 to-bg/80 md:flex md:w-[84px] lg:w-[272px]"
      aria-label="Primary"
    >
      <div className="flex h-24 items-center justify-center px-5 lg:justify-start lg:px-6">
        <Link href="/dashboard" className="focus-ring rounded-xl" aria-label="FCA-AI dashboard">
          <span className="lg:hidden">
            <LogoMark className="h-9" />
          </span>
          <span className="hidden lg:block">
            <Logo withTagline />
          </span>
        </Link>
      </div>

      <nav className="scrollbar-none flex-1 overflow-y-auto px-3 lg:px-5">
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  title={label}
                  className={cn(
                    "focus-ring group flex h-12 items-center gap-3.5 rounded-2xl px-3.5 text-[15px] font-medium transition md:justify-center lg:justify-start",
                    active
                      ? "bg-accent text-[#000000] glow-accent"
                      : "text-fg-2 hover:bg-white/5 hover:text-fg",
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="md:sr-only lg:not-sr-only">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-3 p-3 lg:p-5">
        {plan === "free" && !isGuest && (
          <div className="glass hidden rounded-2xl p-4 lg:block">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-warning/15 text-warning">
                <Crown className="size-[18px]" aria-hidden="true" />
              </span>
              <p className="font-semibold">Go Premium</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-fg-2">Unlock higher limits and advanced study tools.</p>
            <Link href="/settings/billing" className={buttonClasses({ size: "sm", className: "mt-3 w-full" })}>
              View plans <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}
        <div className="glass flex items-center gap-3 rounded-2xl p-2.5 md:justify-center lg:justify-start">
          <Link href="/settings" className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-xl md:flex-none lg:flex-1">
            <Avatar name={name} url={avatarUrl} />
            <span className="hidden min-w-0 lg:block">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="block text-xs text-fg-2">{isGuest ? "Guest" : plan === "premium" ? "Premium" : "Student"}</span>
            </span>
          </Link>
          <SignOutForm
            guest={isGuest}
            className="hidden lg:block"
            buttonClassName="focus-ring flex size-9 items-center justify-center rounded-xl text-fg-2 hover:bg-white/5 hover:text-fg"
            label="Sign out"
          >
            <LogOut className="size-[18px]" />
          </SignOutForm>
        </div>
      </div>
    </aside>
  );
}
