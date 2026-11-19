#!/usr/bin/env python3
"""Compare the app data in data/ with the three source spreadsheets in source/.

Usage:  python3 tools/check-excel.py        (needs: pip install openpyxl)

Checks, lesson by lesson (Quyển + Bài) for the 20-lesson workbook:
  - vocabulary: same set of simplified words per lesson
  - grammar: same structures per lesson (ids G001...)
  - Quyển 1 sentences and Quyển 2 dialogue turns: same Chinese text per lesson
and for the HSK grammar workbooks:
  - every grammar pattern in the sheets exists in data/grammar/hsk.json at the same level
  - the number of "easy to confuse" pairs matches data/grammar/pairs.json

Rows that are empty in the spreadsheets are reported as warnings (gaps in the source).
Exit code 0 = app matches the spreadsheets, 1 = differences found.
"""
import json
import pathlib
import re
import sys
from collections import defaultdict

try:
    import openpyxl
except ImportError:
    sys.exit("Cần openpyxl: pip install openpyxl")

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "source"
DATA = ROOT / "data"
WORK_XLSX = SRC / "Du_Lieu_Tu_Vung_Ngu_Phap_App_Tieng_Trung_20_Bai.xlsx"
HSK13_XLSX = SRC / "Tong_hop_ngu_phap_HSK1-3.xlsx"
HSK4_XLSX = SRC / "HSK4_ngu_phap.xlsx"

problems: list[str] = []
warnings: list[str] = []


def norm(text) -> str:
    """Compare Chinese text ignoring spaces, ellipses and full-width/half-width punctuation."""
    s = str(text or "")
    s = re.sub(r"[\s…]|\.\.\.", "", s)
    return s.translate(str.maketrans("，。？！：；（）", ",.?!:;()"))


