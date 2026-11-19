// Progress persistence in localStorage. Every read/write is guarded: storage can be
// unavailable (private mode, blocked site data), in which case the app still runs in memory.

const STORAGE_KEY = "hsk-progress-v1";
// scope: what the learner is studying now, e.g. "hsk:all", "hsk:3", "work:all", "work:q1-07".
const DEFAULT_SETTINGS = Object.freeze({ reviewLimit: 40, newPerDay: 5, scope: "hsk:all" });

// v3 stored settings.track ("hsk" or a job domain); v4 uses a scope instead.
function migrateSettings(saved = {}) {
  const { track, ...rest } = saved;
  const settings = { ...DEFAULT_SETTINGS, ...rest };
  if (track && !saved.scope) settings.scope = track === "hsk" ? "hsk:all" : "work:all";
  return settings;
}

export const DEFAULT_TRACK = "hsk";

// Card keys are "track:hanzi" so the same hanzi can exist in several tracks (HSK, office, factory).
export function trackKey(track, hanzi) {
  return `${track}:${hanzi}`;
}

export const WORK_TRACK = "work";
// Job domains from v3, replaced by the shared work deck built from the textbook lessons.
const LEGACY_DOMAINS = new Set(["office", "factory", "electronics", "logistics", "admin"]);

function practice(card) {
  return (card && card.reps) || 0;
}

// Normalises saved card keys:
// - bare hanzi (before tracks existed) -> "hsk:hanzi"; an existing prefixed card wins;
// - old job-domain keys ("office:合同") -> "work:合同"; the more practised card wins.
// Other keys (hsk:, work:, grammar:) are kept as they are.
export function migrateCardKeys(cards) {
  const out = {};
  const entries = Object.entries(cards);
  for (const [key, card] of entries) {
    const track = key.split(":")[0];
    if (key.includes(":") && !LEGACY_DOMAINS.has(track)) out[key] = card;
  }
  for (const [key, card] of entries) {
    const separator = key.indexOf(":");
    if (separator < 0 || !LEGACY_DOMAINS.has(key.slice(0, separator))) continue;
    const target = trackKey(WORK_TRACK, key.slice(separator + 1));
    if (!(target in out) || practice(card) > practice(out[target])) out[target] = card;
  }
  for (const [key, card] of entries) {
    if (key.includes(":")) continue;
    const prefixed = trackKey(DEFAULT_TRACK, key);
    if (!(prefixed in out)) out[prefixed] = card;
  }
  return out;
}

export function emptyState() {
  return {
    cards: {},
    daily: { date: "", newCount: 0, reviewCount: 0 },
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.warn("Could not read saved progress", error);
    return emptyState();
  }
}

// Fills in missing fields and migrates old card keys. Used for saved data and imported backups.
export function normalizeState(parsed) {
  return {
    ...emptyState(),
    ...parsed,
    cards: migrateCardKeys(parsed.cards || {}),
    settings: migrateSettings(parsed.settings),
  };
}

export function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn("Could not save progress", error);
    return false;
  }
}

export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Returns a copy of state with daily counters reset if the day changed.
export function withFreshDay(state, date = todayKey()) {
  if (state.daily.date === date) return state;
  return { ...state, daily: { date, newCount: 0, reviewCount: 0 } };
}

export function withCard(state, id, card) {
  return { ...state, cards: { ...state.cards, [id]: card } };
}

export function bumpDaily(state, { isNew }) {
  const daily = {
    ...state.daily,
    newCount: state.daily.newCount + (isNew ? 1 : 0),
    reviewCount: state.daily.reviewCount + (isNew ? 0 : 1),
  };
  return { ...state, daily };
}
