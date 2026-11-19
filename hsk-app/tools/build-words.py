# Merges base levels with hand-written annotations into data/words.json.
# Each annotation line: hanzi <TAB> pinyin <TAB> english <TAB> vietnamese
# Levels come from the HSK 2.0 lists (via base.json); the 10 entries in extra.tsv
# carry their levels explicitly because they are not in the CEDICT-based base list.
import json, pathlib, collections
here = pathlib.Path(__file__).parent
EXTRA_LEVEL = {'周末': 3, '然后': 3, '允许': 4, '因为……所以……': 2, '虽然……但是……': 2,
               '不但……而且……': 3, '只有……才……': 3, '打篮球': 2, '踢足球': 2, '弹钢琴': 4}

levels = {r['hanzi']: r['level'] for r in json.load(open(here / 'base.json', encoding='utf-8'))}
levels.update(EXTRA_LEVEL)

rows = {}
for f in ['L1.tsv', 'L2.tsv', 'L3.tsv', 'L4a.tsv', 'extra.tsv']:
    for n, line in enumerate((here / 'annotations' / f).read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip():
            continue
        parts = line.split('\t')
        assert len(parts) == 4, f'{f}:{n} has {len(parts)} columns'
        hanzi, pinyin, en, vi = (p.strip() for p in parts)
        assert hanzi not in rows, f'duplicate {hanzi} in {f}:{n}'
        assert all([hanzi, pinyin, en, vi]), f'empty field {f}:{n}'
        rows[hanzi] = dict(hanzi=hanzi, pinyin=pinyin, en=en, vi=vi)

missing = set(levels) - set(rows)
extra = set(rows) - set(levels)
assert not missing, f'no annotation for {sorted(missing)}'
assert not extra, f'annotation not in list: {sorted(extra)}'

out = []
order = sorted(rows.values(), key=lambda r: (levels[r['hanzi']], r['hanzi']))
for i, r in enumerate(order, 1):
    out.append({'id': f'w{i:04d}', 'hanzi': r['hanzi'], 'pinyin': r['pinyin'],
                'vi': r['vi'], 'en': r['en'], 'level': levels[r['hanzi']]})

dest = here.parent / 'data' / 'words.json'
dest.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print('wrote', len(out), dict(collections.Counter(w['level'] for w in out)))
