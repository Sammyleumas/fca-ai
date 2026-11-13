import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SilkBackground } from "@/components/brand/silk-background";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-bg-2/40 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <SilkBackground variant="hero" />
        <Link href="/" className="relative focus-ring w-fit rounded-xl">
          <Logo withTagline />
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-5xl font-semibold leading-[1.05] tracking-tight">
            Your AI <span className="text-gradient-accent">Study</span> Partner
          </h2>
          <p className="mt-5 text-lg text-fg-2">Upload. Organise. Plan. Read. Practise. Improve.</p>
        </div>
        <p className="relative text-sm text-muted">© {new Date().getFullYear()} MindFlow</p>
      </aside>

      <main id="main" className="relative flex items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
        <SilkBackground className="lg:hidden" variant="page" />
        <div className="relative w-full max-w-md">
          {!isSupabaseConfigured() && <SetupNotice className="mb-6" />}
          {children}
        </div>
      </main>
    </div>
  );
}
