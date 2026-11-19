#!/usr/bin/env python3
"""Build the HSK 3.0 data (levels 1–6) used by the app.

Inputs
  source/hsk30/HSK3.0_words_level{1..6}.json   word lists (npm @leonsilicon/hsk3.0, from github.com/leonsilicon/hsk3.0)
  source/hsk30/HSK3.0_chars_level{1..6}.json   character lists (same package)
  data/hsk.json                                 HSK 2.0 words already annotated by hand (pinyin, Vietnamese)
  --cedict PATH                                 CC-CEDICT as JSON (npm cedict-json), for English glosses and pinyin

Outputs (one file per level, so new levels or characters can be added without touching code)
  data/hsk30/words-{1..6}.json   [{h, alt?, p, en, vi?, l}]
  data/hsk30/chars-{1..6}.json   [{h, p, en, vi?, l}]
  data/hsk30/index.json          levels with counts and how many entries still lack Vietnamese

Pinyin and English come from CC-CEDICT (CC BY-SA 4.0). Vietnamese comes only from the HSK 2.0
annotations that already exist; entries without it show English in the app and are listed in
the report, so they can be filled in later.

Usage: python3 tools/build-hsk30.py --cedict /path/to/cedict.json
"""
import argparse
import json
import pathlib
import re
import sys
from collections import Counter

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
SRC = ROOT / "source" / "hsk30"
OUT = ROOT / "data" / "hsk30"
LEVELS = range(1, 7)

TONES = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}
BAD_FIRST = re.compile(
    r"^(surname|erhua|variant|used in|see |old variant|abbr|also |CL:|\(bound|\(Tw\)|Japanese|Korean|Taiwan|"
    r"Cantonese|\(dialect|\(old|\(classical|\(literary|\(onom|\(interj|name of|Mount|River|County|Province|"
    r"Chinese|\(Chinese|city|Kingdom|dynasty|Shang|\(ancient|\(of|\(Buddhist|\(chess|\(Taoist)",
    re.I,
)


def numbered_to_marked(syl: str) -> str:
    m = re.match(r"^([A-Za-zü:]+)([1-5])$", syl)
    if not m:
        return syl
    base = m.group(1).replace("u:", "ü").replace("U:", "Ü").replace("v", "ü")
    tone = int(m.group(2))
    if tone == 5:
        return base
    if "a" in base:
        idx = base.find("a")
    elif "e" in base:
        idx = base.find("e")
    elif "ou" in base:
        idx = base.find("o")
    else:
        idx = max((base.rfind(v) for v in ("i", "o", "u", "ü") if v in base), default=-1)
        if idx < 0:
            return base
    ch = base[idx]
    return base[:idx] + TONES[ch][tone - 1] + base[idx + 1:]


def pinyin_marked(p: str) -> str:
    return " ".join(numbered_to_marked(s) for s in p.split())


def best_entry(entries):
    def penalty(e):
        first = e["english"][0] if e["english"] else ""
        p = 10 if BAD_FIRST.search(first) else 0
        if re.search(r"\bsurname\b", " ".join(e["english"][:1])):
            p += 10
        if e["pinyin"].strip().endswith(" r") or e["pinyin"].strip().endswith("r5"):
            p += 2
        return p
    return min(entries, key=penalty)


def clean_gloss(glosses) -> str:
    keep = []
    for g in glosses:
        g = re.sub(r"\[[^\]]*\]", "", g)
        g = re.sub(r"\|[^;]*", "", g)
        g = re.sub(r"CL:[^;]*", "", g)
        g = re.sub(r"\(bound form\)\s*", "", g)
        g = re.sub(r"\s+", " ", g).strip(" ;,")
        if not g or g.startswith(("variant of", "erhua variant", "old variant", "see ")):
            continue
        keep.append(g)
        if len(keep) == 3:
            break
    return "; ".join(keep)


# Compounds that CC-CEDICT does not list under this exact form (checked by hand).
OVERRIDES = {
    "车上": ("chē shàng", "on the bus; in the car"),
    "不太": ("bú tài", "not very; not too"),
    "不一会儿": ("bù yíhuìr", "before long; in a moment"),
    "见过": ("jiànguo", "to have seen; to have met"),
    "送到": ("sòngdào", "to deliver to"),
    "这时候": ("zhè shíhou", "now; at this time"),
    "放到": ("fàngdào", "to put (somewhere)"),
    "能不能": ("néng bu néng", "can or cannot"),
    "眼里": ("yǎn lǐ", "in one's eyes"),
    "有劲儿": ("yǒu jìnr", "energetic; strong"),
    "城里": ("chéng lǐ", "in town; in the city"),
    "很难说": ("hěn nán shuō", "hard to say"),
    "一番": ("yì fān", "a (certain) amount; a round of"),
    "指着": ("zhǐzhe", "to point at with a finger"),
}


