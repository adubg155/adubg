// Splits Chinese text into words with forward longest-match against a dictionary
// (HSK + work vocabulary). Used for tap-to-look-up and for the real-sentence ordering exercise.

const MAX_WORD_LENGTH = 8;
const HAN = /\p{Script=Han}/u;
const LATIN_OR_DIGIT = /[A-Za-z0-9%]/;

// Returns [{ text, kind: "han" | "latin" | "punct", known }].
export function segment(text, dict) {
  const chars = [...String(text)];
  const out = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (LATIN_OR_DIGIT.test(ch)) {
      let j = i;
      while (j < chars.length && LATIN_OR_DIGIT.test(chars[j])) j += 1;
      const run = chars.slice(i, j).join("");
      out.push({ text: run, kind: "latin", known: dict.has(run) });
      i = j;
    } else if (HAN.test(ch)) {
      let match = null;
      for (let len = Math.min(MAX_WORD_LENGTH, chars.length - i); len >= 1; len -= 1) {
        const candidate = chars.slice(i, i + len).join("");
        if (dict.has(candidate)) { match = candidate; break; }
      }
      const piece = match || ch;
      out.push({ text: piece, kind: "han", known: Boolean(match) });
      i += [...piece].length;
    } else {
      if (ch.trim()) out.push({ text: ch, kind: "punct", known: false });
      i += 1;
    }
  }
  return out;
}

// Merges neighbouring pieces (shortest pair first) until there are at most `max` pieces,
// so long sentences stay playable on a phone screen. Order and text are preserved.
export function chunkPieces(pieces, max) {
  let out = [...pieces];
  while (out.length > max) {
    let best = 0;
    for (let i = 1; i < out.length - 1; i += 1) {
      if (out[i].length + out[i + 1].length < out[best].length + out[best + 1].length) best = i;
    }
    out = [...out.slice(0, best), out[best] + out[best + 1], ...out.slice(best + 2)];
  }
  return out;
}

// Pieces for the ordering exercise: no punctuation, and runs of unknown single characters are
// merged so a sentence is not cut into meaningless one-character fragments.
export function sentencePieces(text, dict) {
  const pieces = [];
  let pending = "";
  for (const token of segment(text, dict)) {
    if (token.kind === "punct") continue;
    if (token.kind === "han" && !token.known) {
      pending += token.text;
      continue;
    }
    if (pending) { pieces.push(pending); pending = ""; }
    pieces.push(token.text);
  }
  if (pending) pieces.push(pending);
  return pieces;
}
