from pathlib import Path

CLOSER = {"(": ")", "[": "]", "{": "}"}


def check(line):
    stack = []
    for i, ch in enumerate(line, 1):
        if ch in CLOSER:
            stack.append(CLOSER[ch])
        elif not stack or stack.pop() != ch:
            return f"error at {i}"
    return "incomplete" if stack else "ok"


lines = Path.home().joinpath("challenge/brackets/input.txt").read_text().splitlines()
out = Path.home() / "output/brackets.txt"
out.parent.mkdir(exist_ok=True)
out.write_text("".join(check(line) + "\n" for line in lines))
