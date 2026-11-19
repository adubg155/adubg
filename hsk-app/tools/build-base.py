# Builds the base HSK 1-4 list (hanzi, pinyin, English, level) from:
#   - HSK 2.0 word lists (npm: @leonsilicon/hsk2.0)  -> level membership
#   - CC-CEDICT (npm: cedict-json, CC BY-SA 4.0)      -> pinyin and English glosses
# Output: tools/base.json  (Vietnamese meanings are added in a separate step)
import json, sys, unicodedata, re, pathlib

HSK_DIR, CEDICT = sys.argv[1], sys.argv[2]
out = pathlib.Path(__file__).parent / 'base.json'

TONES = {'a': 'āáǎà', 'e': 'ēéěè', 'i': 'īíǐì', 'o': 'ōóǒò', 'u': 'ūúǔù', 'ü': 'ǖǘǚǜ'}

def numbered_to_marked(syl):
    m = re.match(r'^([A-Za-zü:]+)([1-5])$', syl)
    if not m:
        return syl
    base, tone = m.group(1).replace('u:', 'ü').replace('U:', 'Ü'), int(m.group(2))
    if tone == 5:
        return base
    base = base.replace('v', 'ü')
    target = None
    for v in ('a', 'e'):
        if v in base:
            target = v
            break
    if target is None:
        if 'ou' in base:
            target = 'o'
        else:
            for v in ('i', 'o', 'u', 'ü'):
                if v in base:
                    target = v
                    break
    if target is None:
        return base
    idx = base.rfind(target) if target != 'a' and target != 'e' else base.find(target)
    if target in ('a', 'e'):
        idx = base.find(target)
    ch = base[idx]
    base = base[:idx] + TONES[ch][tone - 1] + base[idx + 1:]
    return base

def pinyin_marked(p):
    return ' '.join(numbered_to_marked(s) for s in p.split()).replace('Ü', 'Ü')

BAD_FIRST = re.compile(r'^(surname|erhua|variant|used in|see |old variant|abbr|also |CL:|\(bound|\(Tw\)|Japanese|Korean|Taiwan|Cantonese|\(dialect|\(old|\(classical|\(literary|\(onom|\(interj|name of|Mount|River|County|Province|Chinese|\(Chinese|city|Kingdom|dynasty|Shang|\(ancient|\(of|\(Buddhist|\(chess|\(Taoist)', re.I)

def best_entry(entries):
    def penalty(e):
        first = e['english'][0] if e['english'] else ''
        p = 0
        if BAD_FIRST.search(first):
            p += 10
        if re.search(r'\bsurname\b', ' '.join(e['english'][:1])):
            p += 10
        if e['pinyin'].strip().lower().endswith(' r') or e['pinyin'].strip().endswith('r5'):
            p += 2
        return p
    return min(entries, key=penalty)

def clean_gloss(glosses):
    keep = []
    for g in glosses:
        g = re.sub(r'\[[^\]]*\]', '', g)          # [pinyin] cross-refs
        g = re.sub(r'\|[^;]*', '', g)              # 繁|简 variants
        g = re.sub(r'CL:[^;]*', '', g)              # measure-word notes
        g = re.sub(r'\(bound form\)\s*', '', g)
        g = re.sub(r'\s+', ' ', g).strip(' ;,')
        if not g or g.startswith(('variant of', 'erhua variant', 'old variant', 'see ')):
            continue
        keep.append(g)
        if len(keep) == 3:
            break
    return '; '.join(keep) if keep else ''

levels = {}
for lv in range(1, 5):
    words = json.load(open(f'{HSK_DIR}/HSK2.0_words_level{lv}.json', encoding='utf-8'))
    for w in words:
        w = w.strip()
        if w and w not in levels:
            levels[w] = lv

cedict = json.load(open(CEDICT, encoding='utf-8'))
by_simp = {}
for e in cedict:
    by_simp.setdefault(e['simplified'], []).append(e)

out_rows, missing = [], []
for hanzi, lv in sorted(levels.items(), key=lambda kv: (kv[1], kv[0])):
    entries = by_simp.get(hanzi)
    if not entries:
        missing.append(hanzi)
        continue
    e = best_entry(entries)
    english = clean_gloss(e['english'])
    out_rows.append({'hanzi': hanzi, 'pinyin': pinyin_marked(e['pinyin']), 'en': english, 'level': lv})

out.write_text(json.dumps(out_rows, ensure_ascii=False, indent=1), encoding='utf-8')
from collections import Counter
print('total', len(out_rows), 'by level', dict(Counter(r['level'] for r in out_rows)))
print('missing in cedict:', len(missing), missing[:40])
