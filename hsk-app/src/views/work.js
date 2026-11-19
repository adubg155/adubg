// "Công việc": Quyển 1 (job vocabulary) and Quyển 2 (workplace dialogues); each lesson has
// Từ vựng / Ngữ pháp / Mẫu câu / Hội thoại.
import { app, getState, currentScope, setSetting, go } from "../core.js";
import { data, loadLesson, lessonMeta, scopeKey, parseScope } from "../data.js";
import {
  esc, progressOf, progressBar, tabsHtml, wordRows, statusLegend, scopeButton, grammarCardHtml, sentenceHtml,
} from "../ui.js";

const BOOK_INFO = {
  1: "Từ vựng chuyên ngành · có mẫu câu",
  2: "Hội thoại tình huống công việc",
};

function lessonWords(id) {
  return data.work.filter((w) => w.lessons.includes(id));
}

function countLabel(counts) {
  const parts = [`${counts.words} từ`, `${counts.grammar} ngữ pháp`];
  if (counts.sentences) parts.push(`${counts.sentences} câu`);
  if (counts.dialogues) parts.push(`${counts.dialogues} hội thoại`);
  return parts.join(" · ");
}

function viewLessons() {
  const current = scopeKey(currentScope());
  app.innerHTML = `
    <h1>💼 Công việc</h1>
    <p class="muted">Chọn một bài để học từ vựng, ngữ pháp, mẫu câu và hội thoại theo nghề.</p>
    <div class="actions"><button data-action="set-scope" data-scope="work:all">Học tất cả bài cùng lúc</button></div>
    ${[1, 2].map((book) => `
      <h2 id="q${book}">Quyển ${book} <small class="muted">${BOOK_INFO[book]}</small></h2>
      <div class="lesson-list">${data.workIndex.filter((l) => l.book === book).map((l) => `
        <a class="card lesson-row" href="#/work/${l.id}">
          <div class="grow">
            <div class="row between"><strong>${esc(l.title)}</strong>
              ${current === `work:${l.id}` ? `<span class="badge current">Đang học</span>` : ""}</div>
            <small class="muted">${esc(l.titleZh)} · ${countLabel(l.counts)}</small>
            ${progressBar(progressOf(lessonWords(l.id).map((w) => w.id)))}
          </div>
        </a>`).join("")}</div>`).join("")}`;
}

function wordsTab(lesson) {
  const ids = lessonWords(lesson.id).map((w) => w.id);
  const progress = progressOf(ids);
  const sections = lesson.sections.map((section) => {
    const words = section.words.map((w) => data.byId.get(`work:${w.h}`)).filter(Boolean);
    return `<h3>${esc(section.name)} <small class="muted">${words.length}</small></h3>${wordRows(words)}`;
  }).join("");
  return `
    <section class="card">
      ${progressBar(progress)}
      <p class="small muted">${progress.mastered} đã thuộc · ${progress.learning} đang ôn · ${progress.fresh} chưa học</p>
      <div class="actions row">
        <button class="primary" data-action="scope-start" data-scope="work:${lesson.id}" data-kind="new">Học từ mới</button>
        <button data-action="scope-start" data-scope="work:${lesson.id}" data-kind="due">Ôn</button>
        <button data-action="practice" data-mode="match" data-scope="work:${lesson.id}">Ghép nghĩa</button>
      </div>
    </section>
    ${statusLegend()}
    ${sections}`;
}

function grammarTab(lesson) {
  return `
    <div class="actions"><button class="primary" data-action="practice" data-mode="grammar-due" data-scope="work:${lesson.id}">Luyện ngữ pháp bài này</button></div>
    ${lesson.grammar.map((g) => grammarCardHtml({ ...g, l: lesson.id })).join("")}`;
}

function sentencesTab(lesson) {
  return `
    <div class="actions"><button class="primary" data-action="practice" data-mode="order" data-scope="work:${lesson.id}">Luyện xếp câu (${lesson.sentences.length} câu)</button></div>
    <p class="small muted">Chạm vào một từ để xem nghĩa.</p>
    ${lesson.sentences.map((s) => sentenceHtml(s)).join("")}`;
}

function dialoguesTab(lesson) {
  return lesson.dialogues.map((d) => `
    <section class="card dialogue">
      <div class="row between">
        <h3>${esc(d.name)}</h3>
        <button class="small-btn primary" data-action="practice" data-mode="dialogue" data-lesson="${lesson.id}" data-name="${esc(d.name)}">Luyện hội thoại</button>
      </div>
      ${d.turns.map((t) => sentenceHtml(t, { role: t.role })).join("")}
    </section>`).join("");
}

function renderLesson(lesson, tab) {
  const meta = lessonMeta(lesson.id);
  const scope = parseScope(`work:${lesson.id}`);
  const tabs = [
    { id: "words", label: "Từ vựng", count: meta.counts.words },
    { id: "grammar", label: "Ngữ pháp", count: meta.counts.grammar },
    ...(meta.counts.sentences ? [{ id: "sentences", label: "Mẫu câu", count: meta.counts.sentences }] : []),
    ...(meta.counts.dialogues ? [{ id: "dialogues", label: "Hội thoại", count: meta.counts.dialogues }] : []),
  ];
  const active = tabs.some((t) => t.id === tab) ? tab : "words";
  const body = { words: wordsTab, grammar: grammarTab, sentences: sentencesTab, dialogues: dialoguesTab }[active](lesson);
  app.innerHTML = `
    <a class="back-link" href="#/work">‹ Công việc</a>
    <p class="muted small">Quyển ${meta.book}</p>
    <div class="row between page-head">
      <div><h1>${esc(meta.title)}</h1><p class="zh-title">${esc(meta.titleZh)}</p></div>
      ${scopeButton(scope, scopeKey(currentScope()) === scopeKey(scope))}
    </div>
    ${tabsHtml(`work/${lesson.id}`, tabs, active)}
    ${body}`;
}

export function viewWork([id, tab]) {
  if (!id) return viewLessons();
  if (!lessonMeta(id)) return go("work");
  if (getState().settings.lastLesson !== id) setSetting("lastLesson", id);
  const expected = location.hash;
  app.innerHTML = `<p class="muted">Đang tải bài…</p>`;
  loadLesson(id)
    .then((lesson) => {
      if (location.hash === expected) renderLesson(lesson, tab);
    })
    .catch((error) => {
      app.innerHTML = `<p class="bad">Không tải được bài: ${esc(error.message)}</p>`;
    });
}
