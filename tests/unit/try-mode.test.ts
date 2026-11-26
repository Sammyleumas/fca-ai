import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDocx, makePdf } from "../fixtures/make";

/*
 * "Try it" mode: works with no account and no database. The AI provider is mocked;
 * file extraction runs for real on generated PDF/DOCX files.
 */
vi.mock("server-only", () => ({}));

const ai = vi.hoisted(() => ({
  configured: true,
  object: null as unknown,
  objectError: null as unknown,
  stream: [] as string[],
  streamError: null as unknown,
  stopReason: "end_turn" as string,
  calls: [] as { method: string; options: Record<string, unknown> }[],
}));

vi.mock("@/lib/ai", async () => {
  const types = await import("@/lib/ai/types");
  return {
    AIError: types.AIError,
    AI_ERROR_STATUS: types.AI_ERROR_STATUS,
    isAIConfigured: () => ai.configured,
    getAIProvider: () => ({
      name: "fake",
      async generateObject(options: Record<string, unknown>) {
        ai.calls.push({ method: "object", options });
        if (ai.objectError) throw ai.objectError;
        return { object: ai.object, usage: { model: "m", inputTokens: 1, outputTokens: 1 } };
      },
      streamText(options: Record<string, unknown>) {
        ai.calls.push({ method: "stream", options });
        let text = "";
        return {
          textStream: (async function* () {
            if (ai.streamError) throw ai.streamError;
            for (const s of ai.stream) {
              text += s;
              yield s;
            }
          })(),
          final: async () => ({ text, usage: { model: "m", inputTokens: 1, outputTokens: 1 }, stopReason: ai.stopReason }),
        };
      },
    }),
  };
});

const { AIError } = await import("@/lib/ai/types");
const { takeToken, resetTryLimitsForTests, visitorKey, TRY_LIMITS } = await import("@/lib/try/limits");
const { cleanQuiz } = await import("@/lib/try/prompts");
const chat = await import("@/app/api/try/chat/route");
const quiz = await import("@/app/api/try/quiz/route");
const flashcards = await import("@/app/api/try/flashcards/route");
const extractRoute = await import("@/app/api/try/extract/route");

const MATERIAL = {
  title: "Networks",
  text: "A computer network connects devices so they can share data. TCP provides reliable, ordered delivery. UDP is faster but unreliable.",
};
let ip = 0;
function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/try", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ip}`, ...headers },
  });
}

beforeEach(() => {
  resetTryLimitsForTests();
  Object.assign(ai, { configured: true, object: null, objectError: null, stream: [], streamError: null, stopReason: "end_turn", calls: [] });
});

