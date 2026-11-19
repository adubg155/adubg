// Sentence-ordering exercise. Each round shows a Vietnamese sentence and the Chinese pieces in
// random order; the learner taps pieces to build the sentence. After checking, the sentence is
// shown in order; pieces with a grammar role (generated sentences) are colour-coded by role.
//
// round: { title, formula?, note?, gradeId?, sentence: { tokens: [{ text, pinyin, role }], text, pinyin, vi } }

import { ROLE_LABELS, checkOrder, scramble } from "./grammar.js";
import { esc } from "./games.js";

function poolChip(sentence, index) {
  return `<button class="chip" data-action="g-place" data-index="${index}">${esc(sentence.tokens[index].text)}</button>`;
}

function placedChip(sentence, index, position) {
  return `<button class="chip placed" data-action="g-unplace" data-position="${position}">${esc(sentence.tokens[index].text)}</button>`;
}

function resultChips(sentence) {
  return sentence.tokens.map((t) => `
    <span class="role-chip role-${esc(t.role || "none")}">
      <span class="role-hz">${esc(t.text)}</span>
      ${t.pinyin ? `<small>${esc(t.pinyin)}</small>` : ""}
      ${t.role ? `<small class="role-name">${esc(ROLE_LABELS[t.role] || t.role)}</small>` : ""}
    </span>`).join("");
}

function header(round, index, total) {
  return `
    <p class="hint">${index + 1}/${total} · ${esc(round.title)}</p>
    ${round.formula ? `<p class="formula">${esc(round.formula)}</p>` : ""}`;
}

// grade(round, ok) records the result; onDone({ total, correct }) ends the run.
export function renderOrder(root, rounds, grade, onDone, speak, canSpeak) {
  let index = 0;
  let correctCount = 0;
  let order = [];
  let placed = [];
  let result = null; // null while answering, then true/false

  function startRound() {
    order = scramble(rounds[index].sentence.tokens.length);
    placed = [];
    result = null;
    draw();
  }

  function drawAnswering(round) {
    const { sentence } = round;
    const pool = order.filter((i) => !placed.includes(i));
    root.innerHTML = `
      ${header(round, index, rounds.length)}
      <p class="prompt">Xếp thành câu: <strong>${esc(sentence.vi || "(nghe và xếp lại)")}</strong></p>
      <div class="answer-line">${placed.length
        ? placed.map((i, pos) => placedChip(sentence, i, pos)).join("")
        : `<span class="muted small">Chạm các mảnh bên dưới theo đúng thứ tự</span>`}</div>
      <div class="chip-pool">${pool.map((i) => poolChip(sentence, i)).join("")}</div>
      <div class="actions row">
        <button class="primary" data-action="g-check" ${placed.length === sentence.tokens.length ? "" : "disabled"}>Kiểm tra</button>
        <button data-action="g-clear" ${placed.length ? "" : "disabled"}>Xóa</button>
        ${canSpeak ? `<button data-action="g-speak">🔊 Gợi ý</button>` : ""}
      </div>`;
  }

  function drawResult(round) {
    const { sentence } = round;
    root.innerHTML = `
      ${header(round, index, rounds.length)}
      <p class="feedback ${result ? "ok" : "bad"}">${result ? "Đúng!" : "Chưa đúng. Câu đúng là:"}</p>
      <div class="sentence-roles">${resultChips(sentence)}</div>
      ${sentence.pinyin ? `<p class="pinyin small-pinyin">${esc(sentence.pinyin)}</p>` : ""}
      ${sentence.vi ? `<p>${esc(sentence.vi)}</p>` : ""}
      ${round.note ? `<p class="muted small">${esc(round.note)}</p>` : ""}
      <div class="actions row">
        ${canSpeak ? `<button data-action="g-speak">🔊 Nghe</button>` : ""}
        <button class="primary" data-action="g-next">${index + 1 < rounds.length ? "Câu tiếp" : "Xong"}</button>
      </div>`;
  }

  function draw() {
    const round = rounds[index];
    if (result === null) drawAnswering(round);
    else drawResult(round);
  }

  function check() {
    const round = rounds[index];
    result = checkOrder(round.sentence.tokens, placed);
    if (result) correctCount += 1;
    grade(round, result);
    draw();
    if (canSpeak) speak(round.sentence.text);
  }

  function next() {
    index += 1;
    if (index >= rounds.length) return onDone({ total: rounds.length, correct: correctCount });
    startRound();
  }

  const handlers = {
    "g-place": (el) => { placed = [...placed, Number(el.dataset.index)]; draw(); },
    "g-unplace": (el) => {
      const position = Number(el.dataset.position);
      placed = placed.filter((_, pos) => pos !== position);
      draw();
    },
    "g-clear": () => { placed = []; draw(); },
    "g-check": () => check(),
    "g-speak": () => speak(rounds[index].sentence.text),
    "g-next": () => next(),
  };

  root.onclick = (event) => {
    const el = event.target.closest("[data-action]");
    if (!el || el.disabled) return;
    const handler = handlers[el.dataset.action];
    if (handler) {
      event.stopPropagation();
      handler(el);
    }
  };

  startRound();
}
