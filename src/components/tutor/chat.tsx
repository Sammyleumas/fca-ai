"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Info, Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { FormMessage } from "@/components/ui/feedback";
import { cn } from "@/lib/utils/format";
import { RichText } from "./rich-text";

export type UIMessage = { id: string; role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Explain this topic simply: how does TCP differ from UDP?",
  "Give me an example of database normalisation",
  "Make me 3 practice questions on photosynthesis",
  "How should I plan revision for an exam in 2 weeks?",
];

const ERROR_MARK = /\n*\[\[error:([^\]]*)\]\]\s*$/;

export function TutorChat({
  conversationId: initialId,
  initialMessages,
  initialQuestion,
  name,
}: {
  conversationId?: string;
  initialMessages: UIMessage[];
  initialQuestion?: string;
  name: string;
}) {
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(undefined);
    setBusy(true);
    setInput("");
    const userMsg: UIMessage = { id: crypto.randomUUID(), role: "user", content };
    const replyId = crypto.randomUUID();
    setMessages((m) => [...m, userMsg, { id: replyId, role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: content }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "The AI tutor is unavailable right now.");
      }
      const newId = res.headers.get("X-Conversation-Id");
      if (newId && newId !== conversationId) {
        setConversationId(newId);
        window.history.replaceState(null, "", `/tutor/${newId}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const shown = acc.replace(ERROR_MARK, "");
        setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: shown } : x)));
      }
      const err = acc.match(ERROR_MARK);
      if (err) throw new Error(err[1]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      // Keep the student's message; drop an empty assistant bubble.
      setMessages((m) => m.filter((x) => !(x.id === replyId && !x.content)));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialQuestion && !sentInitial.current && initialMessages.length === 0) {
      sentInitial.current = true;
      void send(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col md:min-h-[calc(100dvh-9rem)]">
      <div className="flex-1 space-y-4 pb-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center px-2 pt-6 text-center">
            <span className="flex size-20 items-center justify-center rounded-3xl border border-accent/30 bg-gradient-to-br from-white/15 to-white/5 text-accent glow-accent">
              <Bot className="size-10" aria-hidden="true" />
            </span>
            <div className="glass mt-6 rounded-2xl px-5 py-4">
              <p className="font-semibold">Hello {name}!</p>
              <p className="text-sm text-fg-2">Ask me anything about your studies.</p>
            </div>
            <ul className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => send(s)}
                    className="focus-ring glass flex w-full items-start gap-2 rounded-2xl p-3 text-left text-sm text-fg-2 hover:text-fg"
                  >
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" /> {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[88%] rounded-3xl px-4 py-3 text-[15px] sm:max-w-[75%]",
                  m.role === "user" ? "rounded-br-lg bg-accent text-[#0b0c0b]" : "glass rounded-bl-lg text-fg/90",
                )}
              >
                {m.role === "assistant" ? (
                  <>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-accent/90">
                      <Sparkles className="size-3" aria-hidden="true" /> AI tutor · general knowledge
                    </p>
                    {m.content ? (
                      <RichText text={m.content} />
                    ) : (
                      <span className="flex items-center gap-2 text-fg-2">
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Thinking…
                      </span>
                    )}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-24 space-y-2 md:bottom-4">
        {error && <FormMessage>{error}</FormMessage>}
        <p className="flex items-center gap-1.5 px-2 text-xs text-muted">
          <Info className="size-3.5" aria-hidden="true" /> AI can make mistakes. Answers here aren&apos;t based on your uploaded materials.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="glass-strong flex items-end gap-2 rounded-[1.6rem] p-1.5 pl-5"
        >
          <label htmlFor="tutor-input" className="sr-only">
            Message the AI tutor
          </label>
          <textarea
            id="tutor-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Type a message…"
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-3 text-[15px] text-fg placeholder:text-muted outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="focus-ring flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-[#0b0c0b] transition hover:bg-[#e2ff63] disabled:opacity-40"
            aria-label="Send"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
