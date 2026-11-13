/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS so the globally installed Playwright resolves */
// UI smoke test (no database required). Usage:
//   npm run dev   (in another shell)  then  BASE_URL=http://localhost:3000 npm run test:e2e
// Uses the pre-installed Playwright browser (CommonJS so a global `playwright` install resolves).
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`✓ ${name}`);
  } catch (e) {
    results.push(`✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

const browser = await chromium.launch();
const viewports = { mobile: { width: 390, height: 844 }, tablet: { width: 834, height: 1112 }, desktop: { width: 1440, height: 900 } };

for (const [label, viewport] of Object.entries(viewports)) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await check(`[${label}] welcome page renders with CTAs and no overflow`, async () => {
    await page.goto(`${BASE}/`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    assert.ok(await page.getByRole("link", { name: /get started/i }).first().isVisible());
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.equal(overflow, 0, "horizontal overflow");
  });

  await check(`[${label}] login validates email server-side`, async () => {
    await page.goto(`${BASE}/login`);
    await page.getByPlaceholder("Email address").fill("not-an-email");
    await page.getByPlaceholder("Password").fill("whatever1");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.getByText("Enter a valid email address.").waitFor({ timeout: 10000 });
  });

  await check(`[${label}] password visibility toggle works`, async () => {
    await page.goto(`${BASE}/login`);
    const pw = page.getByPlaceholder("Password");
    assert.equal(await pw.getAttribute("type"), "password");
    await page.getByRole("button", { name: "Show password" }).click();
    assert.equal(await pw.getAttribute("type"), "text");
  });

  await check(`[${label}] signup requires accepting terms`, async () => {
    await page.goto(`${BASE}/signup`);
    await page.getByPlaceholder("Preferred name").fill("Alex");
    await page.getByPlaceholder("Email address").fill("alex@example.com");
    await page.getByPlaceholder("Create a password").fill("studyhard1");
    await page.getByRole("button", { name: /create account/i }).click();
    await page.getByText("Please accept the terms to continue.").waitFor({ timeout: 10000 });
  });

  await check(`[${label}] protected routes redirect to login`, async () => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(/\/login/);
  });

  await check(`[${label}] no uncaught page errors`, async () => {
    assert.deepEqual(errors, []);
  });
  await page.close();
}

await browser.close();
console.log(results.join("\n"));
})();
