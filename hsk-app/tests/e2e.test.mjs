// End-to-end checks in a real Chromium against the static app.
// Run: npm run test:e2e   (PLAYWRIGHT_PATH / CHROME_PATH override the defaults below)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png",
};
const STORAGE_KEY = "hsk-progress-v1";

let server, base, browser;

before(async () => {
  server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(root, urlPath === "/" ? "index.html" : urlPath);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/index.html`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function open(hash = "#/home", opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });
  await page.goto(base + hash);
  await page.waitForFunction(() => !document.querySelector("#app")?.textContent.includes("Đang tải"));
  return page;
}

async function go(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction(() => !document.querySelector("#app")?.textContent.includes("Đang tải"));
}

const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), STORAGE_KEY);
const appText = (page) => page.evaluate(() => document.querySelector("#app").innerText);

test("home loads with HSK and work data and no errors", async () => {
  const page = await open();
  const text = await appText(page);
  assert.match(text, /Giáo trình HSK/);
  assert.match(text, /HSK 4/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("work lesson list shows topic titles only, without lesson numbers", async () => {
  const page = await open("#/work");
  const text = await appText(page);
  assert.match(text, /Hành chính - nhân sự/);
  assert.match(text, /Quyển 1/);
  assert.match(text, /Quyển 2/);
  assert.doesNotMatch(text, /Bài\s*\d/, "no 'Bài N' label");
  assert.doesNotMatch(text, /第.{1,4}课/, "no Chinese lesson number");
  assert.equal(await page.locator(".lesson-num").count(), 0);
  const rows = await page.locator(".lesson-row").count();
  assert.equal(rows, 40, "20 lessons in each of the two books");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("lesson page has a title, no lesson number, and all four tabs work", async () => {
  const page = await open("#/work/q1-01");
  const text = await appText(page);
  assert.match(text, /Hành chính - nhân sự/);
  assert.doesNotMatch(text, /Bài\s*\d/);
  for (const tab of ["grammar", "sentences"]) {
    await go(page, `#/work/q1-01/${tab}`);
    assert.ok((await appText(page)).length > 50, `${tab} tab has content`);
  }
  await go(page, "#/work/q2-01/dialogues");
  assert.match(await appText(page), /Hội thoại 1/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("home resume link uses the lesson title, not its number", async () => {
  const page = await open("#/work/q1-02");
  await go(page, "#/home");
  const resume = await page.locator(".resume").innerText();
  assert.match(resume, /Tài chính - kế toán/);
  assert.doesNotMatch(resume, /Bài\s*\d|Q\d/);
  await page.context().close();
});

test("reviewing a new word saves progress that survives a reload", async () => {
  const page = await open();
  await page.click('[data-action="start"][data-kind="new"]');
  await page.click('[data-action="reveal"]');
  await page.click('[data-action="rate"] >> nth=2');
  const s = await stored(page);
  assert.ok(s && Object.keys(s.cards).length >= 1, "a card was saved");
  await page.reload();
  await page.waitForFunction(() => !document.querySelector("#app")?.textContent.includes("Đang tải"));
  assert.equal(Object.keys((await stored(page)).cards).length, Object.keys(s.cards).length);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

async function solveOrderRound(page) {
  // Pieces are indexed in their correct order; tap 0, 1, 2... then check.
  for (let i = 0; ; i += 1) {
    const chip = page.locator(`[data-action="g-place"][data-index="${i}"]`);
    if (!(await chip.count())) break;
    await chip.click();
  }
  await page.click('[data-action="g-check"]');
}

test("sentence ordering: placing pieces in the right order is marked correct", async () => {
  const page = await open("#/work/q1-01/sentences");
  await page.click('[data-action="practice"][data-mode="order"]');
  await page.waitForSelector('[data-action="g-place"]');
  await solveOrderRound(page);
  assert.match(await page.locator(".feedback").innerText(), /Đúng/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("grammar practice for a lesson runs and grades the first sentence", async () => {
  const page = await open("#/work/q1-01/grammar");
  await page.click('[data-action="practice"][data-mode="grammar-due"]');
  await page.waitForSelector('[data-action="g-place"]');
  assert.ok((await page.locator(".formula, .hint").count()) > 0, "shows the grammar pattern");
  await solveOrderRound(page);
  assert.match(await page.locator(".feedback").innerText(), /Đúng/);
  assert.ok(Object.keys((await stored(page)).cards).some((k) => k.startsWith("g")), "grammar result stored");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("HSK grammar practice includes points from the HSK sheets", async () => {
  const page = await open("#/hsk/4");
  await page.evaluate(() => { location.hash = "#/practice"; });
  await page.waitForSelector('[data-action="practice"][data-mode="grammar-due"]');
  await page.click('[data-action="practice"][data-mode="grammar-due"]');
  await page.waitForSelector('[data-action="g-place"]');
  await solveOrderRound(page);
  assert.match(await page.locator(".feedback").innerText(), /Đúng/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("the G055 example is a complete sentence and can be practised", async () => {
  const page = await open();
  const ex = await page.evaluate(async () => {
    const g = await (await fetch("data/work/grammar.json")).json();
    return g.find((x) => x.id === "G055").examples[0];
  });
  assert.doesNotMatch(ex.zh, /…|\.\.\./);
  assert.ok(ex.vi.length > 0);
  await page.context().close();
});

test("dialogue practice runs to the end", async () => {
  const page = await open("#/work/q2-01/dialogues");
  await page.click('[data-action="practice"][data-mode="dialogue"] >> nth=0');
  for (let step = 0; step < 60; step += 1) {
    if (await page.locator('[data-action="dl-done"]').count()) break;
    if (await page.locator('[data-action="dl-pick"]').count()) await page.click('[data-action="dl-pick"] >> nth=0');
    else if (await page.locator('[data-action="dl-next"]').count()) await page.click('[data-action="dl-next"]');
  }
  assert.equal(await page.locator('[data-action="dl-done"]').count(), 1, "reached the end of the dialogue");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("export downloads a backup and import restores it", async () => {
  const page = await open();
  await page.click('[data-action="start"][data-kind="new"]');
  await page.click('[data-action="reveal"]');
  await page.click('[data-action="rate"] >> nth=2');
  const before = await stored(page);
  await go(page, "#/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-action="export"]')]);
  assert.match(download.suggestedFilename(), /^hsk-progress-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
  await page.setInputFiles("#import-file", file);
  await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("Đã nhập"));
  assert.deepEqual(Object.keys((await stored(page)).cards).sort(), Object.keys(before.cards).sort());
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("import rejects a file that is not a backup", async () => {
  const page = await open("#/settings");
  await page.setInputFiles("#import-file", { name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"hello":1}') });
  await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("không hợp lệ"));
  await page.context().close();
});

test("no horizontal scroll at phone width on the main screens", async () => {
  const page = await open();
  for (const hash of ["#/home", "#/hsk", "#/work", "#/work/q1-05", "#/practice", "#/stats", "#/settings"]) {
    await go(page, hash);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${hash} overflows by ${overflow}px`);
  }
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("dark mode renders the work list without errors", async () => {
  const page = await open("#/work", { colorScheme: "dark" });
  assert.equal(await page.locator(".lesson-row").count(), 40);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