def normalize_form(text: str) -> str:
    """Trim spaces and drop the sense number some lists add ("称1" -> "称")."""
    return re.sub(r"\d+$", "", text.strip())


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_vietnamese(kind: str, level: int) -> dict:
    """Vietnamese meanings written by hand, in source/hsk30/vi/<kind>-<level>.tsv (hanzi TAB meaning)."""
    path = SRC / "vi" / f"{kind}-{level}.tsv"
    out = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "\t" in line:
                hanzi, meaning = line.split("\t", 1)
                if meaning.strip():
                    out.setdefault(hanzi.strip(), meaning.strip())
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cedict", required=True, help="path to cedict.json (npm cedict-json)")
    args = ap.parse_args()

    cedict = load_json(pathlib.Path(args.cedict))
    by_simp = {}
    for e in cedict:
        by_simp.setdefault(e["simplified"], []).append(e)

    # Hand-annotated HSK 2.0 entries: reuse pinyin and Vietnamese where they overlap.
    known = {}
    for x in load_json(ROOT / "data" / "hsk.json"):
        known.setdefault(x["h"], x)

    def gloss(hanzi):
        entries = by_simp.get(hanzi)
        if not entries:
            return None, ""
        e = best_entry(entries)
        return pinyin_marked(e["pinyin"]), clean_gloss(e["english"])

    OUT.mkdir(parents=True, exist_ok=True)
    index, missing_vi = [], {}
    for lv in LEVELS:
        vi_words = load_vietnamese("words", lv)
        vi_chars = load_vietnamese("chars", lv)
        words, seen = [], set()
        for raw in load_json(SRC / f"HSK3.0_words_level{lv}.json"):
            forms = raw if isinstance(raw, list) else raw.split("|")
            forms = [normalize_form(f) for f in forms]
            forms = [f for f in forms if f]
            if not forms or "…" in forms[0]:
                continue  # sentence patterns such as "…极了", not dictionary words
            h, alt = forms[0], forms[1:]
            if h in seen:
                continue
            seen.add(h)
            cedict_p, en = gloss(h)
            if h in OVERRIDES and not cedict_p:
                cedict_p, en = OVERRIDES[h]
            prior = known.get(h)
            entry = {"h": h}
            if alt:
                entry["alt"] = alt
            entry["p"] = prior["p"] if prior else (cedict_p or "")
            entry["en"] = (prior.get("en") if prior and prior.get("en") else en)
            if prior and prior.get("vi"):
                entry["vi"] = prior["vi"]
            elif h in vi_words:
                entry["vi"] = vi_words[h]
            entry["l"] = lv
            words.append(entry)
        (OUT / f"words-{lv}.json").write_text(json.dumps(words, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

        chars, cseen = [], set()
        for c in load_json(SRC / f"HSK3.0_chars_level{lv}.json"):
            if c in cseen:
                continue
            cseen.add(c)
            cedict_p, en = gloss(c)
            prior = known.get(c)
            entry = {"h": c, "p": (prior["p"] if prior else (cedict_p or "")), "en": en or (prior or {}).get("en", "")}
            if prior and prior.get("vi"):
                entry["vi"] = prior["vi"]
            elif c in vi_chars:
                entry["vi"] = vi_chars[c]
            entry["l"] = lv
            chars.append(entry)
        (OUT / f"chars-{lv}.json").write_text(json.dumps(chars, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

        missing_vi[lv] = (sum(1 for w in words if not w.get("vi")), sum(1 for c in chars if not c.get("vi")))
        index.append({"level": lv, "words": len(words), "chars": len(chars),
                      "wordsWithoutVi": missing_vi[lv][0], "charsWithoutVi": missing_vi[lv][1]})

    (OUT / "index.json").write_text(json.dumps({"version": "3.0", "levels": index}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print("level  words  chars  words-no-vi  chars-no-vi")
    for r in index:
        print(f"{r['level']:>5}  {r['words']:>5}  {r['chars']:>5}  {r['wordsWithoutVi']:>11}  {r['charsWithoutVi']:>11}")
    print("total", sum(r["words"] for r in index), "words;", sum(r["chars"] for r in index), "chars")
    return 0


if __name__ == "__main__":
    sys.exit(main())
