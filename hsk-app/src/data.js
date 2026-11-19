// All app content and the lookups shared by every screen.
// Two areas: "hsk" (HSK 1–4 textbook) and "work" (40 job lessons). A scope says what the learner
// is studying now: "hsk:all", "hsk:3", "work:all" or "work:q1-07".
import { adaptWord, loadTracks } from "./words.js";

export const HSK_LEVELS = [1, 2, 3, 4];          // HSK 2.0 textbook
export const HSK30_LEVELS = [1, 2, 3, 4, 5, 6];  // HSK 3.0 (levels 7–9 not included yet)
const HAN_RUN = /\p{Script=Han}+/gu;

export const data = {
  hsk: [],          // adapted HSK 2.0 words, id "hsk:<hanzi>"
  hsk30: [],        // adapted HSK 3.0 words, id "hsk30:<hanzi>", .level 1–6
  hsk30Chars: [],   // HSK 3.0 characters (same card key as the word with that hanzi)
  work: [],         // adapted work words, id "work:<hanzi>", with .lessons
  workIndex: [],    // [{ id, book, num, title, titleZh, counts }]
  sentences: [],    // [{ id, l, kind: s|d|g, zh, p, vi, g? }]
  lessonGrammar: [],
  hskGrammar: [],
  pairs: [],
  patterns: [],     // role-coloured sentence generator (grammar.js)
  grammarCore: [],
  domainRaw: {},
  byId: new Map(),
  lookup: new Map(),
  dict: new Set(),
};

let fetcher = null;
const lessonCache = new Map();

// Merges every word list into one dictionary: HSK entries win for pinyin/meaning, work entries add
// the lessons a word appears in, extra words fill the gaps used for segmentation.
export function buildLookup(hsk, work, extra, hsk30 = [], hsk30Chars = []) {
  const lookup = new Map();
  const put = (h, fields) => lookup.set(h, { ...(lookup.get(h) || { h, en: "", level: null, lessons: [] }), ...fields });
  for (const w of extra) put(w.h, { p: w.p, vi: w.vi });
  for (const w of work) {
    for (const form of [w.hanzi, ...(w.alt || [])]) {
      put(form, { p: w.pinyin, vi: w.meaningVi, lessons: w.lessons, main: w.hanzi });
    }
  }
  for (const w of hsk30) put(w.hanzi, { p: w.pinyin, vi: w.meaningVi, en: w.meaning, level: w.level, track: "hsk30" });
  for (const c of hsk30Chars) put(c.hanzi, { p: c.pinyin, vi: c.meaningVi, en: c.meaning, level: c.level, track: "hsk30" });
  for (const w of hsk) put(w.hanzi, { p: w.pinyin, vi: w.meaningVi, en: w.meaning, level: w.level, track: "hsk" });
  return lookup;
}

export async function loadData(fetchJson) {
  fetcher = fetchJson;
  const hsk30Index = await fetchJson("data/hsk30/index.json");
  const hsk30Levels = hsk30Index.levels.map((l) => l.level);
  const [tracks, workIndex, workWords, sentences, lessonGrammar, hskGrammar, pairs, extra, patterns, core,
    hsk30Words, hsk30CharList] =
    await Promise.all([
      loadTracks(fetchJson),
      fetchJson("data/work/index.json"),
      fetchJson("data/work/words.json"),
      fetchJson("data/work/sentences.json"),
      fetchJson("data/work/grammar.json"),
      fetchJson("data/grammar/hsk.json"),
      fetchJson("data/grammar/pairs.json"),
      fetchJson("data/extra-words.json"),
      fetchJson("data/grammar/patterns.json"),
      fetchJson("data/grammar/core.json"),
      Promise.all(hsk30Levels.map((lv) => fetchJson(`data/hsk30/words-${lv}.json`))),
      Promise.all(hsk30Levels.map((lv) => fetchJson(`data/hsk30/chars-${lv}.json`))),
    ]);
  const hsk30 = hsk30Words.flatMap((list) => list).map((w) => adaptWord(w, "hsk30"));
  const hsk30Chars = hsk30CharList.flatMap((list) => list).map((c) => adaptWord(c, "hsk30"));
  const work = workWords.map((w) => ({ ...adaptWord(w, "work"), lessons: w.lessons, alt: w.alt || [] }));
  Object.assign(data, {
    hsk: tracks.words.hsk,
    work,
    workIndex,
    sentences,
    lessonGrammar,
    hskGrammar,
    pairs,
    patterns,
    grammarCore: core,
    domainRaw: Object.fromEntries(Object.entries(tracks.raw).filter(([id]) => id !== "hsk")),
  });
  Object.assign(data, { hsk30, hsk30Chars });
  data.byId = new Map([...data.hsk, ...data.hsk30, ...data.work].map((w) => [w.id, w]));
  data.lookup = buildLookup(data.hsk, work, extra, hsk30, hsk30Chars);
  data.dict = new Set(data.lookup.keys());
}

