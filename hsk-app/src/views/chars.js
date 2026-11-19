// "Chữ Hán": a grid of HSK 3.0 characters. Tap a cell for its pinyin, meaning and words that use it.
// The level list and page size are data-driven: a new level file in data/hsk30/ shows up here
// after it is listed in data/hsk30/index.json.
import { app, cardOf, rerender } from "../core.js";
import { data, HSK30_LEVELS } from "../data.js";
import { esc, progressOf, progressBar, cardStatus } from "../ui.js";
import { trackKey } from "../store.js";

const PAGE = 100;
let level = "all";
let page = 0;
let query = "";

function charsInView() {
  const list = level === "all" ? data.hsk30Chars : data.hsk30Chars.filter((c) => c.level === Number(level));
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => c.hanzi.includes(q) || (c.pinyin || "").toLowerCase().includes(q)
    || (c.meaning || "").toLowerCase().includes(q));
}

function cellHtml(c) {
  const status = cardStatus(cardOf(trackKey("hsk30", c.hanzi)));
  return `<button class="char-cell ${status.cls}" data-action="lookup" data-word="${esc(c.hanzi)}" aria-label="${esc(c.hanzi)} ${esc(c.pinyin || "")}">${esc(c.hanzi)}</button>`;
}

export function viewChars() {
  const all = charsInView();
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  if (page >= pages) page = pages - 1;
  const shown = all.slice(page * PAGE, page * PAGE + PAGE);
  const progress = progressOf(all.map((c) => trackKey("hsk30", c.hanzi)));
  const levels = ["all", ...HSK30_LEVELS];
  app.innerHTML = `
    <div class="chars-head">
      <div class="chips" role="group" aria-label="Cấp">
        ${levels.map((l) => `<button class="chip-btn ${String(l) === String(level) ? "active" : ""}" data-action="chars-level" data-level="${l}">${l === "all" ? "Tất cả" : `Cấp ${l}`}</button>`).join("")}
      </div>
      <div class="row between">
        <small class="muted">${progress.total - progress.fresh}/${progress.total} chữ đã học</small>
        <div class="pager">
          <button class="icon-btn" data-action="chars-page" data-delta="-1" ${page === 0 ? "disabled" : ""} aria-label="Trang trước">‹</button>
          <span>${page + 1}/${pages}</span>
          <button class="icon-btn" data-action="chars-page" data-delta="1" ${page >= pages - 1 ? "disabled" : ""} aria-label="Trang sau">›</button>
        </div>
      </div>
      ${progressBar(progress)}
      <input class="search" type="search" placeholder="Tìm chữ, pinyin hoặc nghĩa" value="${esc(query)}" data-change="chars-search" aria-label="Tìm chữ">
    </div>
    ${shown.length
      ? `<div class="char-grid">${shown.map(cellHtml).join("")}</div>`
      : `<p class="card muted">Không có chữ nào khớp.</p>`}`;
}

export const actions = {
  "chars-search": ({ value }) => {
    query = value;
    page = 0;
    rerender();
  },
  "chars-level": ({ level: value }) => {
    level = value === "all" ? "all" : String(Number(value));
    page = 0;
    rerender();
  },
  "chars-page": ({ delta }) => {
    page = Math.max(0, page + Number(delta));
    rerender();
  },
};
