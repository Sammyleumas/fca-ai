"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Polls processing status for the given materials and refreshes the page when any
 * of them changes. Backs off while the tab is hidden; stops when nothing is pending.
 */
export function StatusPoller({ ids, intervalMs = 4000 }: { ids: string[]; intervalMs?: number }) {
  const router = useRouter();
  const last = useRef<string>("");
  const key = ids.join(",");

  useEffect(() => {
    if (!key) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/materials/status?ids=${key}`, { cache: "no-store" });
          if (res.ok) {
            const { materials } = (await res.json()) as { materials: { id: string; status: string; processing_progress: number; status_detail: string | null }[] };
            const sig = materials.map((m) => `${m.id}:${m.status}:${m.processing_progress}:${m.status_detail}`).join("|");
            if (last.current && sig !== last.current) router.refresh();
            last.current = sig;
          }
        } catch {
          // Network hiccup: try again next tick.
        }
      }
      timer = setTimeout(tick, document.visibilityState === "visible" ? intervalMs : intervalMs * 4);
    };
    timer = setTimeout(tick, 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [key, intervalMs, router]);

  return null;
}
