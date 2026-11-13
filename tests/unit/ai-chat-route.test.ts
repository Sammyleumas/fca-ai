import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The AI tutor chat route end to end with Gemini mocked at the SDK boundary:
 * request → saved student message → history + system prompt → streamed answer →
 * saved assistant message. Supabase and auth are replaced by small in-memory fakes.
 */
vi.mock("server-only", () => ({}));

// ---- Gemini SDK fake (only GoogleGenAI is replaced; ApiError/enums stay real) ----
type Chunk = { text?: string; candidates?: { finishReason?: string }[]; usageMetadata?: Record<string, number>; modelVersion?: string };
const gemini = vi.hoisted(() => ({
  chunks: [] as Chunk[],
  error: null as unknown,
  calls: [] as Record<string, unknown>[],
  constructedWith: [] as Record<string, unknown>[],
}));
vi.mock("@google/genai", async (importOriginal) => {
  const real = await importOriginal<typeof import("@google/genai")>();
  class FakeGoogleGenAI {
    models = {
      generateContentStream: async (params: Record<string, unknown>) => {
        gemini.calls.push(params);
        if (gemini.error) throw gemini.error;
        const chunks = gemini.chunks;
        return (async function* () {
          for (const c of chunks) yield c;
        })();
      },
      generateContent: async () => ({ text: "{}" }),
    };
    constructor(opts: Record<string, unknown>) {
      gemini.constructedWith.push(opts);
    }
  }
  return { ...real, GoogleGenAI: FakeGoogleGenAI };
});

// ---- App boundaries ----
const state = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111", email: "ada@example.com", isGuest: false } as { id: string; email: string | null; isGuest: boolean } | null,
  history: [] as { role: string; content: string }[],
  inserts: [] as { table: string; row: Record<string, unknown>; via: "user" | "admin" }[],
  usage: [] as unknown[],
}));

function fakeSupabase(via: "user" | "admin") {
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    let op: "select" | "insert" | "update" = "select";
    let row: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
      select: chain,
      eq: chain,
      order: chain,
      limit: chain,
      insert(r: Record<string, unknown>) {
        op = "insert";
        row = r;
        state.inserts.push({ table, row: r, via });
        return q;
      },
      update() {
        op = "update";
        return q;
      },
      single: async () => ({ data: op === "insert" && table === "ai_conversations" ? { id: "22222222-2222-4222-8222-222222222222" } : null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then(resolve: (v: unknown) => unknown) {
        // Awaiting the builder directly: history select, plain inserts/updates.
        if (op === "select" && table === "ai_messages") return Promise.resolve({ data: [...state.history].reverse(), error: null }).then(resolve);
        void row;
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    });
    return q;
  };
  return { from, rpc: async () => ({ data: null, error: null }) };
}

vi.mock("@/lib/auth/dal", () => ({
  getSessionUser: async () => state.user,
  getProfile: async () => ({ preferred_name: "Ada", full_name: null, education_level: "university" }),
  displayName: () => "Ada",
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeSupabase("user") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase("admin"), hasAdminClient: () => true }));
vi.mock("@/lib/ai/guard", () => ({
  assertAIAllowed: async () => undefined,
  recordAIUsage: async (_u: string, _f: string, usage: unknown) => {
    state.usage.push(usage);
  },
}));

const { POST } = await import("@/app/api/ai/chat/route");
const { resetAIProviderForTests } = await import("@/lib/ai");
const { ApiError, FinishReason } = await import("@google/genai");

function request(body: unknown) {
  return new Request("http://localhost/api/ai/chat", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-gemini-key-not-real";
  delete process.env.GEMINI_MODEL;
  delete process.env.AI_PROVIDER;
  resetAIProviderForTests();
  state.user = { id: "11111111-1111-4111-8111-111111111111", email: "ada@example.com", isGuest: false };
  state.history = [];
  state.inserts = [];
  state.usage = [];
  gemini.chunks = [];
  gemini.error = null;
  gemini.calls = [];
  gemini.constructedWith = [];
});

