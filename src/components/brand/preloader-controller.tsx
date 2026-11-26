"use client";

import { useEffect } from "react";

const MIN_VISIBLE_MS = 900; // long enough to read the brand, short enough not to annoy
const MAX_WAIT_MS = 2500; // never wait longer than this for slow assets

/** Fades the splash out once the page has loaded (and a short minimum has passed). */
export function PreloaderController({ storageKey }: { storageKey: string }) {
  useEffect(() => {
    const el = document.getElementById("fca-preloader");
    if (!el || document.documentElement.classList.contains("fca-skip-preload")) {
      el?.remove();
      return;
    }
    let done = false;
    const timers: number[] = [];
    const hide = () => {
      if (done) return;
      done = true;
      el.classList.add("is-hidden");
      el.setAttribute("aria-hidden", "true");
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {
        /* storage blocked: the splash simply shows again next time */
      }
      timers.push(window.setTimeout(() => el.remove(), 600));
    };
    const elapsed = performance.now();
    const afterMin = () => timers.push(window.setTimeout(hide, Math.max(0, MIN_VISIBLE_MS - elapsed)));
    if (document.readyState === "complete") afterMin();
    else window.addEventListener("load", afterMin, { once: true });
    timers.push(window.setTimeout(hide, MAX_WAIT_MS));
    return () => {
      window.removeEventListener("load", afterMin);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [storageKey]);
  return null;
}
