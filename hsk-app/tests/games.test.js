import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, pickOptions, buildMatchRound, buildListenQuestion, buildMeaningQuestion } from '../src/games.js';

const pool = [
  { id: '1', hanzi: '你好', pinyin: 'nǐ hǎo', vi: 'chào' },
  { id: '2', hanzi: '谢谢', pinyin: 'xièxie', vi: 'cảm ơn' },
  { id: '3', hanzi: '再见', pinyin: 'zàijiàn', vi: 'tạm biệt' },
  { id: '4', hanzi: '我', pinyin: 'wǒ', vi: 'tôi' },
  { id: '5', hanzi: '你', pinyin: 'nǐ', vi: 'bạn' },
];

test('shuffle keeps the same items', () => {
  const out = shuffle(pool, () => 0.5);
  assert.equal(out.length, pool.length);
  assert.deepEqual([...out].map((w) => w.id).sort(), pool.map((w) => w.id).sort());
});

test('pickOptions includes the target and never repeats the key', () => {
  // '你好' and '你' share the pinyin 'nǐ' only partly; 'nǐ hǎo' vs 'nǐ' differ, so both can appear.
  const target = pool[0];
  const opts = pickOptions(target, pool, 'pinyin', 4, () => 0.3);
  assert.equal(opts.length, 4);
  assert.ok(opts.some((w) => w.id === target.id));
  const keys = opts.map((w) => w.pinyin);
  assert.equal(new Set(keys).size, keys.length);
});

test('pickOptions works with a pool smaller than requested', () => {
  const opts = pickOptions(pool[0], pool.slice(0, 2), 'vi', 4, () => 0.1);
  assert.equal(opts.length, 2);
});

test('match round uses distinct words for both columns', () => {
  const r = buildMatchRound(pool, 4, () => 0.7);
  assert.equal(r.words.length, 4);
  assert.deepEqual([...r.hanziOrder.map((w) => w.id)].sort(), r.words.map((w) => w.id).sort());
  assert.deepEqual([...r.meaningOrder.map((w) => w.id)].sort(), r.words.map((w) => w.id).sort());
});

test('listen and meaning questions contain the correct answer', () => {
  const l = buildListenQuestion(pool[1], pool, () => 0.2);
  assert.ok(l.options.some((w) => w.id === pool[1].id));
  const m = buildMeaningQuestion(pool[2], pool, () => 0.9);
  assert.ok(m.options.some((w) => w.id === pool[2].id));
});
