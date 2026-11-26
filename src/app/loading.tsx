import { LogoMark } from "@/components/brand/logo";

/** Shown while a page is being prepared on the server (between pages). */
export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
      <LogoMark className="h-12 animate-pulse" />
      <span className="text-sm text-fg-2">Loading…</span>
    </div>
  );
}
