from collections import defaultdict
from pathlib import Path


def minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


totals = defaultdict(int)
for line in Path.home().joinpath("challenge/timesheet/timesheet.txt").read_text().splitlines():
    task, start, end = line.split()
    totals[task] += minutes(end) - minutes(start)
rows = sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))
out = Path.home() / "output/timesheet.txt"
out.parent.mkdir(exist_ok=True)
out.write_text("".join(f"{task} {m // 60}:{m % 60:02d}\n" for task, m in rows))
