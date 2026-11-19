import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState, validateState, emptyState, STORAGE_KEY, BACKUP_KEY } from '../src/store.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

test('empty storage yields a fresh state and no recovery flag', () => {
  const { state, recovered } = loadState(fakeStorage());
  assert.equal(recovered, false);
  assert.deepEqual(state, emptyState());
});

test('save then load round-trips the state', () => {
  const s = fakeStorage();
  const state = emptyState();
  state.cards.a = { id: 'a', ease: 2.5, interval: 1, reps: 1, lapses: 0, due: 1, seen: true, firstSeen: 1 };
  saveState(s, state);
  const { state: back, recovered } = loadState(s);
  assert.equal(recovered, false);
  assert.deepEqual(back.cards.a, state.cards.a);
});

test('corrupt JSON is backed up and replaced, never silently dropped', () => {
  const s = fakeStorage({ [STORAGE_KEY]: '{not json' });
  const { state, recovered } = loadState(s);
  assert.equal(recovered, true);
  assert.deepEqual(state, emptyState());
  assert.equal(s.data[BACKUP_KEY], '{not json');
});

test('wrong schema version is treated as unrecognised', () => {
  assert.equal(validateState({ schema: 99, cards: {}, mistakes: [] }), null);
});

test('invalid cards are dropped, valid ones kept', () => {
  const v = validateState({
    schema: 1,
    cards: { ok: { ease: 2.5, interval: 1, reps: 1, due: 5 }, bad: { ease: 'x' } },
    mistakes: [],
  });
  assert.deepEqual(Object.keys(v.cards), ['ok']);
});

test('bad settings fall back to defaults', () => {
  const v = validateState({ schema: 1, cards: {}, mistakes: [], settings: { theme: 'neon', newPerDay: 9999 } });
  assert.equal(v.settings.theme, 'auto');
  assert.equal(v.settings.newPerDay, 10);
});
