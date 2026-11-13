import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function AuthHeader({ title, subtitle, back = "/" }: { title: React.ReactNode; subtitle?: string; back?: string }) {
  return (
    <header className="mb-8">
      <Link
        href={back}
        aria-label="Back"
        className="focus-ring glass mb-8 flex size-11 items-center justify-center rounded-full text-fg-2 hover:text-fg lg:hidden"
      >
        <ArrowLeft className="size-5" />
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-[2rem]">{title}</h1>
      {subtitle && <p className="mt-2 text-fg-2">{subtitle}</p>}
    </header>
  );
}
