import re
from collections import Counter
from pathlib import Path

text = Path.home().joinpath("challenge/word-freq/input.txt").read_text()
counts = Counter(w for w in re.split(r"[\s,.;!]+", text) if w)
top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
out = Path.home() / "output/word_freq.txt"
out.parent.mkdir(exist_ok=True)
out.write_text("".join(f"{w} {c}\n" for w, c in top))
