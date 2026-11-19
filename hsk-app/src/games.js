// Question builders for the minigames and placement test. Pure functions; rand is injectable.

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns `n` options including `target`, with distinct values for `key`.
export function pickOptions(target, pool, key, n = 4, rand = Math.random) {
  const seen = new Set([target[key]]);
  const distractors = [];
  for (const w of shuffle(pool, rand)) {
    if (w.id === target.id || seen.has(w[key])) continue;
    seen.add(w[key]);
    distractors.push(w);
    if (distractors.length === n - 1) break;
  }
  return shuffle([target, ...distractors], rand);
}

export function buildMatchRound(pool, size = 4, rand = Math.random) {
  const words = shuffle(pool, rand).slice(0, size);
  return { words, hanziOrder: shuffle(words, rand), meaningOrder: shuffle(words, rand) };
}

export function buildListenQuestion(target, pool, rand = Math.random) {
  return { target, options: pickOptions(target, pool, 'pinyin', 4, rand) };
}

export function buildMeaningQuestion(target, pool, rand = Math.random) {
  return { target, options: pickOptions(target, pool, 'vi', 4, rand) };
}
