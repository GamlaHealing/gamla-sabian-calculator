#!/usr/bin/env python3
"""Turn sabian_degree_map.csv into the compact JSON the browser loads.

Keyed "Sign Degree" (e.g. "Aries 1"). Only the fields the page shows are kept.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
rows = {}
with open(ROOT / "data" / "sabian_degree_map.csv", newline="", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        rows[f"{r['sign']} {int(r['degree'])}"] = {
            "symbol": r["symbol"], "keyword": r["jones_keyword"],
            "title": r["title"], "url": r["url"],
        }
assert len(rows) == 360, len(rows)
(ROOT / "data" / "sabian_degree_map.json").write_text(
    json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
print(f"{len(rows)} degrees -> data/sabian_degree_map.json")