def load_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sheet_rows(path: pathlib.Path, sheet: str, header_cell: str):
    """Rows as dicts, starting after the first row that contains `header_cell`."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = [r for r in wb[sheet].iter_rows(values_only=True)]
    start = next(i for i, r in enumerate(rows) if header_cell in [str(c) for c in r])
    header = rows[start]
    return [dict(zip(header, r)) for r in rows[start + 1:]]


def lesson_id(book_label, num) -> str:
    book = int(re.search(r"\d+", str(book_label)).group())
    return f"q{book}-{int(num):02d}"


def check_work() -> None:
    index = {x["id"]: x for x in load_json(DATA / "work" / "index.json")}
    lessons = {lid: load_json(DATA / "work" / f"{lid}.json") for lid in index}

    excel_words, excel_grammar = defaultdict(set), defaultdict(set)
    for r in sheet_rows(WORK_XLSX, "Tu_Vung", "ID"):
        if r.get("Giản thể"):
            excel_words[lesson_id(r["Nguồn"], r["Bài"])].add(norm(r["Giản thể"]))
    for r in sheet_rows(WORK_XLSX, "Ngu_Phap", "ID"):
        if r.get("ID"):
            excel_grammar[lesson_id(r["Nguồn"], r["Bài"])].add(r["ID"])

    excel_sentences, excel_turns = defaultdict(list), defaultdict(list)
    for r in sheet_rows(WORK_XLSX, "Mau_Cau_Q1", "ID"):
        if r.get("Tiếng Trung"):
            excel_sentences[lesson_id(1, r["Bài"])].append(norm(r["Tiếng Trung"]))
    for r in sheet_rows(WORK_XLSX, "Hoi_Thoai_Q2", "ID"):
        if r.get("Tiếng Trung"):
            excel_turns[lesson_id(2, r["Bài"])].append(norm(r["Tiếng Trung"]))

    expected = set(excel_words) | set(excel_grammar) | set(excel_sentences) | set(excel_turns)
    for lid in sorted(expected - set(lessons)):
        problems.append(f"Bài {lid} có trong Excel nhưng không có trong app")
    for lid in sorted(set(lessons) - expected):
        problems.append(f"Bài {lid} có trong app nhưng không có trong Excel")

    for lid, lesson in sorted(lessons.items()):
        title = lesson["title"]
        # The spreadsheet writes alternatives in one cell ("工作证/工作卡"); the app keeps the
        # first form in "h" and the others in "alt", so rebuild the cell text to compare.
        app_words = {norm("/".join([w["h"], *w.get("alt", [])])) for s in lesson["sections"] for w in s["words"]}
        missing, extra = excel_words[lid] - app_words, app_words - excel_words[lid]
        if missing:
            problems.append(f"{title}: thiếu {len(missing)} từ: {', '.join(sorted(missing)[:8])}")
        if extra:
            problems.append(f"{title}: thừa {len(extra)} từ không có trong Excel: {', '.join(sorted(extra)[:8])}")

        app_grammar = {g["id"] for g in lesson["grammar"]}
        if app_grammar != excel_grammar[lid]:
            problems.append(f"{title}: ngữ pháp khác Excel (app {sorted(app_grammar)}, Excel {sorted(excel_grammar[lid])})")

        app_sentences = [norm(s["zh"]) for s in lesson["sentences"]]
        if sorted(app_sentences) != sorted(excel_sentences[lid]):
            problems.append(f"{title}: mẫu câu khác Excel ({len(app_sentences)} trong app, {len(excel_sentences[lid])} trong Excel)")

        app_turns = [norm(t["zh"]) for d in lesson["dialogues"] for t in d["turns"]]
        if sorted(app_turns) != sorted(excel_turns[lid]):
            problems.append(f"{title}: hội thoại khác Excel ({len(app_turns)} lượt trong app, {len(excel_turns[lid])} trong Excel)")

        counts = index[lid]["counts"]
        real = {"words": sum(len(s["words"]) for s in lesson["sections"]), "grammar": len(lesson["grammar"]),
                "sentences": len(lesson["sentences"]), "dialogues": len(lesson["dialogues"])}
        if any(counts.get(k) != v for k, v in real.items()):
            problems.append(f"{title}: số đếm trong index.json {counts} khác nội dung bài {real}")

    print(f"Công việc: {len(lessons)} bài, "
          f"{sum(len(v) for v in excel_words.values())} từ (không trùng trong bài), "
          f"{sum(len(v) for v in excel_grammar.values())} ngữ pháp, "
          f"{sum(len(v) for v in excel_sentences.values())} mẫu câu, "
          f"{sum(len(v) for v in excel_turns.values())} lượt hội thoại")


def check_hsk_grammar() -> None:
    app = load_json(DATA / "grammar" / "hsk.json")
    app_patterns = {(g["level"], norm(g["pattern"])) for g in app}
    sheet_count = 0

    for r in sheet_rows(HSK13_XLSX, "Ngữ pháp HSK 1-3", "STT"):
        level, pattern = r.get("Cấp độ"), r.get("Mẫu ngữ pháp")
        if not level and not pattern:
            continue  # footer note row
        if not pattern:
            warnings.append(f"Excel HSK 1-3: dòng STT {r.get('STT')} không có mẫu ngữ pháp")
            continue
        sheet_count += 1
        lv = int(re.search(r"\d", str(level)).group())
        if (lv, norm(pattern)) not in app_patterns:
            problems.append(f"Ngữ pháp HSK {lv} thiếu trong app: {pattern}")

    for r in sheet_rows(HSK4_XLSX, "Ngữ pháp tổng hợp", "STT"):
        pattern = r.get("Mẫu ngữ pháp")
        if not r.get("STT"):
            continue
        if not pattern:
            warnings.append(f"Excel HSK 4 ({r.get('Quyển')}): dòng STT {r.get('STT')} để trống")
            continue
        sheet_count += 1
        if (4, norm(pattern)) not in app_patterns:
            problems.append(f"Ngữ pháp HSK 4 thiếu trong app: {pattern}")

    if sheet_count != len(app):
        problems.append(f"Ngữ pháp HSK: Excel có {sheet_count} mẫu, app có {len(app)}")
    print(f"Ngữ pháp HSK: Excel {sheet_count} mẫu, app {len(app)} mẫu")

    pairs13 = [r for r in sheet_rows(HSK13_XLSX, "Cặp dễ nhầm", "Cặp") if r.get("Cặp")]
    pairs4 = [r for r in sheet_rows(HSK4_XLSX, "Phân biệt dễ nhầm", "Chủ điểm") if r.get("Chủ điểm")]
    app_pairs = load_json(DATA / "grammar" / "pairs.json")
    if len(pairs13) + len(pairs4) != len(app_pairs):
        problems.append(f"Cặp dễ nhầm: Excel {len(pairs13) + len(pairs4)}, app {len(app_pairs)}")
    print(f"Cặp dễ nhầm: Excel {len(pairs13)} + {len(pairs4)}, app {len(app_pairs)}")


def main() -> int:
    for path in (WORK_XLSX, HSK13_XLSX, HSK4_XLSX):
        if not path.exists():
            sys.exit(f"Không thấy file nguồn: {path}")
    check_work()
    check_hsk_grammar()
    for w in warnings:
        print(f"CẢNH BÁO  {w}")
    for p in problems:
        print(f"KHÁC      {p}")
    print("KẾT QUẢ:", "khớp với Excel" if not problems else f"{len(problems)} chỗ khác")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
