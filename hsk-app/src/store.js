// Local persistence with a schema version. Storage is injected so tests can use a fake.

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'hsk-state';
export const BACKUP_KEY = 'hsk-state-backup';
export const MAX_MISTAKES = 500;

export function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    cards: {},
    mistakes: [],
    placement: null,
    settings: { theme: 'auto', newPerDay: 10 },
  };
}

function isValidCard(c) {
  return c && typeof c === 'object' && typeof c.id === 'string'
    && typeof c.ease === 'number' && typeof c.interval === 'number'
    && typeof c.reps === 'number' && typeof c.due === 'number';
}

// Returns a clean state or null if the object is not a state we understand.
export function validateState(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (obj.schema !== SCHEMA_VERSION) return null;
  if (!obj.cards || typeof obj.cards !== 'object' || Array.isArray(obj.cards)) return null;
  if (!Array.isArray(obj.mistakes)) return null;

  const base = emptyState();
  const cards = {};
  for (const [id, c] of Object.entries(obj.cards)) {
    if (isValidCard({ ...c, id })) cards[id] = { ...c, id };
  }
  const settings = { ...base.settings, ...(obj.settings || {}) };
  if (!['auto', 'light', 'dark'].includes(settings.theme)) settings.theme = 'auto';
  if (!Number.isInteger(settings.newPerDay) || settings.newPerDay < 1 || settings.newPerDay > 100) {
    settings.newPerDay = base.settings.newPerDay;
  }
  return {
    schema: SCHEMA_VERSION,
    cards,
    mistakes: obj.mistakes.filter((m) => m && typeof m.id === 'string').slice(-MAX_MISTAKES),
    placement: obj.placement && typeof obj.placement === 'object' ? obj.placement : null,
    settings,
  };
}

// Returns { state, recovered }. A corrupt value is copied to BACKUP_KEY before resetting,
// so a bad write never silently destroys the only copy of the user's progress.
export function loadState(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null || raw === undefined) return { state: emptyState(), recovered: false };
  let parsed = null;
  try {
    parsed = validateState(JSON.parse(raw));
  } catch {
    parsed = null;
  }
  if (parsed) return { state: parsed, recovered: false };
  storage.setItem(BACKUP_KEY, raw);
  return { state: emptyState(), recovered: true };
}

export function saveState(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
