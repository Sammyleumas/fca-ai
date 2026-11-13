// Copies the PDF.js worker into /public so the Reading Room can load it from our origin.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
mkdirSync(join(root, "public"), { recursive: true });
copyFileSync(src, join(root, "public", "pdf.worker.min.mjs"));
console.log("pdf.js worker copied to public/pdf.worker.min.mjs");
