// Cleans English glosses from the source dictionary for display in minigames and cards.
// Source glosses carry dictionary noise: usage labels, cross-references and rare senses.

const NOISE_PREFIXES = ["used ", "surname", "abbr", "variant of", "old variant", "see ", "archaic", "classifier for", "onom"];
const NOISE_FRAGMENTS = ["used in", "variant of", "old variant", "abbr.", "(tw)", "taiwan"];
const DEFAULT_MAX = 60;
const MAX_PARTS = 2;

function isNoise(part) {
  const lower = part.toLowerCase();
  return NOISE_PREFIXES.some((p) => lower.startsWith(p)) || NOISE_FRAGMENTS.some((f) => lower.includes(f));
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function cleanMeaning(raw, max = DEFAULT_MAX) {
  const source = String(raw ?? "").replace(/\s+/g, " ").trim();
  const withoutLabels = source.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  const parts = withoutLabels
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !isNoise(part))
    .slice(0, MAX_PARTS);
  const cleaned = parts.join("; ");
  if (cleaned) return truncate(cleaned, max);
  return truncate(source, max);
}
