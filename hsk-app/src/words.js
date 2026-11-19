// Word lists for each track. HSK words come from data/hsk.json (with HSK levels). Job domains are
// listed in data/track/index.json, so a new domain is one JSON file plus one index line.
// Card ids are "track:hanzi" so the same hanzi can be studied in more than one track.
import { trackKey } from "./store.js";

export const HSK_TRACK = Object.freeze({ id: "hsk", label: "HSK 1–4", file: "data/hsk.json" });
const DOMAIN_INDEX = "data/track/index.json";

export function trackLabel(list, id) {
  const track = list.find((t) => t.id === id);
  return track ? track.label : id;
}

export function adaptWord(raw, track) {
  return {
    id: trackKey(track, raw.h),
    track,
    hanzi: raw.h,
    pinyin: raw.p,
    level: raw.l ?? null,
    pos: raw.pos ?? "",
    meaning: raw.en || "",
    meaningVi: raw.vi || "",
  };
}

// fetchJson(path) must resolve to parsed JSON.
// Returns { list: [{id,label,file}], words: {id: adapted[]}, raw: {id: entries with grammar tags} }.
export async function loadTracks(fetchJson) {
  const domains = await fetchJson(DOMAIN_INDEX);
  const list = [HSK_TRACK, ...domains];
  const entries = await Promise.all(list.map((track) => fetchJson(track.file)));
  const words = {};
  const raw = {};
  list.forEach((track, index) => {
    raw[track.id] = entries[index];
    words[track.id] = entries[index].map((entry) => adaptWord(entry, track.id));
  });
  return { list, words, raw };
}
