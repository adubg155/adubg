// Sentence generator for grammar practice. Patterns (data/grammar/patterns.json) are sequences of
// slots (S, T, P, V, O) and fixed function words. Slots are filled from the core words
// (pronouns, time words) and a domain's tagged vocabulary:
//   r: "S" person, "N" noun, "V" verb, "P" place;  c: noun group;  o: noun groups a verb takes;
//   b: 1 when the verb works in the 把 pattern.
// The verb picks its object, so sentences stay meaningful ("检查产品", not "检查宿舍").

export const ROLE_LABELS = Object.freeze({
  S: "Chủ ngữ",
  AGENT: "Người làm (sau 被)",
  T: "Thời gian",
  P: "Địa điểm",
  V: "Động từ",
  O: "Tân ngữ",
  ADV: "Phó từ",
  PREP: "Giới từ",
  PART: "Trợ từ",
  MOD: "Động từ năng nguyện",
  RES: "Bổ ngữ kết quả",
});

const MAX_SCRAMBLE_TRIES = 10;

export function buildLexicon(core, domainWords) {
  return {
    subjects: [...core.filter((w) => w.r === "S"), ...domainWords.filter((w) => w.r === "S")],
    times: core.filter((w) => w.r === "T"),
    places: domainWords.filter((w) => w.r === "P"),
    verbs: domainWords.filter((w) => w.r === "V" && Array.isArray(w.o)),
    nouns: domainWords.filter((w) => (w.r === "N" || w.r === "S") && w.c),
  };
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

// "nạp (chương trình), cài" -> "nạp": first sense, without notes in brackets.
function shortVi(vi) {
  return String(vi).split(",")[0].replace(/\s*\([^)]*\)/g, "").trim();
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function slotsUsed(pattern) {
  return new Set(pattern.tokens.filter((t) => t.slot).map((t) => t.slot));
}

function objectsFor(verb, lexicon) {
  return lexicon.nouns.filter((n) => verb.o.includes(n.c));
}

// Chooses one word per slot, or returns null when the lexicon cannot fill the pattern.
function fillSlots(pattern, lexicon, rng) {
  const used = slotsUsed(pattern);
  const verbs = lexicon.verbs.filter((v) => (!pattern.baOnly || v.b === 1) && objectsFor(v, lexicon).length > 0);
  if (verbs.length === 0) return null;
  const verb = pick(verbs, rng);
  const object = pick(objectsFor(verb, lexicon), rng);
  const subjects = lexicon.subjects.filter((s) => s.h !== object.h);
  const times = lexicon.times.filter((t) => !pattern.times || pattern.times.includes(t.c));
  if (subjects.length === 0) return null;
  if (used.has("T") && times.length === 0) return null;
  if (used.has("P") && lexicon.places.length === 0) return null;
  return {
    S: pick(subjects, rng),
    V: verb,
    O: object,
    T: used.has("T") ? pick(times, rng) : null,
    P: used.has("P") ? pick(lexicon.places, rng) : null,
  };
}

export function generateSentence(pattern, lexicon, rng = Math.random) {
  const filled = fillSlots(pattern, lexicon, rng);
  if (!filled) return null;
  const tokens = pattern.tokens.map((token) => {
    if (token.lit) return { text: token.lit, pinyin: token.p, vi: "", role: token.role };
    const word = filled[token.slot];
    return { text: word.h, pinyin: word.p, vi: shortVi(word.vi), role: token.role || token.slot };
  });
  const vi = pattern.vi.replace(/\{([A-Z])\}/g, (_, key) => (filled[key] ? shortVi(filled[key].vi) : ""));
  return {
    patternId: pattern.id,
    tokens,
    text: tokens.map((t) => t.text).join(""),
    pinyin: tokens.map((t) => t.pinyin).join(" "),
    vi: capitalize(vi.replace(/\s+/g, " ").trim()),
  };
}

// order: indices into tokens in the order the learner placed them.
// Compares the text, so swapping two identical tokens still counts as correct.
export function checkOrder(tokens, order) {
  if (order.length !== tokens.length) return false;
  return order.map((i) => tokens[i].text).join("|") === tokens.map((t) => t.text).join("|");
}

// Random permutation of 0..n-1 that is not already in order (when n > 1).
export function scramble(n, rng = Math.random) {
  const base = Array.from({ length: n }, (_, i) => i);
  let order = base;
  for (let attempt = 0; attempt < MAX_SCRAMBLE_TRIES; attempt += 1) {
    order = [...base];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (n < 2 || order.some((value, index) => value !== index)) return order;
  }
  return n < 2 ? order : [...base.slice(1), base[0]];
}
