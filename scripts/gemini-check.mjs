// Verifies that the configured Gemini model is available to YOUR API key's project,
// then makes one tiny request. Usage (the key is read from the environment only):
//   GEMINI_API_KEY=... npm run gemini:check            # checks GEMINI_MODEL or the default
//   GEMINI_API_KEY=... GEMINI_MODEL=gemini-... npm run gemini:check
// The key is never printed.
import { ApiError, GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.8-flash"; // keep in sync with src/lib/server-env.ts
const key = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

if (!key) {
  console.error("GEMINI_API_KEY is not set. Create one in Google AI Studio (https://aistudio.google.com/apikey).");
  process.exit(2);
}

const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 30_000 } });

function explain(error) {
  if (error instanceof ApiError) {
    const hints = {
      400: "Bad request (an invalid API key also reports 400).",
      403: "Permission denied: the key can't use this API or model.",
      404: "This model ID is not available to your key.",
      429: "Rate limit or quota reached for this model on your project's tier.",
    };
    return `HTTP ${error.status}: ${hints[error.status] ?? error.message.slice(0, 200)}`;
  }
  return error instanceof Error ? error.message.slice(0, 200) : String(error);
}

let ok = true;
try {
  const info = await ai.models.get({ model });
  console.log(`✓ Model found: ${info.name}${info.displayName ? ` (${info.displayName})` : ""}`);
  if (info.inputTokenLimit) console.log(`  input token limit: ${info.inputTokenLimit}, output: ${info.outputTokenLimit ?? "?"}`);
} catch (error) {
  ok = false;
  console.error(`✗ Model "${model}" lookup failed — ${explain(error)}`);
  try {
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    const flash = [];
    for await (const m of pager) if (/flash/i.test(m.name ?? "") && (m.supportedActions ?? []).includes("generateContent")) flash.push(m.name);
    if (flash.length) console.error(`  Flash models your key can use:\n   - ${flash.join("\n   - ")}\n  Set GEMINI_MODEL to one of these (without the "models/" prefix).`);
  } catch (listError) {
    console.error(`  (Could not list models — ${explain(listError)})`);
  }
}

if (ok) {
  try {
    const res = await ai.models.generateContent({ model, contents: "Reply with the single word: ready" });
    console.log(`✓ Test request succeeded: "${(res.text ?? "").trim().slice(0, 40)}" (model version: ${res.modelVersion ?? model})`);
  } catch (error) {
    ok = false;
    console.error(`✗ Test request failed — ${explain(error)}`);
  }
}

console.log(
  ok
    ? `\nGemini is ready. FCA-AI will use "${model}".`
    : "\nGemini is NOT ready. Fix the issue above, then run this check again.",
);
console.log("Free-tier limits are set per project: see https://aistudio.google.com (Usage / Rate limits).");
process.exit(ok ? 0 : 1);
