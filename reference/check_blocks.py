#!/usr/bin/env python3
"""Mechanical brand-voice check for content/soul_blocks.json. Counts, never judges."""
import json, re, sys
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
BANNED = ["journey", "manifest", "aligned", "abundance", "unlock", "let go", "letting go",
          "genuine", "genuinely", "real", "really", "actual", "actually", "honest", "honestly",
          "true", "truly", "truer", "meaningfully", "productively", "embrace", "energy", "vibration"]
data = json.loads((ROOT / "content" / "soul_blocks.json").read_text())
problems = 0
openers = Counter()
for group, blocks in data.items():
    if group.startswith("_"): continue
    for key, b in blocks.items():
        t = b["text"]; words = len(t.split()); issues = []
        if "—" in t or "–" in t: issues.append("em/en dash")
        for w in BANNED:
            n = len(re.findall(rf"\b{re.escape(w)}\b", t, re.I))
            if n: issues.append(f"'{w}' x{n}")
        if t.rstrip().endswith("?"): issues.append("ends on a question")
        if "?" in t: issues.append("contains a question")
        if not 60 <= words <= 110: issues.append(f"{words} words (target 60-110)")
        if not re.search(r"\byou(r|rs|rself)?\b", t, re.I): issues.append("no direct 'you'")
        openers[" ".join(t.split()[:3])] += 1
        problems += bool(issues)
        print(f"{group}/{key:<12} {words:>3} words  {'OK' if not issues else '; '.join(issues)}")
dups = {k: v for k, v in openers.items() if v > 1}
print("repeated block openings:", dups or "none")
# Formulaic skeletons: the same 3-word sentence start used in 4+ blocks.
starts = Counter()
for group, blocks in data.items():
    if group.startswith("_"): continue
    for b in blocks.values():
        for sent in re.split(r"(?<=[.:])\s+", b["text"]):
            starts[" ".join(sent.split()[:3]).lower()] += 1
print("sentence starts used 4+ times:", {k: v for k, v in starts.items() if v >= 4} or "none")
sys.exit(1 if problems else 0)
