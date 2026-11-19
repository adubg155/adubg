// HTML building blocks shared by the views. Every Chinese sentence goes through zhHtml, so any
// known word can be tapped to see its pinyin and meaning (the "lookup" action).
import { esc } from "./games.js";
import { segment } from "./segment.js";
import { isMastered, isWeak } from "./srs.js";
import {
  data, sentencesWithWord, sentencesForGrammar, cardIdForWord, lessonMeta, lessonShortLabel,
} from "./data.js";
import { cardOf, canSpeak } from "./core.js";

export { esc };

export function zhHtml(text, action = "lookup") {
  return segment(text, data.dict).map((t) => (t.kind === "han" && t.known
    ? `<span class="w" data-action="${action}" data-word="${esc(t.text)}">${esc(t.text)}</span>`
    : esc(t.text))).join("");
}

export function speakButton(text) {
  return canSpeak()
    ? `<button class="icon-btn" data-action="speak" data-text="${esc(text)}" aria-label="Nghe">🔊</button>`
    : "";
}

export function sentenceHtml(s, { role, action } = {}) {
  return `
    <div class="sent${role ? ` bubble bubble-${role === "A" ? "a" : "b"}` : ""}">
      ${role ? `<span class="who">${esc(role)}</span>` : ""}
      <div class="sent-zh">${zhHtml(s.zh, action)} ${speakButton(s.zh)}</div>
      ${s.p ? `<div class="sent-py">${esc(s.p)}</div>` : ""}
      ${s.vi ? `<div class="sent-vi">${esc(s.vi)}</div>` : ""}
    </div>`;
}

export function cardStatus(card, now = Date.now()) {
  if (card.isNew) return { cls: "st-new", label: "Chưa học" };
  if (isWeak(card)) return { cls: "st-weak", label: "Hay quên" };
  if (isMastered(card)) return { cls: "st-done", label: "Đã thuộc" };
  if (card.due <= now) return { cls: "st-due", label: "Đến hạn" };
  return { cls: "st-learn", label: "Đang ôn" };
}

export function progressOf(ids) {
  const cards = ids.map(cardOf);
  const mastered = cards.filter(isMastered).length;
  const fresh = cards.filter((c) => c.isNew).length;
  const total = ids.length;
  return {
    total,
    mastered,
    fresh,
    learning: total - mastered - fresh,
    pct: total ? Math.round(((total - fresh) / total) * 100) : 0,
  };
}

export function progressBar(progress) {
  const learned = progress.total ? (progress.mastered / progress.total) * 100 : 0;
  const started = progress.total ? ((progress.total - progress.fresh) / progress.total) * 100 : 0;
  return `<div class="bar" title="${progress.total - progress.fresh}/${progress.total} đã học">
    <span class="bar-start" style="width:${started.toFixed(1)}%"></span>
    <span class="bar-done" style="width:${learned.toFixed(1)}%"></span>
  </div>`;
}

export function tabsHtml(base, tabs, active) {
  return `<div class="tabs" role="tablist">${tabs.map((t) => `
    <a role="tab" href="#/${base}/${t.id}" class="${t.id === active ? "active" : ""}">${esc(t.label)}${
      t.count !== undefined ? ` <small>${t.count}</small>` : ""}</a>`).join("")}</div>`;
}

export function wordRows(words) {
  return `<ul class="word-list">${words.map((w) => {
    const status = cardStatus(cardOf(w.id));
    return `<li class="word-row" data-action="lookup" data-word="${esc(w.hanzi)}">
      <span class="dot ${status.cls}" title="${status.label}"></span>
      <span class="hz">${esc(w.hanzi)}</span>
      <span class="py">${esc(w.pinyin)}</span>
      <span class="vi">${w.meaningVi ? esc(w.meaningVi) : `<span class="meaning-en">${esc(w.meaning || "")}</span>`}</span>
    </li>`;
  }).join("")}</ul>`;
}

export function statusLegend() {
  return `<p class="legend small muted">
    <span class="dot st-new"></span>Chưa học <span class="dot st-learn"></span>Đang ôn
    <span class="dot st-due"></span>Đến hạn <span class="dot st-weak"></span>Hay quên <span class="dot st-done"></span>Đã thuộc</p>`;
}

export function scopeButton(scope, isCurrent) {
  return isCurrent
    ? `<span class="badge current">✓ Đang học</span>`
    : `<button class="small-btn" data-action="set-scope" data-scope="${esc(`${scope.kind}:${scope.value}`)}">Chọn học mục này</button>`;
}