describe("try-mode limits", () => {
  it("allows up to the limit per visitor and window, then asks them to wait", () => {
    for (let i = 0; i < 3; i++) expect(takeToken("v1", 3, 60_000, 1_000)).toBe(0);
    expect(takeToken("v1", 3, 60_000, 2_000)).toBe(59);
    expect(takeToken("v2", 3, 60_000, 2_000)).toBe(0); // other visitors unaffected
    expect(takeToken("v1", 3, 60_000, 61_001)).toBe(0); // new window
  });
  it("identifies visitors by the first forwarded IP", () => {
    expect(visitorKey(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(visitorKey(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
  });
  it("drops malformed quiz questions", () => {
    const q = (o: Partial<{ type: "mcq" | "true_false"; prompt: string; options: string[]; answer: number; explanation: string }>) => ({
      type: "mcq" as const, prompt: "Q", options: ["a", "b", "c", "d"], answer: 1, explanation: "E", ...o,
    });
    const cleaned = cleanQuiz({ questions: [q({}), q({ options: ["a", "b"] }), q({ answer: 7 }), q({ type: "true_false", options: ["x"], answer: 1 }), q({ type: "true_false", answer: 2 }), q({ prompt: " " })] }, 10);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[1]).toMatchObject({ type: "true_false", options: [] });
  });
});

describe("POST /api/try/chat (no account, no database)", () => {
  it("streams the tutor's answer grounded in the student's material", async () => {
    ai.stream = ["TCP is ", "reliable."];
    const res = await chat.POST(post({ material: MATERIAL, messages: [{ role: "user", content: "What is TCP?" }] }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("TCP is reliable.");
    const opts = ai.calls[0].options as { system: string; messages: unknown[] };
    expect(opts.system).toContain("<material");
    expect(opts.system).toContain("TCP provides reliable");
    expect(opts.system).toMatch(/untrusted/);
    expect(opts.messages).toEqual([{ role: "user", content: "What is TCP?" }]);
  });

  it("keeps conversation history and reports AI failures in-stream", async () => {
    ai.streamError = new AIError("quota_exceeded", "Today's AI allowance has been used up. Please try again tomorrow.");
    const res = await chat.POST(
      post({ material: MATERIAL, messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello!" }, { role: "user", content: "Explain UDP" }] }),
    );
    expect(await res.text()).toContain("[[error:Today's AI allowance has been used up");
    expect((ai.calls[0].options as { messages: unknown[] }).messages).toHaveLength(3);
  });

  it("rejects bad requests, missing AI configuration and visitors over the limit", async () => {
    expect((await chat.POST(post({ material: { title: "x", text: "too short" }, messages: [{ role: "user", content: "q" }] }))).status).toBe(400);
    expect((await chat.POST(post({ material: MATERIAL, messages: [{ role: "assistant", content: "hi" }] }))).status).toBe(400);
    ai.configured = false;
    const off = await chat.POST(post({ material: MATERIAL, messages: [{ role: "user", content: "q" }] }));
    expect(off.status).toBe(503);
    ai.configured = true;
    for (let i = 0; i < TRY_LIMITS.aiPerHour; i++) await chat.POST(post({ material: MATERIAL, messages: [{ role: "user", content: "q" }] }, { "x-forwarded-for": "9.9.9.9" }));
    const limited = await chat.POST(post({ material: MATERIAL, messages: [{ role: "user", content: "q" }] }, { "x-forwarded-for": "9.9.9.9" }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("POST /api/try/quiz and /api/try/flashcards", () => {
  it("returns validated questions and cards", async () => {
    ai.object = {
      questions: [
        { type: "mcq", prompt: "Which protocol is reliable?", options: ["UDP", "TCP", "IP", "HTTP"], answer: 1, explanation: "The notes say TCP is reliable." },
        { type: "true_false", prompt: "UDP is unreliable.", options: [], answer: 1, explanation: "Stated in the notes." },
        { type: "mcq", prompt: "Broken", options: ["a"], answer: 0, explanation: "x" },
      ],
    };
    const q = await quiz.POST(post({ material: MATERIAL, count: 5 }));
    expect(q.status).toBe(200);
    expect(((await q.json()) as { questions: unknown[] }).questions).toHaveLength(2);

    ai.object = { cards: [{ front: "TCP", back: "Reliable, ordered delivery" }, { front: " ", back: "x" }] };
    const f = await flashcards.POST(post({ material: MATERIAL, count: 5 }));
    expect(((await f.json()) as { cards: unknown[] }).cards).toEqual([{ front: "TCP", back: "Reliable, ordered delivery" }]);
  });

  it("maps AI errors to the right status and message", async () => {
    ai.objectError = new AIError("rate_limited", "The AI service is busy. Please try again in a minute.");
    const res = await quiz.POST(post({ material: MATERIAL }));
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toMatch(/busy/);
    ai.objectError = null;
    ai.object = { questions: [] };
    expect((await quiz.POST(post({ material: MATERIAL }))).status).toBe(422);
  });
});

describe("POST /api/try/extract (real PDF/DOCX reading, nothing stored)", () => {
  function upload(bytes: Uint8Array, name: string, type: string) {
    const form = new FormData();
    form.append("file", new File([bytes as BlobPart], name, { type }));
    return new Request("http://localhost/api/try/extract", { method: "POST", body: form, headers: { "x-forwarded-for": `10.1.0.${++ip}` } });
  }

  it("reads text from PDF and Word files", async () => {
    const pdf = await extractRoute.POST(upload(await makePdf({ pages: 2 }), "Intro to CS.pdf", "application/pdf"));
    const pdfBody = (await pdf.json()) as { title: string; text: string; words: number };
    expect(pdf.status).toBe(200);
    expect(pdfBody.title).toBe("Intro to CS");
    expect(pdfBody.text).toMatch(/Computer science/);

    const docx = await extractRoute.POST(upload(await makeDocx([{ heading: "Chapter 1", paragraphs: 2 }]), "notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    expect(docx.status).toBe(200);
    expect(((await docx.json()) as { text: string }).text).toMatch(/Chapter 1/);
  });

  it("rejects fake, scanned and unsupported files with clear messages", async () => {
    const fake = await extractRoute.POST(upload(new TextEncoder().encode("not a pdf at all"), "x.pdf", "application/pdf"));
    expect(fake.status).toBe(400);
    const scanned = await extractRoute.POST(upload(await makePdf({ pages: 2, blankPages: [1, 2] }), "scan.pdf", "application/pdf"));
    expect(scanned.status).toBe(422);
    expect(((await scanned.json()) as { error: string }).error).toMatch(/scanned/);
    const exe = await extractRoute.POST(upload(new Uint8Array([77, 90]), "virus.exe", "application/octet-stream"));
    expect(exe.status).toBe(400);
  });
});