describe("POST /api/ai/chat with Gemini", () => {
  it("streams Gemini's answer, keeps the conversation history and saves both turns", async () => {
    state.history = [
      { role: "user", content: "What is a network?" },
      { role: "assistant", content: "Connected devices sharing data." },
      { role: "user", content: "Explain TCP" },
    ];
    gemini.chunks = [
      { text: "TCP is " },
      { text: "reliable." , candidates: [{ finishReason: FinishReason.STOP }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 }, modelVersion: "gemini-3.8-flash" },
    ];
    const res = await POST(request({ message: "Explain TCP" }) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Conversation-Id")).toBe("22222222-2222-4222-8222-222222222222");
    expect(await res.text()).toBe("TCP is reliable.");

    // Same frontend contract: plain text stream + headers. The model saw the history and the tutor system prompt.
    const params = gemini.calls[0] as { model: string; contents: { role: string; parts: { text: string }[] }[]; config: { systemInstruction: string } };
    expect(params.model).toBe("gemini-3.8-flash");
    expect(params.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(params.config.systemInstruction).toMatch(/tutor/i);

    const userMsg = state.inserts.find((i) => i.table === "ai_messages" && i.row.role === "user");
    const aiMsg = state.inserts.find((i) => i.table === "ai_messages" && i.row.role === "assistant");
    expect(userMsg?.via).toBe("user");
    expect(aiMsg).toMatchObject({ via: "admin", row: { content: "TCP is reliable.", model: "gemini-3.8-flash", input_tokens: 50, output_tokens: 5 } });
    expect(state.usage).toHaveLength(1);
  });

  it("answers 503 with a friendly message (and calls nothing) when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    resetAIProviderForTests();
    const res = await POST(request({ message: "Hi" }) as never);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI features are not configured yet.");
    expect(gemini.calls).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });

  it("keeps the student's message and reports a free-tier quota error in-stream", async () => {
    state.history = [{ role: "user", content: "Hi" }];
    gemini.error = new ApiError({ status: 429, message: "Quota exceeded for metric: generate_content_free_tier_requests, limit: 20 per day" });
    const res = await POST(request({ message: "Hi" }) as never);
    const text = await res.text();
    expect(text).toContain("[[error:Today's AI allowance has been used up");
    expect(state.inserts.some((i) => i.row.role === "user")).toBe(true); // never lose what they wrote
    expect(state.inserts.some((i) => i.row.role === "assistant")).toBe(false);
  });

  it("reports an empty Gemini answer as an error instead of silently saving nothing", async () => {
    state.history = [{ role: "user", content: "Hi" }];
    gemini.chunks = [{ text: "", candidates: [{ finishReason: FinishReason.STOP }] }];
    const text = await (await POST(request({ message: "Hi" }) as never)).text();
    expect(text).toContain("[[error:The AI returned an empty answer");
  });

  it("shows a polite message when Gemini blocks the answer", async () => {
    state.history = [{ role: "user", content: "Hi" }];
    gemini.chunks = [{ text: "", candidates: [{ finishReason: FinishReason.SAFETY }] }];
    const text = await (await POST(request({ message: "Hi" }) as never)).text();
    expect(text).toContain("I can't help with that request");
  });

  it("rejects signed-out and invalid requests before touching Gemini", async () => {
    state.user = null;
    expect((await POST(request({ message: "Hi" }) as never)).status).toBe(401);
    state.user = { id: "11111111-1111-4111-8111-111111111111", email: null, isGuest: true };
    expect((await POST(request({ message: "" }) as never)).status).toBe(400);
    expect(gemini.calls).toHaveLength(0);
  });

  it("passes the key only to the server-side SDK client", async () => {
    gemini.chunks = [{ text: "ok", candidates: [{ finishReason: FinishReason.STOP }] }];
    state.history = [{ role: "user", content: "Hi" }];
    const res = await POST(request({ message: "Hi" }) as never);
    const body = await res.text();
    expect(gemini.constructedWith[0]).toMatchObject({ apiKey: "test-gemini-key-not-real" });
    expect(body).not.toContain("test-gemini-key-not-real");
    expect(JSON.stringify(Object.fromEntries(res.headers))).not.toContain("test-gemini-key-not-real");
  });
});
