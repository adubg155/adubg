// Flashcard sessions (spaced repetition) and the quick HSK placement check.
import { RATING, review, markKnown, isWeak, buildSession, shuffle, newBatchSize } from "../srs.js";
import { withFreshDay, withCard } from "../store.js";
import {
  app, getState, setState, cardOf, gradeCard, remainingReviews, remainingNew, go, showToast,
} from "../core.js";
import { data, lessonMeta, lessonShortLabel, parseScope, scopeWords } from "../data.js";
import { esc, speakButton } from "../ui.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const PLACEMENT_SIZE = 25;
const NEW_BATCH_FALLBACK = 5;

let session = null;
let placement = null;

function currentPath() {
  return location.hash.replace(/^#\/?/, "") || "home";
}

function normalizePinyin(text) {
  return String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/v/g, "u").replace(/[^a-z]/g, "");
}

function formatDuration(ms) {
  if (ms < MINUTE) return "dưới 1 phút";
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} phút`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} giờ`;
  return `${Math.round(ms / DAY)} ngày`;
}

function previewLabel(card, rating) {
  const now = Date.now();
  return formatDuration(review(card, rating, now).due - now);
}

function metaLine(word) {
  if (word.level) return `HSK ${word.level}${word.pos ? ` · ${esc(word.pos)}` : ""}`;
  return (word.lessons || []).slice(0, 3)
    .map((id) => lessonMeta(id))
    .filter(Boolean)
    .map((meta) => esc(lessonShortLabel(meta)))
    .join(" · ");
}

// kind: "due" (reviews + today's new words), "new" (new words only), "weak" (often-forgotten words).
export function startSession(kind, words) {
  setState(withFreshDay(getState()));
  const ids = words.map((w) => w.id);
  const now = Date.now();
  const { cards } = getState();
  let queue;
  if (kind === "weak") {
    const weak = ids.filter((id) => isWeak(cardOf(id)));
    queue = buildSession({ cards, wordIds: weak, now, reviewLimit: weak.length, newAllowed: 0, includeNotDue: true });
  } else if (kind === "new") {
    const newAllowed = newBatchSize({
      unseen: ids.filter((id) => cardOf(id).isNew).length,
      remainingToday: remainingNew(),
      batch: getState().settings.newPerDay || NEW_BATCH_FALLBACK,
    });
    queue = buildSession({ cards, wordIds: ids, now, reviewLimit: 0, newAllowed });
  } else {
    queue = buildSession({ cards, wordIds: ids, now, reviewLimit: remainingReviews(), newAllowed: remainingNew() });
  }
  if (queue.length === 0) {
    showToast(kind === "new" ? "Mục này đã học hết từ mới." : "Mục này hiện không có thẻ nào cần ôn.");
    return;
  }
  session = { queue, index: 0, reviewed: 0, phase: "prompt", typed: null, returnTo: currentPath() };
  go("review");
}

function viewSummary() {
  const { reviewed, returnTo } = session;
  session = null;
  app.innerHTML = `
    <section class="card hero">
      <h1>Xong</h1>
      <p>Bạn đã ôn <strong>${reviewed}</strong> thẻ.</p>
      <p class="muted">Các thẻ quên sẽ quay lại sớm hơn. Nghỉ một chút rồi ôn tiếp cũng được.</p>
    </section>
    <div class="actions">
      <button class="primary big" data-action="nav" data-target="${esc(returnTo)}">Quay lại</button>
      <button data-action="nav" data-target="home">Về Hôm nay</button>
    </div>`;
}

