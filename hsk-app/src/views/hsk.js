// "Giáo trình HSK": choose HSK 3.0 (levels 1–6, default) or HSK 2.0 (textbook 1–4), then
// Từ vựng / Ngữ pháp / Dễ nhầm. HSK 3.0 has words only for now.
import { app, currentScope, go, rerender, getState, setSetting } from "../core.js";
import {
  data, HSK_LEVELS, HSK30_LEVELS, scopeWords, scopeGrammar, scopeKey, parseScope,
} from "../data.js";
import {
  esc, progressOf, progressBar, tabsHtml, wordRows, statusLegend, scopeButton, grammarCardHtml, pairsHtml,
} from "../ui.js";
import { startSession } from "./review.js";

const WORD_PAGE = 60;
let wordLimit = WORD_PAGE;
let hsk4Part = "";
let hsk4Group = "";

const VERSIONS = {
  "3.0": { levels: HSK30_LEVELS, label: "HSK 3.0", kind: "hsk30", hash: "3.0" },
  "2.0": { levels: HSK_LEVELS, label: "HSK 2.0", kind: "hsk", hash: "2.0" },
};

function currentVersion() {
  return getState().settings.hskVersion === "2.0" ? "2.0" : "3.0";
}

function pairsFor(level) {
  return data.pairs.filter((p) => p.levels === (level === 4 ? "4" : "1-3"));
}

function versionSwitch(active) {
  return `<div class="seg" role="group" aria-label="Phiên bản HSK">
    ${["3.0", "2.0"].map((v) => `<button class="${v === active ? "active" : ""}" data-action="set-hsk-version" data-version="${v}">${VERSIONS[v].label}</button>`).join("")}
  </div>`;
}

function viewLevels() {
  const version = currentVersion();
  const cfg = VERSIONS[version];
  app.innerHTML = `
    <h1>📘 Giáo trình HSK</h1>
    ${versionSwitch(version)}
    <p class="muted">${version === "3.0"
      ? "HSK 3.0, cấp 1–6. Chọn cấp để học từ vựng."
      : "HSK 2.0 (giáo trình 1–4). Chọn cấp để xem từ vựng, ngữ pháp và các cặp dễ nhầm."}</p>
    <div class="level-list">${cfg.levels.map((level) => {
      const scope = parseScope(`${cfg.kind}:${level}`);
      const progress = progressOf(scopeWords(scope).map((w) => w.id));
      const grammar = version === "2.0" ? scopeGrammar(scope).length : 0;
      return `<a class="card level-row" href="#/hsk/${cfg.hash}/${level}">
        <div class="level-badge">HSK<br><strong>${level}</strong></div>
        <div class="grow">
          <div class="row between"><strong>${progress.total} từ${grammar ? ` · ${grammar} mẫu ngữ pháp` : ""}</strong>
            ${scopeKey(currentScope()) === `${cfg.kind}:${level}` ? `<span class="badge current">Đang học</span>` : ""}</div>
          ${progressBar(progress)}
          <small class="muted">${progress.mastered} đã thuộc · ${progress.learning} đang ôn · ${progress.fresh} chưa học</small>
        </div>
      </a>`;
    }).join("")}</div>
    <div class="actions"><button data-action="set-scope" data-scope="${cfg.kind}:all">Học tất cả ${cfg.label} cùng lúc</button></div>`;
}

// Bottom bar of the word list: listening, a quick check, and two sections that are not built yet.
function subBar(level, version) {
  return `<nav class="subbar" aria-label="Chức năng khác">
    <button data-action="practice" data-mode="listen" data-scope="${VERSIONS[version].kind}:${level}">🎧<span>Luyện nghe</span></button>
    <button data-action="placement-start" data-level="${level}" data-version="${version}">📝<span>Kiểm tra</span></button>
    <button data-action="coming-soon">📚<span>Bài đọc</span></button>
    <button data-action="coming-soon">🧩<span>Tiện ích</span></button>
  </nav>`;
}

function wordsTab(level, scope, version) {
  const words = scopeWords(scope);
  const progress = progressOf(words.map((w) => w.id));
  return `
    <section class="card">
      ${progressBar(progress)}
      <p class="small muted">${progress.mastered} đã thuộc · ${progress.learning} đang ôn · ${progress.fresh} chưa học</p>
      <div class="actions row">
        <button class="primary" data-action="scope-start" data-scope="${scope.kind}:${level}" data-kind="new">Học từ mới</button>
        <button data-action="scope-start" data-scope="${scope.kind}:${level}" data-kind="due">Ôn</button>
      </div>
    </section>
    ${statusLegend()}
    ${wordRows(words.slice(0, wordLimit))}
    ${words.length > wordLimit ? `<div class="actions"><button data-action="more-words">Xem thêm (${words.length - wordLimit})</button></div>` : ""}
    ${subBar(level, version)}`;
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

// Route: #/hsk → levels; #/hsk/3.0/4[/tab] (HSK 3.0); #/hsk/2.0/4[/tab] (HSK 2.0); #/hsk/4 is HSK 2.0 (old links).
export function viewHsk(args) {
  const parts = [...args];
  let version = currentVersion();
  if (parts[0] === "3.0" || parts[0] === "2.0") version = parts.shift();
  if (!parts[0]) return viewLevels();

  const cfg = VERSIONS[version];
  const level = Number(parts[0]);
  const tab = parts[1] || "words";
  if (!cfg.levels.includes(level)) return go(`hsk/${cfg.hash}`);

  const scope = parseScope(`${cfg.kind}:${level}`);
  const isCurrent = scopeKey(currentScope()) === scopeKey(scope);
  const is20 = version === "2.0";
  const tabs = is20
    ? [
      { id: "words", label: "Từ vựng", count: scopeWords(scope).length },
      { id: "grammar", label: "Ngữ pháp", count: scopeGrammar(scope).length },
      { id: "pairs", label: "Dễ nhầm", count: pairsFor(level).length },
    ]
    : [{ id: "words", label: "Từ vựng", count: scopeWords(scope).length }];
  const active = tabs.some((t) => t.id === tab) ? tab : "words";
  const body = active === "words" ? wordsTab(level, scope, version)
    : active === "grammar" ? grammarTab(level, scope)
      : pairsHtml(pairsFor(level));
  app.innerHTML = `
    <a class="back-link" href="#/hsk/${cfg.hash}">‹ ${cfg.label}</a>
    <div class="row between page-head"><h1>${cfg.label} · cấp ${level}</h1>${scopeButton(scope, isCurrent)}</div>
    ${tabsHtml(`hsk/${cfg.hash}/${level}`, tabs, active)}
    ${body}`;
}

export const actions = {
  "scope-start": ({ scope, kind }) => startSession(kind, scopeWords(parseScope(scope))),
  "more-words": () => {
    wordLimit += WORD_PAGE;
    rerender();
  },
  "set-hsk-version": ({ version }) => {
    if (!VERSIONS[version]) return;
    setSetting("hskVersion", version);
    wordLimit = WORD_PAGE;
    go(`hsk/${VERSIONS[version].hash}`);
  },
  "hsk4-part": ({ part }) => {
    hsk4Part = part;
    rerender();
  },
  "hsk4-group": ({ value }) => {
    hsk4Group = value;
    rerender();
  },
  "coming-soon": () => {
    window.alert("Mục này sẽ có trong bản sau.");
  },
};
