from pathlib import Path

key, *lines = Path.home().joinpath("challenge/caesar/message.txt").read_text().splitlines()
shift = int(key.split()[1])


def decrypt(ch):
    if "a" <= ch <= "z":
        return chr((ord(ch) - ord("a") - shift) % 26 + ord("a"))
    return ch


out = Path.home() / "output/caesar.txt"
out.parent.mkdir(exist_ok=True)
out.write_text("".join("".join(map(decrypt, line)) + "\n" for line in lines))
