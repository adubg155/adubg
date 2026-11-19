// "Tiến độ": progress per HSK level, per job book, grammar, and the most-forgotten words.
import { isWeak } from "../srs.js";
import { app, cardOf, countDue } from "../core.js";
import { data, HSK_LEVELS } from "../data.js";
import { esc, progressOf, progressBar, wordRows } from "../ui.js";
import { startSession } from "./review.js";

const WEAK_SHOWN = 40;

function row(label, ids, link) {
  const p = progressOf(ids);
  const weak = ids.filter((id) => isWeak(cardOf(id))).length;
  return `<tr>
    <td><a href="#/${link}">${esc(label)}</a></td><td>${p.total}</td><td>${p.learning}</td>
    <td>${p.mastered}</td><td>${weak}</td><td>${countDue(ids)}</td></tr>
    <tr class="bar-row"><td colspan="6">${progressBar(p)}</td></tr>`;
}

function table(rows) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>Mục</th><th>Tổng</th><th>Đang ôn</th><th>Đã thuộc</th><th>Hay quên</th><th>Đến hạn</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

export function viewStats() {
  const hskRows = HSK_LEVELS.map((level) =>
    row(`HSK ${level}`, data.hsk.filter((w) => w.level === level).map((w) => w.id), `hsk/${level}`)).join("");
  const workRows = [1, 2].map((book) => {
    const lessons = new Set(data.workIndex.filter((l) => l.book === book).map((l) => l.id));
    const ids = data.work.filter((w) => w.lessons.some((id) => lessons.has(id))).map((w) => w.id);
    return row(`Quyển ${book}`, ids, "work");
  }).join("");
  const grammarRows = [
    row("Ngữ pháp HSK", data.hskGrammar.map((g) => `grammar:${g.id}`), "hsk"),
    row("Ngữ pháp công việc", data.lessonGrammar.map((g) => `grammar:${g.id}`), "work"),
  ].join("");
  const weak = [...data.hsk, ...data.work]
    .filter((w) => isWeak(cardOf(w.id)))
    .sort((a, b) => cardOf(b.id).lapses - cardOf(a.id).lapses)
    .slice(0, WEAK_SHOWN);

  app.innerHTML = `
    <h1>📊 Tiến độ</h1>
    <section class="card"><h2>📘 Giáo trình HSK</h2>${table(hskRows)}</section>
    <section class="card"><h2>💼 Công việc</h2>${table(workRows)}</section>
    <section class="card"><h2>📐 Ngữ pháp</h2>${table(grammarRows)}</section>
    <section class="card">
      <h2>Từ hay quên</h2>
      ${weak.length ? `${wordRows(weak)}<div class="actions"><button class="primary" data-action="weak-all">Ôn ${weak.length} từ này</button></div>`
        : `<p class="muted">Chưa có từ nào quên từ 2 lần trở lên.</p>`}
    </section>
    <p class="muted small">"Đã thuộc" là thẻ có khoảng cách ôn từ 21 ngày trở lên. Thanh màu nhạt là phần đã bắt đầu học, màu đậm là phần đã thuộc.</p>`;
}

export const actions = {
  "weak-all": () => startSession("weak", [...data.hsk, ...data.work]),
};
