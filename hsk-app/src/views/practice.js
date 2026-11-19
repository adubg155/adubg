// "Luyện tập": every exercise works on the chosen scope (an HSK level or a job lesson).
import { RATING, buildSession, shuffle } from "../srs.js";
import { app, getState, cardOf, gradeCard, currentScope, go, showToast, speak, canSpeak } from "../core.js";
import {
  data, scopeWords, scopeGrammar, scopeSentences, scopeLabel, scopeHash, parseScope, sentencesForGrammar,
  lessonMeta, lessonShortLabel,
} from "../data.js";
import { sentencePieces, chunkPieces } from "../segment.js";
import { buildLexicon, generateSentence } from "../grammar.js";
import { renderOrder } from "../grammar-ui.js";
import { renderDialogue } from "../dialogue-ui.js";
import { renderMatch, renderListen } from "../games.js";
import { esc } from "../ui.js";
import { startSession } from "./review.js";

const ORDER_ROUNDS = 8;
const MAX_PIECES = 8;
const MIN_PIECES = 3;
const GAME_MIN_POOL = 4;
const GAME_FALLBACK_POOL = 20;
const GRAMMAR_POINTS_PER_RUN = 6;
const GRAMMAR_NEW_PER_RUN = 5;
const ROLE_ROUNDS = 10;
const GRAMMAR_PREFIX = "grammar:";

let run = null; // { mode, title, returnTo, start(root) }

