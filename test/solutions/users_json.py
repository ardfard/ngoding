import json
from pathlib import Path

users = json.loads(Path.home().joinpath("challenge/users-json/users.json").read_text())
cities = {}
for u in users:
    if not u["active"]:
        continue
    count, best = cities.get(u["city"], (0, None))
    if best is None or (-u["age"], u["name"]) < (-best["age"], best["name"]):
        best = u
    cities[u["city"]] = (count + 1, best)
out = Path.home() / "output/users_json.txt"
out.parent.mkdir(exist_ok=True)
out.write_text("".join(f"{city} {n} {best['name']}\n" for city, (n, best) in sorted(cities.items())))
