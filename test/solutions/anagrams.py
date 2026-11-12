from collections import defaultdict
from pathlib import Path

groups = defaultdict(list)
for word in Path.home().joinpath("challenge/anagrams/words.txt").read_text().split():
    groups["".join(sorted(word))].append(word)
found = sorted((sorted(g) for g in groups.values() if len(g) > 1), key=lambda g: (-len(g), g[0]))
out = Path.home() / "output/anagrams.txt"
out.parent.mkdir(exist_ok=True)
out.write_text("".join(" ".join(g) + "\n" for g in found))
