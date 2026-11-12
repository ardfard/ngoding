from collections import Counter
from pathlib import Path

log = Path.home().joinpath("challenge/log-status/access.log").read_text()
counts = Counter(int(line.split('"')[2].split()[0]) for line in log.splitlines())
rows = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
out = Path.home() / "output/log_status.txt"
out.parent.mkdir(exist_ok=True)
out.write_text("".join(f"{code} {n}\n" for code, n in rows))
