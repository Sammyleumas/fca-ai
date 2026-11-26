import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const { ApiError, FinishReason, ThinkingLevel } = await import("@google/genai");
const { GeminiProvider, mapGeminiError, stopReasonOf, thinkingConfigFor, toGeminiContents, toGeminiJsonSchema } = await import(
  "@/lib/ai/providers/gemini"
);
const { AIError, AI_ERROR_STATUS } = await import("@/lib/ai/types");

type Chunk = { text?: string; candidates?: { finishReason?: string }[]; usageMetadata?: Record<string, number>; modelVersion?: string; promptFeedback?: { blockReason?: string } };

/** A fake @google/genai client recording calls. */
function fakeClient(opts: { stream?: Chunk[]; streamError?: unknown; response?: Chunk & { text?: string }; error?: unknown }) {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const client = {
    models: {
      async generateContentStream(params: Record<string, unknown>) {
        calls.push({ method: "stream", params });
        if (opts.streamError) throw opts.streamError;
        return (async function* () {
          for (const c of opts.stream ?? []) yield c;
        })();
      },
      async generateContent(params: Record<string, unknown>) {
        calls.push({ method: "generate", params });
        if (opts.error) throw opts.error;
        return opts.response;
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural fake of GoogleGenAI
  return { client: client as any, calls };
}

const usage = { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 10 };

describe("Gemini provider — chat streaming", () => {
  it("streams text deltas, maps history roles and system instructions, and reports usage", async () => {
    const { client, calls } = fakeClient({
      stream: [{ text: "Hello" }, { text: ", Ada!" }, { text: "", candidates: [{ finishReason: FinishReason.STOP }], usageMetadata: usage, modelVersion: "gemini-3.8-flash-001" }],
    });
    const p = new GeminiProvider("test-key", "gemini-3.8-flash", client);
    const s = p.streamText({
      system: "You are FCA-AI's tutor.",
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
        { role: "user", content: "Explain TCP" },
      ],
      maxTokens: 4000,
      effort: "medium",
    });
    const parts: string[] = [];
    for await (const d of s.textStream) parts.push(d);
    expect(parts).toEqual(["Hello", ", Ada!"]);
    const final = await s.final();
    expect(final).toEqual({ text: "Hello, Ada!", stopReason: "end_turn", usage: { model: "gemini-3.8-flash-001", inputTokens: 120, outputTokens: 40 } });

    const params = calls[0].params as { model: string; contents: unknown; config: Record<string, unknown> };
    expect(params.model).toBe("gemini-3.8-flash");
    expect(params.contents).toEqual([
      { role: "user", parts: [{ text: "Hi" }] },
      { role: "model", parts: [{ text: "Hello!" }] },
      { role: "user", parts: [{ text: "Explain TCP" }] },
    ]);
    expect(params.config.systemInstruction).toBe("You are FCA-AI's tutor.");
    expect(params.config.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.MEDIUM });
    expect(params.config.maxOutputTokens).toBeGreaterThan(4000); // answer budget + thinking headroom
  });

  it("final() works even if the stream was never read", async () => {
    const { client } = fakeClient({ stream: [{ text: "Answer", candidates: [{ finishReason: FinishReason.STOP }] }] });
    const s = new GeminiProvider("k", "gemini-3.8-flash", client).streamText({ system: "s", messages: [{ role: "user", content: "q" }] });
    expect((await s.final()).text).toBe("Answer");
  });

  it("reports a blocked/safety stop as a refusal (the chat route shows a polite message)", async () => {
    const { client } = fakeClient({ stream: [{ promptFeedback: { blockReason: "SAFETY" } }] });
    const s = new GeminiProvider("k", "gemini-3.8-flash", client).streamText({ system: "s", messages: [{ role: "user", content: "q" }] });
    for await (const _ of s.textStream) void _;
    expect((await s.final()).stopReason).toBe("refusal");
  });

  it("turns an empty answer into a clear error instead of saving nothing", async () => {
    const { client } = fakeClient({ stream: [{ text: "", candidates: [{ finishReason: FinishReason.STOP }] }] });
    const s = new GeminiProvider("k", "gemini-3.8-flash", client).streamText({ system: "s", messages: [{ role: "user", content: "q" }] });
    for await (const _ of s.textStream) void _;
    await expect(s.final()).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("maps errors thrown while streaming (e.g. 429) to friendly AIErrors", async () => {
    const { client } = fakeClient({ streamError: new ApiError({ status: 429, message: "Resource has been exhausted (e.g. check quota)." }) });
    const s = new GeminiProvider("k", "gemini-3.8-flash", client).streamText({ system: "s", messages: [{ role: "user", content: "q" }] });
    const read = async () => {
      for await (const _ of s.textStream) void _;
    };
    await expect(read()).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("Gemini provider — structured output", () => {
  const schema = z.object({ cards: z.array(z.object({ front: z.string(), back: z.string(), source_page: z.number().int() })) });

  it("requests JSON with a Gemini-compatible schema and validates the result", async () => {
    const json = JSON.stringify({ cards: [{ front: "TCP", back: "Reliable transport", source_page: 3 }] });
    const { client, calls } = fakeClient({ response: { text: json, candidates: [{ finishReason: FinishReason.STOP }], usageMetadata: usage } });
    const p = new GeminiProvider("k", "gemini-3.8-flash", client);
    const { object, usage: u } = await p.generateObject({ system: "s", messages: [{ role: "user", content: "make cards" }], schema, effort: "low" });
    expect(object.cards[0].front).toBe("TCP");
    expect(u.outputTokens).toBe(40);
    const config = (calls[0].params as { config: Record<string, unknown> }).config;
    expect(config.responseMimeType).toBe("application/json");
    const s = JSON.stringify(config.responseJsonSchema);
    expect(s).not.toContain("$schema");
    expect(s).not.toContain("9007199254740991");
    expect(config.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.LOW });
  });

  it("rejects malformed, schema-invalid, truncated and refused output", async () => {
    const run = (response: Chunk & { text?: string }) =>
      new GeminiProvider("k", "gemini-3.8-flash", fakeClient({ response }).client).generateObject({ system: "s", messages: [{ role: "user", content: "x" }], schema });
    await expect(run({ text: "not json", candidates: [{ finishReason: FinishReason.STOP }] })).rejects.toMatchObject({ code: "invalid_output" });
    await expect(run({ text: JSON.stringify({ cards: [{ front: 1 }] }) })).rejects.toMatchObject({ code: "invalid_output" });
    await expect(run({ text: '{"cards": [', candidates: [{ finishReason: FinishReason.MAX_TOKENS }] })).rejects.toThrow(/ran out of space/);
    await expect(run({ text: "", candidates: [{ finishReason: FinishReason.STOP }] })).rejects.toMatchObject({ code: "invalid_output" });
    await expect(run({ text: "", candidates: [{ finishReason: FinishReason.SAFETY }] })).rejects.toMatchObject({ code: "refused" });
  });

  it("sends PDFs for OCR as inline data and returns pages in order", async () => {
    const json = JSON.stringify({ pages: [{ page: 2, text: "Second" }, { page: 1, text: "First" }] });
    const { client, calls } = fakeClient({ response: { text: json, candidates: [{ finishReason: FinishReason.STOP }] } });
    const { pages } = await new GeminiProvider("k", "gemini-3.8-flash", client).transcribePdf(new Uint8Array([37, 80, 68, 70]), 3);
    expect(pages).toEqual(["First", "Second", ""]);
    const part = ((calls[0].params as { contents: { parts: { inlineData?: { mimeType: string } }[] }[] }).contents[0].parts[0]);
    expect(part.inlineData?.mimeType).toBe("application/pdf");
  });
});

describe("Gemini error handling", () => {
  const code = (e: unknown) => mapGeminiError(e).code;
  it("maps HTTP failures to codes and statuses the routes already understand", () => {
    expect(code(new ApiError({ status: 429, message: "Quota exceeded for metric: generate_content_free_tier_requests, limit: 20 per day" }))).toBe("quota_exceeded");
    expect(code(new ApiError({ status: 429, message: "Resource exhausted, retry in 30s" }))).toBe("rate_limited");
    expect(code(new ApiError({ status: 400, message: "API key not valid. Please pass a valid API key." }))).toBe("not_configured");
    expect(code(new ApiError({ status: 400, message: "Invalid JSON payload" }))).toBe("bad_request");
    expect(code(new ApiError({ status: 403, message: "Permission denied" }))).toBe("not_configured");
    expect(code(new ApiError({ status: 404, message: "models/x is not found" }))).toBe("not_configured");
    expect(code(new ApiError({ status: 503, message: "overloaded" }))).toBe("unavailable");
    expect(code(new ApiError({ status: 504, message: "deadline" }))).toBe("timeout");
    expect(code(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }))).toBe("timeout");
    expect(code(new Error("socket hang up"))).toBe("unavailable");
    expect(AI_ERROR_STATUS.quota_exceeded).toBe(429);
    expect(AI_ERROR_STATUS.timeout).toBe(504);
  });

  it("never leaks the API key or provider internals in user-facing messages", () => {
    const secret = "AIzaSy-super-secret-key";
    const e = mapGeminiError(new ApiError({ status: 400, message: `API key not valid: ${secret}` }));
    expect(e).toBeInstanceOf(AIError);
    expect(e.message).not.toContain(secret);
    expect(mapGeminiError(new Error(`fetch failed for key=${secret}`)).message).not.toContain(secret);
  });
});

describe("Gemini helpers", () => {
  it("chooses thinking level vs budget by model generation", () => {
    expect(thinkingConfigFor("gemini-3.8-flash", "high")).toEqual({ thinkingLevel: ThinkingLevel.HIGH });
    expect(thinkingConfigFor("gemini-2.5-flash", "low")).toEqual({ thinkingBudget: 0 });
  });
  it("converts roles and schemas", () => {
    expect(toGeminiContents([{ role: "assistant", content: "a" }])[0].role).toBe("model");
    expect(toGeminiJsonSchema(z.object({ n: z.number().int().min(1) }))).toEqual({
      type: "object",
      properties: { n: { type: "integer", minimum: 1 } }, // the ±2^53 bound zod adds is dropped
      required: ["n"],
      additionalProperties: false,
    });
    expect(stopReasonOf({ candidates: [{ finishReason: FinishReason.MAX_TOKENS }] } as never)).toBe("max_tokens");
  });
});

describe("Gemini failure diagnostics (so 'temporarily unavailable' has a findable cause)", () => {
  it("adds a short reference to unexpected failures and logs a redacted detail on the server", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = mapGeminiError(new ApiError({ status: 500, message: "Internal error for key AIzaSyFAKEFAKEFAKEFAKE123" }));
    expect(e.message).toBe("The AI service is temporarily unavailable. (ref: gemini_500)");
    expect(mapGeminiError(new ApiError({ status: 503, message: "The model is overloaded." })).message).toMatch(/overloaded.*ref: gemini_503/);
    expect(mapGeminiError(Object.assign(new TypeError("fetch failed"), { cause: "ENOTFOUND generativelanguage.googleapis.com" })).message).toMatch(/ref: network/);
    expect(mapGeminiError(new ApiError({ status: 400, message: "User location is not supported for the API use." })).message).toMatch(/region.*ref: gemini_400/);
    const logged = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain('"ref":"gemini_500"');
    expect(logged).not.toContain("AIzaSyFAKE");
    log.mockRestore();
  });
});

describe("AI self-test (/api/health?ai=check)", () => {
  it("reports success or the user-safe error, and calls Gemini at most once a minute", async () => {
    const { aiSelfTest, resetAISelfTestForTests } = await import("@/lib/ai/self-test");
    const ai = await import("@/lib/ai");
    process.env.GEMINI_API_KEY = "test-key-not-real-123";
    ai.resetAIProviderForTests();
    resetAISelfTestForTests();
    const provider = ai.getAIProvider() as unknown as { streamText: (o: unknown) => unknown };
    let calls = 0;
    provider.streamText = () => {
      calls++;
      return { textStream: (async function* () {})(), final: async () => { throw new AIError("unavailable", "The AI service is temporarily unavailable. (ref: gemini_500)"); } };
    };
    const first = await aiSelfTest(1_000_000);
    expect(first).toMatchObject({ ok: false, error: "The AI service is temporarily unavailable. (ref: gemini_500)" });
    expect(JSON.stringify(first)).not.toContain("test-key-not-real");
    await aiSelfTest(1_030_000);
    expect(calls).toBe(1);
    provider.streamText = () => ({ textStream: (async function* () {})(), final: async () => ({ text: "OK", usage: {}, stopReason: "end_turn" }) });
    expect((await aiSelfTest(1_070_000)).ok).toBe(true);
    delete process.env.GEMINI_API_KEY;
    ai.resetAIProviderForTests();
  });
});
