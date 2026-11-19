// Spaced-repetition scheduling (SM-2 style). Pure functions only: no DOM, no storage.

export const RATING = Object.freeze({ AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 });

const MINUTE = 60_000;
const DAY = 86_400_000;
const MIN_EASE = 1.3;
const START_EASE = 2.5;
const RELEARN_DELAY_MS = 10 * MINUTE;
const MASTERED_INTERVAL_DAYS = 21;
const WEAK_LAPSES = 2;
const PLACEMENT_INTERVAL_DAYS = 14;
const PLACEMENT_REPS = 3;

export function newCard(now = Date.now()) {
  return { ease: START_EASE, interval: 0, reps: 0, lapses: 0, due: now, last: null, isNew: true };
}

export function review(card, rating, now = Date.now()) {
  const next = { ...card, last: now, isNew: false };

  if (rating === RATING.AGAIN) {
    next.lapses += 1;
    next.reps = 0;
    next.interval = 0;
    next.ease = Math.max(MIN_EASE, next.ease - 0.2);
    next.due = now + RELEARN_DELAY_MS;
    return next;
  }

  if (rating === RATING.HARD) {
    next.ease = Math.max(MIN_EASE, next.ease - 0.15);
    next.interval = next.reps === 0 ? 1 : Math.max(1, Math.round(next.interval * 1.2));
  } else if (rating === RATING.GOOD) {
    if (next.reps === 0) next.interval = 1;
    else if (next.reps === 1) next.interval = 3;
    else next.interval = Math.round(next.interval * next.ease);
  } else {
    next.ease += 0.15;
    next.interval = next.reps === 0 ? 4 : Math.round(next.interval * next.ease * 1.3);
  }

  next.reps += 1;
  next.due = now + next.interval * DAY;
  return next;
}

// Used by the placement test: a word the user already knows starts with a longer interval.
export function markKnown(card, now = Date.now()) {
  return {
    ...card,
    ease: START_EASE,
    interval: PLACEMENT_INTERVAL_DAYS,
    reps: PLACEMENT_REPS,
    due: now + PLACEMENT_INTERVAL_DAYS * DAY,
    last: now,
    isNew: false,
  };
}

// "Add to review" from a word popup: the card enters learning and is due now. Unlike an AGAIN
// rating it does not count as a lapse.
export function queueNow(card, now = Date.now()) {
  return { ...card, isNew: false, interval: 0, reps: 0, due: now, last: card.last };
}

export function isMastered(card) {
  return !card.isNew && card.interval >= MASTERED_INTERVAL_DAYS;
}

export function isWeak(card) {
  return !card.isNew && card.lapses >= WEAK_LAPSES;
}

export function shuffle(items, rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Builds one study session from word ids.
// - Due reviews come first (most overdue first), capped by reviewLimit.
// - New words are added only up to newAllowed, in the order given (lowest HSK level first).
// - includeNotDue=true also pulls reviewed words that are not due yet (used by the "weak words" session).
// The result is shuffled so reviews and new words interleave.
export function buildSession({
  cards,
  wordIds,
  now = Date.now(),
  reviewLimit = 40,
  newAllowed = 0,
  includeNotDue = false,
  rng = Math.random,
}) {
  const reviewable = [];
  const fresh = [];

  for (const id of wordIds) {
    const card = cards[id];
    if (!card || card.isNew) {
      fresh.push(id);
    } else if (includeNotDue || card.due <= now) {
      reviewable.push(id);
    }
  }

  reviewable.sort((a, b) => cards[a].due - cards[b].due);
  const reviews = reviewable.slice(0, Math.max(0, reviewLimit));
  const news = fresh.slice(0, Math.max(0, newAllowed));
  return shuffle([...reviews, ...news], rng);
}

// How many new words a "learn new words" session should offer. Uses what is left of today's quota
// first; once the quota is used up, the learner asked for more on purpose, so give one extra batch.
export function newBatchSize({ unseen, remainingToday, batch }) {
  const wanted = remainingToday > 0 ? remainingToday : batch;
  return Math.max(0, Math.min(wanted, unseen));
}
