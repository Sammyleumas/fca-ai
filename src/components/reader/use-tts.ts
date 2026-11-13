"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Splits text into sentence-sized chunks (long utterances get cut off in some browsers). */
export function speechChunks(text: string, max = 220): string[] {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/** Browser text-to-speech (Web Speech API) — runs on the device, nothing is sent anywhere. */
export function useTts() {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [rate, setRate] = useState(1);
  const queue = useRef<string[]>([]);
  const onDone = useRef<(() => void) | null>(null);
  // Detected after mount so server and client render the same markup.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability, only knowable on the client
    setSupported("speechSynthesis" in window);
  }, []);

  const rateRef = useRef(rate);
  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  const speakNext = useCallback(() => {
    const step = () => {
      const next = queue.current.shift();
      if (!next) {
        setState("idle");
        const cb = onDone.current;
        onDone.current = null;
        cb?.();
        return;
      }
      const u = new SpeechSynthesisUtterance(next);
      u.rate = rateRef.current;
      u.onend = step;
      u.onerror = () => setState("idle");
      window.speechSynthesis.speak(u);
    };
    step();
  }, []);

  const play = useCallback(
    (text: string, done?: () => void) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      queue.current = speechChunks(text);
      onDone.current = done ?? null;
      setState("playing");
      speakNext();
    },
    [speakNext, supported],
  );
  const pause = () => {
    window.speechSynthesis.pause();
    setState("paused");
  };
  const resume = () => {
    window.speechSynthesis.resume();
    setState("playing");
  };
  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    queue.current = [];
    onDone.current = null;
    window.speechSynthesis.cancel();
    setState("idle");
  }, []);

  useEffect(() => stop, [stop]);
  return { supported, state, rate, setRate, play, pause, resume, stop };
}
