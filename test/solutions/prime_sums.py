from pathlib import Path


def is_prime(n):
    if n < 2:
        return False
    d = 2
    while d * d <= n:
        if n % d == 0:
            return False
        d += 1
    return True


lines = Path.home().joinpath("challenge/prime-sums/input.txt").read_text().splitlines()
sums = [sum(n for n in map(int, line.split()) if is_prime(n)) for line in lines]
out = Path.home() / "output/prime_sums.txt"
out.parent.mkdir(exist_ok=True)
out.write_text("".join(f"{s}\n" for s in sums))
