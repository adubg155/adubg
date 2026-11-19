// Minigames used as review. Each game receives a pool of words and a grade(id, rating) callback,
// so every answer feeds the same spaced-repetition schedule as flashcards.

import { RATING } from "./srs.js";
import { shuffle } from "./srs.js";

const MATCH_ROUND_SIZE = 5;
const LISTEN_ROUNDS = 8;
const NEXT_DELAY_MS = 900;

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function shortMeaning(meaning, max = 36) {
  const first = String(meaning || "").split(";")[0].trim();
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

// Matching game: tap a hanzi, then its meaning. Wrong taps on a word lower its rating.
export function renderMatch(root, pool, grade, onDone) {
  const withVi = pool.filter((w) => w.meaningVi);
  const usable = withVi.length >= MATCH_ROUND_SIZE ? withVi : pool;
  const round = shuffle(usable).slice(0, MATCH_ROUND_SIZE);
  const wrongTaps = new Map();
  const matched = new Set();
  let selected = null;

  const leftOrder = shuffle(round);
  const rightOrder = shuffle(round);

  function draw() {
    const left = leftOrder.map((w) => {
      const classes = [
        "tile",
        matched.has(w.id) ? "done" : "",
        selected && selected.id === w.id ? "selected" : "",
      ].join(" ");
      return `<button class="${classes}" data-action="match-left" data-id="${esc(w.id)}" ${matched.has(w.id) ? "disabled" : ""}>${esc(w.hanzi)}</button>`;
    });
    const right = rightOrder.map((w) => {
      const classes = ["tile", "meaning", matched.has(w.id) ? "done" : ""].join(" ");
      return `<button class="${classes}" data-action="match-right" data-id="${esc(w.id)}" ${matched.has(w.id) ? "disabled" : ""}>${esc(shortMeaning(w.meaningVi || w.meaning, 40))}</button>`;
    });
    root.innerHTML = `
      <p class="hint">Chạm hán tự, rồi chạm đúng nghĩa.</p>
      <div class="match-grid">
        <div class="col">${left.join("")}</div>
        <div class="col">${right.join("")}</div>
      </div>
      <p class="feedback" id="game-feedback"></p>`;
  }

  function flash(message, ok) {
    const el = root.querySelector("#game-feedback");
    if (!el) return;
    el.textContent = message;
    el.className = `feedback ${ok ? "ok" : "bad"}`;
  }

  function handleLeft(id) {
    selected = { id };
    draw();
  }

  function handleRight(id) {
    if (!selected) return flash("Chọn hán tự trước.", false);
    const pickedId = selected.id;
    selected = null;
    if (pickedId === id) {
      matched.add(id);
      const rating = wrongTaps.get(id) ? RATING.HARD : RATING.GOOD;
      grade(id, rating);
      flash("Đúng!", true);
      draw();
      if (matched.size === round.length) {
        setTimeout(() => onDone({ total: round.length }), NEXT_DELAY_MS);
      }
    } else {
      wrongTaps.set(pickedId, (wrongTaps.get(pickedId) || 0) + 1);
      flash("Chưa đúng, thử lại.", false);
      draw();
    }
  }

  root.onclick = (event) => {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "match-left") handleLeft(el.dataset.id);
    if (el.dataset.action === "match-right") handleRight(el.dataset.id);
  };

  draw();
}

// Listening game: hear the word (or see it when speech is unavailable), pick the right pinyin.
export function renderListen(root, pool, grade, onDone, speak, canSpeak) {
  const rounds = shuffle(pool).slice(0, LISTEN_ROUNDS);
  let index = 0;
  let answered = false;
  let correctCount = 0;

  function options(target) {
    const others = pool
      .filter((w) => w.pinyin !== target.pinyin)
      .map((w) => w.pinyin);
    const distractors = shuffle([...new Set(others)]).slice(0, 3);
    return shuffle([target.pinyin, ...distractors]);
  }

  function draw() {
    if (index >= rounds.length) {
      return onDone({ total: rounds.length, correct: correctCount });
    }
    const target = rounds[index];
    answered = false;
    root.innerHTML = `
      <p class="hint">Nghe rồi chọn cách đọc đúng. (${index + 1}/${rounds.length})</p>
      <div class="listen-stage">
        <div class="big-hanzi">${esc(target.hanzi)}</div>
        ${canSpeak ? `<button class="speak-big" data-action="listen-speak">🔊 Nghe lại</button>` : ""}
      </div>
      <div class="choices">
        ${options(target).map((p) => `<button class="choice" data-action="listen-choice" data-pinyin="${esc(p)}">${esc(p)}</button>`).join("")}
      </div>
      <p class="feedback" id="game-feedback"></p>`;
    if (canSpeak) speak(target.hanzi);
    root.dataset.targetId = target.id;
  }

  function choose(pinyin, button) {
    if (answered) return;
    answered = true;
    const target = rounds[index];
    const ok = pinyin === target.pinyin;
    if (ok) correctCount += 1;
    grade(target.id, ok ? RATING.GOOD : RATING.AGAIN);
    button.classList.add(ok ? "right" : "wrong");
    const feedback = root.querySelector("#game-feedback");
    feedback.textContent = ok
      ? `Đúng! ${target.hanzi} (${target.pinyin}): ${target.meaningVi}`
      : `Đáp án: ${target.pinyin} — ${target.hanzi}: ${target.meaningVi} (${target.meaning})`;
    feedback.className = `feedback ${ok ? "ok" : "bad"}`;
    setTimeout(() => {
      index += 1;
      draw();
    }, NEXT_DELAY_MS * 2);
  }

  root.onclick = (event) => {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "listen-speak") speak(rounds[index].hanzi);
    if (el.dataset.action === "listen-choice") choose(el.dataset.pinyin, el);
  };

  draw();
}