function currentPath() {
  return location.hash.replace(/^#\/?/, "") || "practice";
}

function grammarById(id) {
  return data.hskGrammar.find((g) => g.id === id) || data.lessonGrammar.find((g) => g.id === id) || null;
}

function gradeRound(round, ok) {
  if (round.gradeId) gradeCard(round.gradeId, ok ? RATING.GOOD : RATING.AGAIN, { countDaily: false });
}

// ---------- round builders ----------

// Sentences with an ellipsis ("……" / "...") are fragments from the source material, not
// complete sentences, so they have no single correct order to rebuild.
const FRAGMENT = /……|…|\.\.\./;

function orderRound(sentence, title, gradeId, note = "") {
  if (!sentence.zh || FRAGMENT.test(sentence.zh)) return null;
  const pieces = chunkPieces(sentencePieces(sentence.zh, data.dict), MAX_PIECES);
  if (pieces.length < MIN_PIECES) return null;
  return {
    title,
    note,
    gradeId,
    sentence: {
      tokens: pieces.map((text) => ({ text, pinyin: data.lookup.get(text)?.p || "", role: "" })),
      text: sentence.zh,
      pinyin: sentence.p,
      vi: sentence.vi,
    },
  };
}

function sentenceTitle(s) {
  const point = s.g && grammarById(s.g);
  if (point) return point.pattern || point.formula;
  const meta = s.l && lessonMeta(s.l);
  return meta ? lessonShortLabel(meta) : "Câu thật";
}

function realSentenceRounds(sentences) {
  return shuffle(sentences)
    .map((s) => orderRound(s, sentenceTitle(s), s.g ? GRAMMAR_PREFIX + s.g : null))
    .filter(Boolean)
    .slice(0, ORDER_ROUNDS);
}

function grammarSentences(point) {
  return [
    ...point.examples.map((e) => ({ ...e, g: point.id })),
    ...sentencesForGrammar(point, data, 4).map((s) => ({ ...s, g: point.id })),
  ];
}

function firstRoundFor(point) {
  for (const s of shuffle(grammarSentences(point))) {
    const round = orderRound(s, point.pattern || point.formula, GRAMMAR_PREFIX + point.id, point.usage);
    if (round) return round;
  }
  return null;
}

function oneGrammarRounds(id) {
  const point = grammarById(id);
  if (!point) return [];
  return shuffle(grammarSentences(point))
    .map((s) => orderRound(s, point.pattern || point.formula, GRAMMAR_PREFIX + point.id, point.usage))
    .filter(Boolean)
    .slice(0, ORDER_ROUNDS);
}

// Due grammar points first, then a few new ones; one sentence per point.
function grammarDueRounds(scope) {
  const points = scopeGrammar(scope);
  const queue = buildSession({
    cards: getState().cards,
    wordIds: points.map((p) => GRAMMAR_PREFIX + p.id),
    now: Date.now(),
    reviewLimit: GRAMMAR_POINTS_PER_RUN,
    newAllowed: GRAMMAR_NEW_PER_RUN,
  }).map((key) => key.slice(GRAMMAR_PREFIX.length));
  const ids = queue.length ? queue : shuffle(points).slice(0, GRAMMAR_POINTS_PER_RUN).map((p) => p.id);
  return ids.map((id) => points.find((p) => p.id === id)).filter(Boolean).map(firstRoundFor).filter(Boolean);
}

function roleRounds() {
  const lexicons = Object.values(data.domainRaw).map((words) => buildLexicon(data.grammarCore, words));
  const rounds = [];
  for (let i = 0; i < ROLE_ROUNDS * 2 && rounds.length < ROLE_ROUNDS; i += 1) {
    const pattern = data.patterns[Math.floor(Math.random() * data.patterns.length)];
    const sentence = generateSentence(pattern, lexicons[Math.floor(Math.random() * lexicons.length)]);
    if (sentence) {
      rounds.push({ title: pattern.title, formula: pattern.formula, note: pattern.note, gradeId: GRAMMAR_PREFIX + pattern.id, sentence });
    }
  }
  return rounds;
}

function dialoguesIn(scope) {
  const turns = data.sentences.filter((s) => s.kind === "d"
    && (scope.kind !== "work" || scope.value === "all" || s.l === scope.value));
  const groups = new Map();
  for (const t of turns) {
    const key = `${t.l}|${t.d}`;
    if (!groups.has(key)) groups.set(key, { l: t.l, name: t.d, turns: [] });
    groups.get(key).turns.push(t);
  }
  return [...groups.values()];
}

function gamePool(scope) {
  const words = scopeWords(scope);
  const seen = words.filter((w) => !cardOf(w.id).isNew);
  return seen.length >= GAME_MIN_POOL ? seen : words.slice(0, GAME_FALLBACK_POOL);
}

// ---------- runs ----------

function finishRun(result) {
  const detail = result && result.total ? ` Đúng ${result.correct}/${result.total}.` : "";
  showToast(`Xong.${detail}`);
  const back = run ? run.returnTo : "practice";
  run = null;
  go(back);
}

function orderRun(title, rounds) {
  return { title, ready: rounds.length > 0, start: (root) => renderOrder(root, rounds, gradeRound, finishRun, speak, canSpeak()) };
}

function buildRun(mode, scope, { id, lesson, name }) {
  if (mode === "order") return orderRun("Xếp câu thật", realSentenceRounds(scopeSentences(scope)));
  if (mode === "grammar") {
    const point = grammarById(id);
    return orderRun(point ? point.pattern || point.formula : "Ngữ pháp", oneGrammarRounds(id));
  }
  if (mode === "grammar-due") return orderRun(`Ngữ pháp · ${scopeLabel(scope)}`, grammarDueRounds(scope));
  if (mode === "roles") return orderRun("Câu tô màu vai trò", roleRounds());
  if (mode === "match" || mode === "listen") {
    const pool = gamePool(scope);
    const grade = (wordId, rating) => gradeCard(wordId, rating, { countDaily: false });
    return {
      title: mode === "match" ? "Ghép nghĩa" : "Nghe chọn pinyin",
      ready: pool.length >= GAME_MIN_POOL,
      start: (root) => (mode === "match"
        ? renderMatch(root, pool, grade, finishRun)
        : renderListen(root, pool, grade, finishRun, speak, canSpeak())),
    };
  }
  if (mode === "dialogue") {
    const all = dialoguesIn(lesson ? parseScope(`work:${lesson}`) : scope);
    const chosen = (name && all.find((d) => d.name === name)) || shuffle(all)[0];
    const pool = data.sentences.filter((s) => s.kind === "d" && s.r === "B");
    return {
      title: chosen ? `${chosen.name}` : "Hội thoại",
      ready: Boolean(chosen),
      start: (root) => renderDialogue(root, `${lessonShortLabel(lessonMeta(chosen.l))} · ${chosen.name}`,
        chosen.turns, pool, finishRun, speak, canSpeak()),
    };
  }
  return null;
}

function tile(mode, icon, title, detail, disabled = false) {
  return `<button class="card tile-btn" data-action="practice" data-mode="${mode}" ${disabled ? "disabled" : ""}>
    <span class="tile-icon">${icon}</span><strong>${esc(title)}</strong><small class="muted">${esc(detail)}</small>
  </button>`;
}

function viewMenu() {
  const scope = currentScope();
  const words = scopeWords(scope);
  const sentences = scopeSentences(scope);
  const grammar = scopeGrammar(scope);
  const grammarIds = grammar.map((g) => GRAMMAR_PREFIX + g.id);
  const grammarDue = grammarIds.filter((k) => { const c = getState().cards[k]; return c && !c.isNew && c.due <= Date.now(); }).length;
  const dialogues = dialoguesIn(scope.kind === "work" ? scope : parseScope("work:all"));
  app.innerHTML = `
    <h1>🎯 Luyện tập</h1>
    <section class="card scope-pill">
      <div><small class="muted">Luyện theo mục</small><div class="scope-name">${esc(scopeLabel(scope))}</div></div>
      <a class="small-btn" href="#/${scopeHash(scope)}">Đổi mục</a>
    </section>
    <div class="tile-grid">
      ${tile("cards", "🃏", "Thẻ ghi nhớ", `${words.length} từ trong mục`)}
      ${tile("grammar-due", "📐", "Ngữ pháp", `${grammar.length} mẫu · ${grammarDue} đến hạn`, grammar.length === 0)}
      ${tile("order", "🔀", "Xếp câu thật", `${sentences.length} câu`, sentences.length === 0)}
      ${tile("dialogue", "💬", "Hội thoại", `${dialogues.length} đoạn${scope.kind === "work" ? "" : " (Quyển 2)"}`, dialogues.length === 0)}
      ${tile("match", "🧩", "Ghép nghĩa", "Hán tự ↔ nghĩa")}
      ${tile("listen", "👂", "Nghe chọn pinyin", "Nghe rồi chọn cách đọc")}
      ${tile("roles", "🎨", "Câu tô màu vai trò", "Chủ ngữ, thời gian, địa điểm…")}
    </div>`;
}

export function viewPractice([mode]) {
  if (!run || run.mode !== mode) {
    if (mode) return go("practice");
    return viewMenu();
  }
  app.innerHTML = `
    <div class="row between">
      <h1>${esc(run.title)}</h1>
      <button data-action="run-exit">Thoát</button>
    </div>
    <div id="run" class="card game"></div>`;
  run.start(document.getElementById("run"));
}

export const actions = {
  practice: ({ mode, id, scope: scopeText, lesson, name }) => {
    const scope = scopeText ? parseScope(scopeText) : currentScope();
    if (mode === "cards") return startSession("due", scopeWords(scope));
    const built = buildRun(mode, scope, { id, lesson, name });
    if (!built || !built.ready) return showToast("Mục này chưa đủ dữ liệu cho bài luyện này.");
    run = { ...built, mode, returnTo: currentPath() };
    go(`practice/${mode}`);
  },
  "run-exit": () => {
    const back = run ? run.returnTo : "practice";
    run = null;
    go(back);
  },
};
