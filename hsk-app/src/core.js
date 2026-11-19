// Shared app state and services used by every view: progress (cards), scope, navigation, toast,
// speech. Views import from here; app.js wires the router in with setRouter().
import { newCard, review, queueNow } from "./srs.js";
import { loadState, saveState, withFreshDay, withCard, bumpDaily } from "./store.js";
import { speakChinese, isAudioAvailable } from "./audio.js";
import { parseScope, scopeKey } from "./data.js";

const TOAST_MS = 2200;

export const app = document.getElementById("app");
const toastEl = document.getElementById("toast");

let state = null;
let toastTimer = null;
let router = () => {};

export function initState() {
  state = withFreshDay(loadState());
}

export function getState() {
  return state;
}

export function setState(next) {
  state = next;
  saveState(state);
}

export function cardOf(id) {
  return state.cards[id] || newCard();
}

// countDaily=false is used by games and grammar practice: the SRS schedule is updated, but the
// daily counters that limit flashcard sessions are left alone.
export function gradeCard(id, rating, { countDaily = true } = {}) {
  let next = withFreshDay(state);
  const before = next.cards[id] || newCard();
  next = withCard(next, id, review(before, rating, Date.now()));
  if (countDaily) next = bumpDaily(next, { isNew: before.isNew });
  setState(next);
}

export function queueCard(id) {
  setState(withCard(state, id, queueNow(cardOf(id), Date.now())));
}

export function remainingReviews() {
  return Math.max(0, state.settings.reviewLimit - state.daily.reviewCount);
}

export function remainingNew() {
  return Math.max(0, state.settings.newPerDay - state.daily.newCount);
}

export function countDue(ids, now = Date.now()) {
  return ids.filter((id) => {
    const card = state.cards[id];
    return card && !card.isNew && card.due <= now;
  }).length;
}

export function currentScope() {
  return parseScope(state.settings.scope);
}

export function setScope(scope) {
  setState({ ...state, settings: { ...state.settings, scope: scopeKey(scope) } });
}

export function setSetting(key, value) {
  setState({ ...state, settings: { ...state.settings, [key]: value } });
}

export function setRouter(fn) {
  router = fn;
}

export function go(path) {
  const target = `#/${path}`;
  if (location.hash === target) router();
  else location.hash = target;
}

export function rerender() {
  router();
}

export function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, TOAST_MS);
}

export function speak(text) {
  return speakChinese(text);
}

export function canSpeak() {
  return isAudioAvailable();
}
