// SM-2 spaced repetition. Pure functions, no DOM or storage access.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

export function newCard(id) {
  return { id, ease: DEFAULT_EASE, interval: 0, reps: 0, lapses: 0, due: 0, seen: false, firstSeen: 0 };
}

// quality: 0..5 (SM-2 scale). The UI maps: Quên=1, Khó=3, Ổn=4, Dễ=5.
export function review(card, quality, now = Date.now()) {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new RangeError('quality must be an integer 0..5');
  }
  const c = { ...newCard(card.id), ...card };
  if (!c.seen) {
    c.seen = true;
    c.firstSeen = now;
  }
  if (quality < 3) {
    c.reps = 0;
    c.interval = 1;
    c.lapses += 1;
  } else {
    if (c.reps === 0) c.interval = 1;
    else if (c.reps === 1) c.interval = 6;
    else c.interval = Math.round(c.interval * c.ease);
    c.reps += 1;
  }
  const penalty = 5 - quality;
  c.ease = Math.max(MIN_EASE, c.ease + (0.1 - penalty * (0.08 + penalty * 0.02)));
  c.due = now + c.interval * DAY_MS;
  return c;
}

export function isDue(card, now = Date.now()) {
  return Boolean(card && card.seen && card.due <= now);
}

export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Builds today's queue: due reviews first, then new words limited by newPerDay.
export function sessionQueue(words, cards, now = Date.now(), newPerDay = 10) {
  const today = startOfDay(now);
  const introducedToday = Object.values(cards).filter((c) => c.seen && c.firstSeen >= today).length;
  const budget = Math.max(0, newPerDay - introducedToday);
  const reviewIds = [];
  const newIds = [];
  for (const w of words) {
    const c = cards[w.id];
    if (c && c.seen) {
      if (isDue(c, now)) reviewIds.push(w.id);
    } else {
      newIds.push(w.id);
    }
  }
  return { review: reviewIds, new: newIds.slice(0, budget) };
}
