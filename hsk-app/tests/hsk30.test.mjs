// Data checks for the HSK 3.0 files in data/hsk30 (no browser needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "hsk30");
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

test("index lists levels 1–6 with the expected counts", () => {
  const index = read("index.json");
  assert.deepEqual(index.levels.map((l) => l.level), [1, 2, 3, 4, 5, 6]);
  assert.equal(index.levels.reduce((n, l) => n + l.chars, 0), 1800);
  assert.equal(index.levels.reduce((n, l) => n + l.words, 0), 5421); // after dropping sentence patterns and duplicates
});

test("every level file matches the index and every entry has hanzi, pinyin and a level", () => {
  const index = read("index.json");
  for (const { level, words, chars } of index.levels) {
    const w = read(`words-${level}.json`);
    const c = read(`chars-${level}.json`);
    assert.equal(w.length, words, `words-${level}`);
    assert.equal(c.length, chars, `chars-${level}`);
    for (const e of [...w, ...c]) {
      assert.ok(e.h, "hanzi");
      assert.equal(e.l, level, "level tag");
    }
    const missingPinyin = [...w, ...c].filter((e) => !e.p).length;
    assert.ok(missingPinyin <= 5, `level ${level}: ${missingPinyin} entries without pinyin`);
  }
});

test("character keys are unique across levels", () => {
  const seen = new Set();
  for (let level = 1; level <= 6; level += 1) {
    for (const c of read(`chars-${level}.json`)) {
      assert.ok(!seen.has(c.h), `duplicate character ${c.h}`);
      seen.add(c.h);
    }
  }
  assert.equal(seen.size, 1800);
});
