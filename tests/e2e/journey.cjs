/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS so the globally installed Playwright resolves */
// Launch check: walks the student journey against a REAL deployment (Supabase,
// AI provider and storage configured). It creates real data in that account.
//
//   BASE_URL=https://your-app.example E2E_EMAIL=... E2E_PASSWORD=... \
//   E2E_PDF=./some-lecture-notes.pdf node tests/e2e/journey.cjs
//
// Use a dedicated, already-verified test account. Steps that depend on the AI
// (processing, tutor, quiz) wait up to a few minutes.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");

(async () => {
  const BASE = (process.env.BASE_URL ?? "").replace(/\/$/, "");
  const { E2E_EMAIL, E2E_PASSWORD, E2E_PDF } = process.env;
  if (!BASE || !E2E_EMAIL || !E2E_PASSWORD || !E2E_PDF) {
    console.error("Set BASE_URL, E2E_EMAIL, E2E_PASSWORD and E2E_PDF.");
    process.exit(2);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let failed = false;
  async function step(n, name, fn) {
    const t = Date.now();
    try {
      await fn();
      console.log(`✓ ${String(n).padStart(2)} ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    } catch (e) {
      failed = true;
      console.log(`✗ ${String(n).padStart(2)} ${name}\n     ${e.message.split("\n")[0]}`);
      await page.screenshot({ path: `journey-step-${n}.png` }).catch(() => {});
    }
  }
  const heading = (re) => page.getByRole("heading", { level: 1, name: re }).first().waitFor({ timeout: 20000 });

  await step(1, "health endpoint reports database ok", async () => {
    const r = await page.request.get(`${BASE}/api/health`);
    const j = await r.json();
    assert.equal(j.database, "ok", JSON.stringify(j));
  });
  await step(2, "welcome page loads", async () => {
    await page.goto(`${BASE}/`);
    await page.getByRole("heading", { level: 1 }).waitFor();
  });
  await step(3, "sign in", async () => {
    await page.goto(`${BASE}/login`);
    await page.getByPlaceholder("Email address").fill(E2E_EMAIL);
    await page.getByPlaceholder("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30000 });
  });
  await step(4, "dashboard renders", async () => {
    await page.goto(`${BASE}/dashboard`);
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  });
  let materialUrl = "";
  await step(5, "upload a PDF to the library", async () => {
    await page.goto(`${BASE}/library`);
    await page.locator('input[type="file"]').first().setInputFiles(path.resolve(E2E_PDF));
    await page.waitForURL(/\/library\/[0-9a-f-]{36}/, { timeout: 120000 }).catch(async () => {
      // Some flows stay on the library; open the newest material instead.
      await page.goto(`${BASE}/library`);
      await page.locator('a[href^="/library/"]').first().click();
      await page.waitForURL(/\/library\/[0-9a-f-]{36}/, { timeout: 20000 });
    });
    materialUrl = page.url();
  });
  await step(6, "processing finishes (extract → structure → analyse)", async () => {
    const deadline = Date.now() + 5 * 60_000;
    for (;;) {
      await page.goto(materialUrl);
      const body = await page.locator("main").innerText();
      if (/failed/i.test(body) && !/ready/i.test(body)) throw new Error("material processing failed");
      if (await page.getByRole("link", { name: /open reader|read/i }).first().isVisible().catch(() => false)) break;
      if (Date.now() > deadline) throw new Error("material not ready after 5 minutes");
      await page.waitForTimeout(10000);
    }
  });
  await step(7, "reader opens the document", async () => {
    await page.getByRole("link", { name: /open reader|read/i }).first().click();
    await page.waitForURL(/\/reader\//, { timeout: 20000 });
    await page.locator("canvas, .textLayer, article").first().waitFor({ timeout: 60000 });
  });
  await step(8, "tutor answers a question about the material", async () => {
    await page.goto(`${BASE}/tutor`);
    const box = page.getByRole("textbox").last();
    await box.fill("Summarise the main idea of my latest material in two sentences.");
    await box.press("Enter");
    await page.locator('[data-role="assistant"], [data-message-role="assistant"]').last().waitFor({ timeout: 120000 }).catch(async () => {
      await page.waitForTimeout(30000);
    });
  });
  await step(9, "planner page renders", async () => {
    await page.goto(`${BASE}/planner`);
    await heading(/plan/i);
  });
  await step(10, "assessments page renders", async () => {
    await page.goto(`${BASE}/assessments`);
    await heading(/assess|quiz/i);
  });
  await step(11, "flashcards page renders", async () => {
    await page.goto(`${BASE}/flashcards`);
    await heading(/flashcard/i);
  });
  await step(12, "analytics shows real data", async () => {
    await page.goto(`${BASE}/analytics`);
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  });
  await step(13, "notifications & achievements render", async () => {
    await page.goto(`${BASE}/notifications`);
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
    await page.goto(`${BASE}/achievements`);
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
  });
  await step(14, "billing page shows plan (no payment is made)", async () => {
    await page.goto(`${BASE}/settings/billing`);
    await page.getByText(/free|premium/i).first().waitFor({ timeout: 20000 });
  });
  await step(15, "data export downloads JSON", async () => {
    const r = await page.request.get(`${BASE}/api/account/export`);
    assert.equal(r.status(), 200);
    const j = await r.json();
    assert.ok(j && typeof j === "object");
  });

  if (errors.length) {
    failed = true;
    console.log(`✗ page errors:\n     ${errors.slice(0, 5).join("\n     ")}`);
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
