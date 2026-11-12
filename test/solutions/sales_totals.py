import csv
from collections import defaultdict
from pathlib import Path

totals = defaultdict(int)
with Path.home().joinpath("challenge/sales-totals/sales.csv").open(newline="") as f:
    for row in csv.DictReader(f):
        totals[row["region"]] += int(row["quantity"]) * int(row["unit_price"])
rows = sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))
out = Path.home() / "output/sales_totals.txt"
out.parent.mkdir(exist_ok=True)
out.write_text("".join(f"{region} {total}\n" for region, total in rows))
