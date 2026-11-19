// "Hôm nay": what to do now for the chosen scope, plus entry points to the two areas.
import { isWeak } from "../srs.js";
import { app, getState, cardOf, countDue, remainingReviews, remainingNew, currentScope } from "../core.js";
import {
  data, HSK_LEVELS, scopeWords, scopeGrammar, scopeLabel, scopeHash, lessonMeta, lessonShortLabel,
} from "../data.js";
import { esc, progressOf, progressBar } from "../ui.js";
import { startSession } from "./review.js";

function hskLevelCards() {
  return HSK_LEVELS.map((level) => {
    const progress = progressOf(data.hsk.filter((w) => w.level === level).map((w) => w.id));
    return `<a class="card level-card" href="#/hsk/${level}">
      <strong>HSK ${level}</strong>
      <small class="muted">${progress.total - progress.fresh}/${progress.total} từ</small>
      ${progressBar(progress)}
    </a>`;
  }).join("");
}

function workCards() {
  const books = [1, 2].map((book) => {
    const lessons = data.workIndex.filter((l) => l.book === book).map((l) => l.id);
    const ids = data.work.filter((w) => w.lessons.some((id) => lessons.includes(id))).map((w) => w.id);
    const progress = progressOf(ids);
    return `<a class="card level-card" href="#/work">
      <strong>Quyển ${book}</strong>
      <small class="muted">${book === 1 ? "Từ vựng chuyên ngành" : "Hội thoại tình huống"} · ${lessons.length} bài</small>
      ${progressBar(progress)}
    </a>`;
  }).join("");
  const last = lessonMeta(getState().settings.lastLesson);
  const resume = last ? `<a class="card resume" href="#/work/${last.id}">▶ Học tiếp: <strong>${esc(lessonShortLabel(last))}</strong></a>` : "";
  return `${resume}<div class="level-grid two">${books}</div>`;
}

export function viewHome() {
  const scope = currentScope();
  const ids = scopeWords(scope).map((w) => w.id);
  const toReview = Math.min(countDue(ids), remainingReviews());
  const newLeft = remainingNew();
  const unseen = ids.filter((id) => cardOf(id).isNew).length;
  const weak = ids.filter((id) => isWeak(cardOf(id))).length;
  const grammarIds = scopeGrammar(scope).map((g) => `grammar:${g.id}`);
  const grammarDue = countDue(grammarIds);
  const grammarNew = grammarIds.filter((id) => cardOf(id).isNew).length;
  const { daily } = getState();

  app.innerHTML = `
    <section class="card scope-pill">
      <div>
        <small class="muted">Đang học</small>
        <div class="scope-name">${esc(scopeLabel(scope))}</div>
      </div>
      <a class="small-btn" href="#/${scopeHash(scope)}">Mở mục</a>
    </section>
    <section class="card hero">
      <div class="stat-row">
        <div><span class="num">${toReview}</span><span class="lbl">cần ôn</span></div>
        <div><span class="num">${daily.reviewCount}</span><span class="lbl">đã ôn hôm nay</span></div>
        <div><span class="num">${newLeft}</span><span class="lbl">từ mới còn lại</span></div>
      </div>
    </section>
    <div class="actions">
      <button class="primary big" data-action="start" data-kind="due" ${toReview === 0 && (newLeft === 0 || unseen === 0) ? "disabled" : ""}>Bắt đầu ôn</button>
      <button data-action="start" data-kind="new" ${unseen === 0 ? "disabled" : ""}>Học thêm từ mới (còn ${unseen})</button>
      <button data-action="start" data-kind="weak" ${weak === 0 ? "disabled" : ""}>Ôn ${weak} từ hay quên</button>
      <button data-action="practice" data-mode="grammar-due" ${grammarIds.length === 0 ? "disabled" : ""}>
        Luyện ngữ pháp · ${grammarDue} đến hạn · ${grammarNew} chưa học</button>
    </div>
    <h2>📘 Giáo trình HSK</h2>
    <div class="level-grid">${hskLevelCards()}</div>
    <h2>💼 Công việc</h2>
    ${workCards()}`;
}

export const actions = {
  start: ({ kind }) => startSession(kind, scopeWords(currentScope())),
};