export async function loadLesson(id) {
  if (!lessonCache.has(id)) lessonCache.set(id, await fetcher(`data/work/${id}.json`));
  return lessonCache.get(id);
}

// ---------- scope ----------

export function parseScope(text) {
  const [kind, value] = String(text || "").split(":");
  if (kind === "work") return { kind: "work", value: value || "all" };
  if (kind === "hsk30") return { kind: "hsk30", value: HSK30_LEVELS.includes(Number(value)) ? value : "all" };
  return { kind: "hsk", value: HSK_LEVELS.includes(Number(value)) ? value : "all" };
}

export function scopeKey(scope) {
  return `${scope.kind}:${scope.value}`;
}

export function lessonMeta(id, d = data) {
  return d.workIndex.find((l) => l.id === id) || null;
}

// Lessons are shown by their topic title only; the original lesson numbers stay in the
// data (ids, ordering) but are never displayed.
export function lessonShortLabel(meta) {
  return meta.title;
}

export function scopeLabel(scope, d = data) {
  if (scope.kind === "hsk30") return scope.value === "all" ? "Tất cả HSK 3.0" : `HSK 3.0 · cấp ${scope.value}`;
  if (scope.kind === "hsk") return scope.value === "all" ? "Tất cả HSK 2.0" : `HSK 2.0 · ${scope.value}`;
  if (scope.value === "all") return "Tất cả công việc";
  const meta = lessonMeta(scope.value, d);
  return meta ? lessonShortLabel(meta) : "Công việc";
}

export function scopeHash(scope) {
  if (scope.kind === "hsk30") return scope.value === "all" ? "hsk/3.0" : `hsk/3.0/${scope.value}`;
  if (scope.kind === "hsk") return scope.value === "all" ? "hsk/2.0" : `hsk/2.0/${scope.value}`;
  return scope.value === "all" ? "work" : `work/${scope.value}`;
}

export function scopeWords(scope, d = data) {
  if (scope.kind === "work") {
    return scope.value === "all" ? d.work : d.work.filter((w) => w.lessons.includes(scope.value));
  }
  if (scope.kind === "hsk30") {
    return scope.value === "all" ? d.hsk30 : d.hsk30.filter((w) => w.level === Number(scope.value));
  }
  return scope.value === "all" ? d.hsk : d.hsk.filter((w) => w.level === Number(scope.value));
}

// Grammar points in a scope. HSK points have .level, lesson points have .l (lesson id).
export function scopeGrammar(scope, d = data) {
  if (scope.kind === "work") {
    return scope.value === "all" ? d.lessonGrammar : d.lessonGrammar.filter((g) => g.l === scope.value);
  }
  return scope.value === "all" ? d.hskGrammar : d.hskGrammar.filter((g) => g.level === Number(scope.value));
}

function hskExamples(points) {
  return points.flatMap((g) => g.examples.map((e, i) => ({ id: `${g.id}-${i + 1}`, kind: "g", g: g.id, ...e })));
}

// Real sentences for the ordering exercise.
export function scopeSentences(scope, d = data) {
  if (scope.kind === "work") {
    return scope.value === "all" ? d.sentences : d.sentences.filter((s) => s.l === scope.value);
  }
  return hskExamples(scopeGrammar(scope, d));
}

// "不但……而且……" -> ["不但", "而且"]; "动词 + 完/好/到" -> ["动词", "完", "好", "到"] (the caller
// keeps only runs that are grammar words, see sentencesForGrammar).
export function grammarKeys(pattern) {
  return String(pattern).match(HAN_RUN) || [];
}

const PLACEHOLDERS = new Set(["动词", "名词", "形容词", "数词", "量词", "主语", "宾语", "句子"]);

// Real textbook sentences that use a grammar point: every key appears, in order.
// Single-character patterns (是, 的, 了...) match almost everything, so they return nothing.
export function sentencesForGrammar(point, d = data, limit = 5) {
  const keys = grammarKeys(point.pattern || point.formula).filter((k) => !PLACEHOLDERS.has(k));
  const signal = keys.join("").length;
  if (keys.length === 0 || signal < 2) return [];
  const own = new Set((point.examples || []).map((e) => e.zh));
  const matches = [];
  for (const s of d.sentences) {
    if (own.has(s.zh)) continue;
    let from = 0;
    const ok = keys.every((k) => {
      const at = s.zh.indexOf(k, from);
      if (at < 0) return false;
      from = at + k.length;
      return true;
    });
    if (ok) matches.push(s);
    if (matches.length >= limit) break;
  }
  return matches;
}

export function sentencesWithWord(h, d = data, limit = 5) {
  return d.sentences.filter((s) => s.zh.includes(h)).slice(0, limit);
}

// The deck a looked-up word belongs to, so it can be added to review.
export function cardIdForWord(entry) {
  if (!entry) return null;
  if (entry.track === "hsk30") return `hsk30:${entry.h}`;
  if (entry.level) return `hsk:${entry.h}`;
  if (entry.lessons && entry.lessons.length) return `work:${entry.main || entry.h}`;
  return null;
}
