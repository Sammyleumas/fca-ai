"use client";

import Link from "next/link";
import { SignOutForm } from "./sign-out-button";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LayoutGrid, LogOut, X } from "lucide-react";
import { MOBILE_PRIMARY, NAV_ITEMS, isActive } from "./nav-config";
import { cn } from "@/lib/utils/format";

export function BottomNav({ isGuest = false }: { isGuest?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const primary = NAV_ITEMS.filter((i) => MOBILE_PRIMARY.includes(i.href));
  const more = NAV_ITEMS.filter((i) => !MOBILE_PRIMARY.includes(i.href));
  const moreActive = more.some((i) => isActive(pathname, i.href));

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 md:hidden"
      >
        <ul className="glass-strong grid grid-cols-5 rounded-[1.6rem] px-1.5 py-1.5">
          {primary.map(({ href, short, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "focus-ring flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium",
                    active ? "text-accent" : "text-fg-2",
                  )}
                >
                  <Icon className={cn("size-[22px]", active && "drop-shadow-[0_0_8px_rgba(255,235,59,0.7)]")} aria-hidden="true" />
                  {short}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              className={cn(
                "focus-ring flex h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium",
                moreActive ? "text-accent" : "text-fg-2",
              )}
            >
              <LayoutGrid className="size-[22px]" aria-hidden="true" />
              More
            </button>
          </li>
        </ul>
      </nav>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More destinations">
            <motion.button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="glass-strong absolute inset-x-0 bottom-0 rounded-t-[2rem] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
              initial={reduce ? { opacity: 0 } : { y: "100%" }}
              animate={reduce ? { opacity: 1 } : { y: 0 }}
              exit={reduce ? { opacity: 0 } : { y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
            >
              <div className="mb-4 flex items-center justify-between px-2">
                <p className="font-semibold">More</p>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  className="focus-ring flex size-10 items-center justify-center rounded-full text-fg-2 hover:text-fg"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
              </div>
              <ul className="grid grid-cols-3 gap-2.5">
                {more.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive(pathname, href) ? "page" : undefined}
                      className={cn(
                        "focus-ring glass flex h-24 flex-col items-center justify-center gap-2 rounded-2xl px-2 text-center text-xs font-medium",
                        isActive(pathname, href) ? "text-accent" : "text-fg-2",
                      )}
                    >
                      <Icon className="size-6" aria-hidden="true" />
                      {label}
                    </Link>
                  </li>
                ))}
                <li>
                  <SignOutForm
                    guest={isGuest}
                    className="h-full"
                    buttonClassName="focus-ring glass flex h-24 w-full flex-col items-center justify-center gap-2 rounded-2xl text-xs font-medium text-fg-2"
                  >
                    <LogOut className="size-6" aria-hidden="true" />
                    Sign out
                  </SignOutForm>
                </li>
              </ul>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