export function viewReview() {
  if (!session) return go("home");
  if (session.index >= session.queue.length) return viewSummary();
  const id = session.queue[session.index];
  const word = data.byId.get(id);
  if (!word) {
    session.index += 1;
    return viewReview();
  }
  const position = `${session.index + 1} / ${session.queue.length}`;
  if (session.phase === "prompt") {
    app.innerHTML = `
      <div class="progress-line">${position}</div>
      <section class="card study">
        <div class="big-hanzi" data-word="${esc(word.hanzi)}">${esc(word.hanzi)}</div>
        <p class="muted">Bạn có nhớ cách đọc và nghĩa không?</p>
        <label class="field">Gõ pinyin (không cần dấu thanh)
          <input id="typed" type="text" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>
        <button class="primary big" data-action="reveal">Hiện đáp án</button>
      </section>`;
    setTimeout(() => document.getElementById("typed")?.focus(), 0);
    return;
  }
  const card = cardOf(id);
  const typedOk = session.typed ? normalizePinyin(session.typed) === normalizePinyin(word.pinyin) : null;
  const ratings = [[RATING.AGAIN, "Quên", "bad"], [RATING.HARD, "Khó", "warn"], [RATING.GOOD, "Nhớ", "ok"], [RATING.EASY, "Dễ", "easy"]];
  app.innerHTML = `
    <div class="progress-line">${position}</div>
    <section class="card study">
      <div class="big-hanzi" data-word="${esc(word.hanzi)}">${esc(word.hanzi)}</div>
      <div class="pinyin">${esc(word.pinyin)}</div>
      ${word.meaningVi ? `<div class="meaning">${esc(word.meaningVi)}</div>` : ""}
      ${word.meaning ? `<div class="meaning-en">${esc(word.meaning)}</div>` : ""}
      <div class="meta">${metaLine(word)}</div>
      ${typedOk === null ? "" : `<p class="${typedOk ? "ok" : "bad"}">Bạn gõ: ${esc(session.typed)} — ${typedOk ? "đúng" : "chưa đúng"}</p>`}
      <div class="row center-row">${speakButton(word.hanzi)}
        <button class="small-btn" data-action="lookup" data-word="${esc(word.hanzi)}">Xem câu ví dụ</button></div>
    </section>
    <p class="muted center">Chọn mức độ nhớ. Thời gian bên dưới là lần ôn kế tiếp.</p>
    <div class="ratings">
      ${ratings.map(([rating, label, tone]) => `
        <button class="rate ${tone}" data-action="rate" data-rating="${rating}">
          <span>${label}</span><small>${previewLabel(card, rating)}</small>
        </button>`).join("")}
    </div>`;
}

// ---------- placement (HSK only) ----------

export function viewPlacement() {
  if (!placement) return go("hsk");
  if (placement.index >= placement.queue.length) {
    const { known, level } = placement;
    placement = null;
    app.innerHTML = `
      <section class="card hero">
        <h1>Xong</h1>
        <p>Bạn đã biết <strong>${known}</strong> từ HSK ${level}. Các từ này sẽ được ôn lại sau 14 ngày.</p>
      </section>
      <div class="actions"><button class="primary big" data-action="nav" data-target="hsk/${placement.kind === "hsk30" ? "3.0" : "2.0"}/${level}">Về HSK ${level}</button></div>`;
    return;
  }
  const word = data.byId.get(placement.queue[placement.index]);
  app.innerHTML = `
    <div class="progress-line">Kiểm tra nhanh HSK ${placement.level} · ${placement.index + 1} / ${placement.queue.length}</div>
    <section class="card study">
      <div class="big-hanzi" data-word="${esc(word.hanzi)}">${esc(word.hanzi)}</div>
      ${placement.revealed
        ? `<div class="pinyin">${esc(word.pinyin)}</div>${word.meaningVi ? `<div class="meaning">${esc(word.meaningVi)}</div>` : ""}<div class="meaning-en">${esc(word.meaning)}</div>`
        : `<p class="muted">Bạn có biết từ này không?</p>`}
    </section>
    ${placement.revealed
      ? `<div class="actions row">
           <button class="primary big" data-action="placement-answer" data-known="1">Đã biết</button>
           <button class="big" data-action="placement-answer" data-known="0">Chưa biết</button>
         </div>`
      : `<div class="actions"><button class="big" data-action="placement-reveal">Hiện nghĩa</button></div>`}`;
}

export const actions = {
  reveal: () => {
    const input = document.getElementById("typed");
    session.typed = input ? input.value.trim() : "";
    session.phase = "reveal";
    viewReview();
  },
  rate: ({ rating }) => {
    gradeCard(session.queue[session.index], Number(rating));
    session.reviewed += 1;
    session.index += 1;
    session.phase = "prompt";
    session.typed = null;
    viewReview();
  },
  "placement-start": ({ level, version }) => {
    const kind = version === "3.0" ? "hsk30" : "hsk";
    const pool = scopeWords(parseScope(`${kind}:${level}`)).filter((w) => cardOf(w.id).isNew).map((w) => w.id);
    if (pool.length === 0) return showToast(`Bạn đã bắt đầu học hết từ HSK ${level}.`);
    placement = { level: Number(level), kind, queue: shuffle(pool).slice(0, PLACEMENT_SIZE), index: 0, known: 0, revealed: false };
    go("placement");
  },
  "placement-reveal": () => {
    placement.revealed = true;
    viewPlacement();
  },
  "placement-answer": ({ known }) => {
    const id = placement.queue[placement.index];
    if (known === "1") {
      setState(withCard(getState(), id, markKnown(cardOf(id), Date.now())));
      placement.known += 1;
    }
    placement.index += 1;
    placement.revealed = false;
    viewPlacement();
  },
};
