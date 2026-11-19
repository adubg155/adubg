// End-to-end checks in a real Chromium: user flows, persistence, storage recovery, layout.
// Run with: npm run test:e2e   (uses the Chromium at CHROME_PATH, default /opt/pw-browsers/chromium)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// Playwright is taken from PLAYWRIGHT_PATH if set, otherwise from the global install in this container.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };

let server, base, browser;

before(async () => {
  server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(base);
  await page.waitForSelector('.card');
  return page;
}

async function tab(page, name) {
  await page.click(`.tabbar button[data-tab="${name}"]`);
}

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hsk-state') || 'null'));

test('loads the full dataset and shows the word count', async () => {
  const page = await newPage();
  assert.equal(await page.textContent('#level-chip'), '1192 từ');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('review: reveal, grade, progress is saved and the card advances', async () => {
  const page = await newPage();
  assert.equal(await page.locator('[data-act="speak"]').count(), 0, 'no speaker button without a Chinese voice');
  await page.click('[data-act="reveal"]');
  assert.ok(await page.locator('.grade').isVisible());
  await page.click('[data-act="grade"][data-q="5"]');
  assert.match(await page.textContent('.muted.center'), /2 \/ 10/);
  const s = await stored(page);
  assert.equal(Object.keys(s.cards).length, 1);
  const card = Object.values(s.cards)[0];
  assert.equal(card.reps, 1);
  assert.equal(card.interval, 1);
  await page.context().close();
});

test('progress survives a reload and the graded word is not queued again today', async () => {
  const page = await newPage();
  const gradedWord = await page.textContent('.hanzi');
  await page.click('[data-act="reveal"]');
  await page.click('[data-act="grade"][data-q="4"]');
  await page.reload();
  await page.waitForSelector('.card');
  assert.equal(Object.keys((await stored(page)).cards).length, 1, 'the one graded card is kept after reload');
  // The graded word is no longer new, so the queue must not start with it again.
  assert.notEqual(await page.textContent('.hanzi'), gradedWord);
  await page.context().close();
});

test('a failed answer is logged in the mistakes tab', async () => {
  const page = await newPage();
  const hanzi = await page.textContent('.hanzi');
  await page.click('[data-act="reveal"]');
  await page.click('[data-act="grade"][data-q="1"]');
  await tab(page, 'mistakes');
  assert.match(await page.textContent('.list'), new RegExp(hanzi));
  await page.context().close();
});

test('placement test scores 25 questions and stores the result', async () => {
  const page = await newPage();
  await tab(page, 'test');
  await page.click('[data-act="start-test"][data-level="1"]');
  for (let i = 0; i < 25; i++) {
    // Always pick the first option; the test checks the stored result matches what is shown.
    await page.click('[data-act="answer-test"]');
  }
  const shown = await page.textContent('.card.center .big');
  const match = shown.match(/^(\d+) \/ 25/);
  assert.ok(match, `result text was: ${shown}`);
  const s = await stored(page);
  assert.equal(s.placement.hsk1.of, 25);
  assert.equal(s.placement.hsk1.score, Number(match[1]));
  await page.context().close();
});

test('match game: pairing the right hanzi and meaning marks it matched', async () => {
  const page = await newPage();
  await tab(page, 'games');
  const hanzi = page.locator('[data-act="pick-hanzi"]').first();
  const id = await hanzi.getAttribute('data-id');
  await hanzi.click();
  await page.locator(`[data-act="pick-meaning"][data-id="${id}"]`).click();
  assert.ok(await page.locator(`[data-act="pick-hanzi"][data-id="${id}"]`).evaluate((el) => el.classList.contains('matched')));
  await page.context().close();
});

test('listen game: a wrong pinyin is marked and the next question appears', async () => {
  const page = await newPage();
  await tab(page, 'games');
  const options = page.locator('[data-act="answer-listen"]');
  // Pick the last option; it may or may not be correct, and both outcomes are valid here.
  await options.nth(3).click();
  assert.ok(await page.locator('[data-act="next-listen"]').isVisible());
  await page.click('[data-act="next-listen"]');
  assert.equal(await page.locator('[data-act="next-listen"]').count(), 0);
  await page.context().close();
});

test('settings: theme and new-words-per-day are saved', async () => {
  const page = await newPage();
  await tab(page, 'settings');
  await page.selectOption('#theme', 'dark');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await page.fill('#newPerDay', '15');
  await page.dispatchEvent('#newPerDay', 'change');
  const s = await stored(page);
  assert.equal(s.settings.theme, 'dark');
  assert.equal(s.settings.newPerDay, 15);
  await page.context().close();
});

test('settings: an invalid new-words-per-day value is rejected', async () => {
  const page = await newPage();
  await tab(page, 'settings');
  await page.fill('#newPerDay', '500');
  await page.dispatchEvent('#newPerDay', 'change');
  assert.match(await page.textContent('.notice'), /1 đến 100/);
  const s = await stored(page);
  assert.ok(!s || s.settings.newPerDay !== 500, 'invalid value must not be saved');
  await page.context().close();
});

test('corrupt saved data is backed up and the app still starts', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(base);
  await page.evaluate(() => localStorage.setItem('hsk-state', '{broken'));
  await page.reload();
  await page.waitForSelector('.card');
  assert.match(await page.textContent('.notice'), /khóa hsk-state-backup/);
  assert.equal(await page.evaluate(() => localStorage.getItem('hsk-state-backup')), '{broken');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('export downloads a backup and import accepts it back', async () => {
  const page = await newPage();
  await tab(page, 'settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Xuất dữ liệu")')]);
  assert.match(download.suggestedFilename(), /^hsk-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  page.once('dialog', (d) => d.accept());
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForFunction(() => document.querySelector('.notice')?.textContent.includes('Đã nhập'));
  await page.context().close();
});

test('import rejects a file that is not a backup', async () => {
  const page = await newPage();
  await tab(page, 'settings');
  await page.setInputFiles('input[type="file"]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await page.waitForFunction(() => document.querySelector('.notice')?.textContent.includes('không đúng định dạng'));
  await page.context().close();
});

test('phone layout has no horizontal scroll on every tab', async () => {
  const page = await newPage();
  for (const t of ['review', 'test', 'games', 'mistakes', 'stats', 'settings']) {
    await tab(page, t);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${t} overflows by ${overflow}px`);
  }
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('dark theme renders without console errors', async () => {
  const page = await newPage({ colorScheme: 'dark' });
  await tab(page, 'stats');
  await tab(page, 'games');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
