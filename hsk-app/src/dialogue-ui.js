// Dialogue practice: the learner plays role B. A's lines are shown (and spoken); at each B line
// the learner picks the right reply from three options taken from the same textbook.
import { esc } from "./games.js";
import { shuffle } from "./srs.js";

const OPTION_COUNT = 3;
const LEARNER_ROLE = "B";

function bubble(turn, extra = "") {
  return `<div class="sent bubble bubble-${turn.r === "A" ? "a" : "b"} ${extra}">
    <span class="who">${esc(turn.r)}</span>
    <div class="sent-zh">${esc(turn.zh)}</div>
    ${turn.p ? `<div class="sent-py">${esc(turn.p)}</div>` : ""}
    <div class="sent-vi">${esc(turn.vi)}</div>
  </div>`;
}

// turns: [{ r, zh, p, vi }] in order; pool: other B lines used as wrong options.
export function renderDialogue(root, title, turns, pool, onDone, speak, canSpeak) {
  let index = 0;
  let correct = 0;
  let asked = 0;
  let options = [];
  let answered = null;

  function optionsFor(turn) {
    const wrong = shuffle(pool.filter((t) => t.zh !== turn.zh)).slice(0, OPTION_COUNT - 1);
    return shuffle([turn, ...wrong]);
  }

  function advance() {
    while (index < turns.length && turns[index].r !== LEARNER_ROLE) {
      if (canSpeak && index === turns.length - 1) speak(turns[index].zh);
      index += 1;
    }
    if (index >= turns.length) return draw();
    options = optionsFor(turns[index]);
    answered = null;
    if (canSpeak && index > 0) speak(turns[index - 1].zh);
    draw();
  }

  function draw() {
    const history = turns.slice(0, index).map((t) => bubble(t)).join("");
    if (index >= turns.length) {
      root.innerHTML = `<p class="hint">${esc(title)}</p>${history}
        <p class="feedback ok">Hết hội thoại. Bạn chọn đúng ${correct}/${asked} lượt.</p>
        <div class="actions"><button class="primary" data-action="dl-done">Xong</button></div>`;
      return;
    }
    const turn = turns[index];
    root.innerHTML = `
      <p class="hint">${esc(title)} · Bạn là ${LEARNER_ROLE}</p>
      <div class="dialogue-history">${history}</div>
      ${answered === null
        ? `<p class="prompt">Bạn trả lời thế nào?</p>
           <div class="option-list">${options.map((o, i) => `
             <button class="option" data-action="dl-pick" data-index="${i}">${esc(o.zh)}</button>`).join("")}</div>`
        : `<p class="feedback ${answered ? "ok" : "bad"}">${answered ? "Đúng!" : "Chưa đúng. Câu đúng là:"}</p>
           ${bubble(turn, "highlight")}
           <div class="actions row">
             ${canSpeak ? `<button data-action="dl-speak">🔊 Nghe</button>` : ""}
             <button class="primary" data-action="dl-next">Tiếp</button>
           </div>`}`;
    root.querySelector(".dialogue-history")?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }

  const handlers = {
    "dl-pick": (el) => {
      if (answered !== null) return;
      asked += 1;
      answered = options[Number(el.dataset.index)].zh === turns[index].zh;
      if (answered) correct += 1;
      if (canSpeak) speak(turns[index].zh);
      draw();
    },
    "dl-speak": () => speak(turns[index].zh),
    "dl-next": () => { index += 1; advance(); },
    "dl-done": () => onDone({ total: asked, correct }),
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

  advance();
}
