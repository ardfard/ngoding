from pathlib import Path

grid = [list(row) for row in Path.home().joinpath("challenge/islands/map.txt").read_text().splitlines()]
count = largest = 0
for r, row in enumerate(grid):
    for c, cell in enumerate(row):
        if cell != "#":
            continue
        count += 1
        grid[r][c] = "."
        todo, size = [(r, c)], 0
        while todo:
            y, x = todo.pop()
            size += 1
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < len(grid) and 0 <= nx < len(grid[ny]) and grid[ny][nx] == "#":
                    grid[ny][nx] = "."
                    todo.append((ny, nx))
        largest = max(largest, size)
out = Path.home() / "output/islands.txt"
out.parent.mkdir(exist_ok=True)
out.write_text(f"islands {count}\nlargest {largest}\n")
