import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCard, review, isDue, sessionQueue, DAY_MS, MIN_EASE } from '../src/srs.js';

const NOW = new Date(2026, 0, 15, 12, 0, 0).getTime();

test('first correct answer schedules 1 day, second 6 days', () => {
  let c = review(newCard('a'), 4, NOW);
  assert.equal(c.interval, 1);
  assert.equal(c.reps, 1);
  c = review(c, 4, NOW);
  assert.equal(c.interval, 6);
  assert.equal(c.reps, 2);
});

test('third correct answer multiplies interval by ease', () => {
  let c = newCard('a');
  c = review(c, 4, NOW);
  c = review(c, 4, NOW);
  c = review(c, 4, NOW);
  assert.equal(c.ease, 2.5);
  assert.equal(c.interval, 15);
});

test('ease rises on easy and falls on hard', () => {
  assert.equal(review(newCard('a'), 5, NOW).ease, 2.6);
  assert.ok(Math.abs(review(newCard('a'), 3, NOW).ease - 2.36) < 1e-9);
});

test('ease never drops below the minimum', () => {
  let c = newCard('a');
  for (let i = 0; i < 20; i++) c = review(c, 0, NOW);
  assert.equal(c.ease, MIN_EASE);
});

test('a failed answer resets reps, counts a lapse and schedules tomorrow', () => {
  let c = review(newCard('a'), 4, NOW);
  c = review(c, 4, NOW);
  c = review(c, 1, NOW);
  assert.equal(c.reps, 0);
  assert.equal(c.lapses, 1);
  assert.equal(c.interval, 1);
  assert.equal(c.due, NOW + DAY_MS);
});

test('firstSeen is set once, on the first review only', () => {
  let c = review(newCard('a'), 4, NOW);
  assert.equal(c.firstSeen, NOW);
  c = review(c, 4, NOW + DAY_MS);
  assert.equal(c.firstSeen, NOW);
});

test('rejects quality outside 0..5 and non-integers', () => {
  assert.throws(() => review(newCard('a'), 6, NOW), RangeError);
  assert.throws(() => review(newCard('a'), -1, NOW), RangeError);
  assert.throws(() => review(newCard('a'), 3.5, NOW), RangeError);
});

test('isDue is false for unseen cards and true once due', () => {
  const c = review(newCard('a'), 4, NOW);
  assert.equal(isDue(newCard('x'), NOW), false);
  assert.equal(isDue(c, NOW), false);
  assert.equal(isDue(c, NOW + DAY_MS), true);
});

test('sessionQueue puts due reviews first and caps new words per day', () => {
  const words = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const cards = { a: review(newCard('a'), 4, NOW - 2 * DAY_MS) };
  const q = sessionQueue(words, cards, NOW, 2);
  assert.deepEqual(q.review, ['a']);
  assert.deepEqual(q.new, ['b', 'c']);
});

test('sessionQueue counts new words already introduced today against the cap', () => {
  const words = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const cards = { a: review(newCard('a'), 4, NOW) };
  const q = sessionQueue(words, cards, NOW + 1000, 2);
  assert.deepEqual(q.new, ['b']);
});
