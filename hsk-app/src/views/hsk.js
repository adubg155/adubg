// "Giáo trình HSK": choose a level (HSK 1–4), then Từ vựng / Ngữ pháp / Dễ nhầm.
import { app, currentScope, go, rerender } from "../core.js";
import { data, HSK_LEVELS, scopeWords, scopeGrammar, scopeKey, parseScope } from "../data.js";
import {
  esc, progressOf, progressBar, tabsHtml, wordRows, statusLegend, scopeButton, grammarCardHtml, pairsHtml,
} from "../ui.js";
import { startSession } from "./review.js";

const WORD_PAGE = 60;
let wordLimit = WORD_PAGE;
let hsk4Part = "";
let hsk4Group = "";

function pairsFor(level) {
  return data.pairs.filter((p) => p.levels === (level === 4 ? "4" : "1-3"));
}

function viewLevels() {
  app.innerHTML = `
    <h1>📘 Giáo trình HSK</h1>
    <p class="muted">Chọn cấp để xem từ vựng, ngữ pháp và các cặp dễ nhầm.</p>
    <div class="level-list">${HSK_LEVELS.map((level) => {
      const scope = parseScope(`hsk:${level}`);
      const progress = progressOf(scopeWords(scope).map((w) => w.id));
      const grammar = scopeGrammar(scope).length;
      return `<a class="card level-row" href="#/hsk/${level}">
        <div class="level-badge">HSK<br><strong>${level}</strong></div>
        <div class="grow">
          <div class="row between"><strong>${progress.total} từ · ${grammar} mẫu ngữ pháp</strong>
            ${scopeKey(currentScope()) === `hsk:${level}` ? `<span class="badge current">Đang học</span>` : ""}</div>
          ${progressBar(progress)}
          <small class="muted">${progress.mastered} đã thuộc · ${progress.learning} đang ôn · ${progress.fresh} chưa học</small>
        </div>
      </a>`;
    }).join("")}</div>
    <div class="actions"><button data-action="set-scope" data-scope="hsk:all">Học tất cả HSK cùng lúc</button></div>`;
}

function wordsTab(level, scope) {
  const words = scopeWords(scope);
  const progress = progressOf(words.map((w) => w.id));
  return `
    <section class="card">
      ${progressBar(progress)}
      <p class="small muted">${progress.mastered} đã thuộc · ${progress.learning} đang ôn · ${progress.fresh} chưa học</p>
      <div class="actions row">
        <button class="primary" data-action="scope-start" data-scope="hsk:${level}" data-kind="new">Học từ mới</button>
        <button data-action="scope-start" data-scope="hsk:${level}" data-kind="due">Ôn</button>
        <button data-action="placement-start" data-level="${level}">Kiểm tra nhanh</button>
      </div>
    </section>
    ${statusLegend()}
    ${wordRows(words.slice(0, wordLimit))}
    ${words.length > wordLimit ? `<div class="actions"><button data-action="more-words">Xem thêm (${words.length - wordLimit})</button></div>` : ""}`;
}

function grammarTab(level, scope) {
  let points = scopeGrammar(scope);
  let filters = "";
  if (level === 4) {
    points = points.filter((p) => !hsk4Part || p.part === hsk4Part);
    const groups = [...new Set(points.map((p) => p.group))].sort((a, b) => a.localeCompare(b, "vi"));
    if (hsk4Group && !groups.includes(hsk4Group)) hsk4Group = "";
    points = points.filter((p) => !hsk4Group || p.group === hsk4Group);
    filters = `<div class="filters">
      ${["", "Thượng", "Hạ"].map((part) => `<button class="chip-btn ${part === hsk4Part ? "active" : ""}" data-action="hsk4-part" data-part="${part}">${part || "Tất cả"}</button>`).join("")}
      <select data-change="hsk4-group" aria-label="Nhóm chức năng">
        <option value="">Mọi nhóm</option>
        ${groups.map((g) => `<option value="${esc(g)}" ${g === hsk4Group ? "selected" : ""}>${esc(g)}</option>`).join("")}
      </select>
    </div>`;
  }
  return `${filters}
    <div class="actions"><button class="primary" data-action="practice" data-mode="grammar-due" data-scope="hsk:${level}">Luyện ngữ pháp HSK ${level}</button></div>
    ${points.length ? points.map(grammarCardHtml).join("") : `<p class="card muted">Không có mẫu nào khớp bộ lọc.</p>`}`;
}

export function viewHsk([levelText, tab = "words"]) {
  if (!levelText) return viewLevels();
  const level = Number(levelText);
  if (!HSK_LEVELS.includes(level)) return go("hsk");
  const scope = parseScope(`hsk:${level}`);
  const isCurrent = scopeKey(currentScope()) === scopeKey(scope);
  const tabs = [
    { id: "words", label: "Từ vựng", count: scopeWords(scope).length },
    { id: "grammar", label: "Ngữ pháp", count: scopeGrammar(scope).length },
    { id: "pairs", label: "Dễ nhầm", count: pairsFor(level).length },
  ];
  const active = tabs.some((t) => t.id === tab) ? tab : "words";
  const body = active === "words" ? wordsTab(level, scope)
    : active === "grammar" ? grammarTab(level, scope)
      : pairsHtml(pairsFor(level));
  app.innerHTML = `
    <a class="back-link" href="#/hsk">‹ Giáo trình HSK</a>
    <div class="row between page-head"><h1>HSK ${level}</h1>${scopeButton(scope, isCurrent)}</div>
    ${tabsHtml(`hsk/${level}`, tabs, active)}
    ${body}`;
}

export const actions = {
  "scope-start": ({ scope, kind }) => startSession(kind, scopeWords(parseScope(scope))),
  "more-words": () => {
    wordLimit += WORD_PAGE;
    rerender();
  },
  "hsk4-part": ({ part }) => {
    hsk4Part = part;
    rerender();
  },
  "hsk4-group": ({ value }) => {
    hsk4Group = value;
    rerender();
  },
};