export function lessonLink(id) {
  const meta = lessonMeta(id);
  return meta ? `<a class="lesson-link" href="#/work/${meta.id}">${esc(lessonShortLabel(meta))}</a>` : "";
}

// One grammar point (HSK or lesson): pattern, usage, examples, and real textbook sentences that
// use it, with a button to practise it by ordering sentences.
export function grammarCardHtml(point) {
  const status = cardStatus(cardOf(`grammar:${point.id}`));
  const related = sentencesForGrammar(point);
  const tags = [point.group, point.part].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  return `<article class="card grammar-card">
    <div class="row between">
      <h3 class="g-title">${esc(point.pattern || point.formula)}</h3>
      <span class="badge"><span class="dot ${status.cls}"></span>${status.label}</span>
    </div>
    ${point.p ? `<div class="pinyin small-pinyin">${esc(point.p)}</div>` : ""}
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    <p>${esc(point.usage)}</p>
    ${point.examples.map((e) => sentenceHtml(e)).join("")}
    ${related.length ? `<details class="related"><summary>Câu dùng mẫu này trong giáo trình (${related.length})</summary>
      ${related.map((s) => `${sentenceHtml(s)}<p class="small">${lessonLink(s.l)}</p>`).join("")}</details>` : ""}
    <button data-action="practice" data-mode="grammar" data-id="${esc(point.id)}">Luyện xếp câu mẫu này</button>
  </article>`;
}

export function pairsHtml(pairs) {
  if (!pairs.length) return `<p class="card muted">Chưa có cặp dễ nhầm cho mục này.</p>`;
  return pairs.map((p) => `
    <article class="card pair-card">
      <h3>${esc(p.topic)}</h3>
      <div class="pair-cols">
        <div class="pair-a"><span class="tag">A</span>${zhHtml(p.a)}</div>
        <div class="pair-b"><span class="tag">B</span>${zhHtml(p.b)}</div>
      </div>
      <p class="tip">💡 ${zhHtml(p.tip)}</p>
    </article>`).join("");
}

function whereLabel(entry) {
  const parts = [];
  if (entry.level) parts.push(`HSK ${entry.level}`);
  for (const id of (entry.lessons || []).slice(0, 4)) {
    const meta = lessonMeta(id);
    if (meta) parts.push(`<a href="#/work/${meta.id}" data-action="close-sheet">${esc(lessonShortLabel(meta))}</a>`);
  }
  return parts.join(" · ");
}

// Bottom sheet shown when a word is tapped anywhere in the app.
export function wordSheetHtml(h, stackDepth = 0) {
  const entry = data.lookup.get(h);
  if (!entry) return "";
  const cardId = cardIdForWord(entry);
  const status = cardId ? cardStatus(cardOf(cardId)) : null;
  const examples = sentencesWithWord(h, data, 3);
  return `
    <div class="sheet-body" role="dialog" aria-label="${esc(h)}">
      <div class="row between">
        <div><span class="sheet-hz">${esc(h)}</span> ${speakButton(h)}</div>
        <div class="row">
          ${stackDepth > 0 ? `<button class="icon-btn" data-action="sheet-back" aria-label="Quay lại">‹</button>` : ""}
          <button class="icon-btn" data-action="close-sheet" aria-label="Đóng">✕</button>
        </div>
      </div>
      <div class="pinyin">${esc(entry.p || "")}</div>
      ${entry.vi ? `<div class="meaning">${esc(entry.vi)}</div>` : `<p class="small muted">Chưa có nghĩa tiếng Việt. Giữ từ này 5 giây để thêm.</p>`}
      ${entry.en ? `<div class="meaning-en">${esc(entry.en)}</div>` : ""}
      ${entry.main && entry.main !== h ? `<p class="small muted">Cách nói khác của ${esc(entry.main)}</p>` : ""}
      <p class="small">${whereLabel(entry) || `<span class="muted">Từ thông dụng, chưa có trong bộ thẻ</span>`}</p>
      ${examples.length ? `<h3>Có trong câu</h3>${examples.map((s) => sentenceHtml(s, { action: "lookup-in-sheet" })).join("")}` : ""}
      <div class="actions row">
        ${cardId && status ? `<span class="badge"><span class="dot ${status.cls}"></span>${status.label}</span>` : ""}
        ${cardId && cardOf(cardId).isNew ? `<button class="primary" data-action="queue-word" data-id="${esc(cardId)}">+ Thêm vào ôn</button>` : ""}
      </div>
    </div>`;
}
