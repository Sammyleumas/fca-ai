// After `next build`, fails if the Gemini key (or the SDK) ended up in browser bundles.
// Build with a recognisable dummy key, then run:  GEMINI_API_KEY=<same dummy> node scripts/check-client-bundle.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = ".next/static";
if (!existsSync(dir)) {
  console.error("No .next/static directory — run `next build` first.");
  process.exit(2);
}
const key = process.env.GEMINI_API_KEY?.trim();
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const bad = [];
for (const f of walk(dir).filter((f) => f.endsWith(".js"))) {
  const code = readFileSync(f, "utf8");
  if (key && code.includes(key)) bad.push(`${f}: contains the API key`);
  if (code.includes("GEMINI_API_KEY")) bad.push(`${f}: references GEMINI_API_KEY`);
  if (code.includes("generativelanguage.googleapis.com")) bad.push(`${f}: contains the Gemini SDK`);
}
if (bad.length) {
  console.error("Client bundle check FAILED:\n" + bad.join("\n"));
  process.exit(1);
}
console.log(`Client bundle check passed (${walk(dir).length} files scanned, no Gemini key or SDK in browser code).`);
