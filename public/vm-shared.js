// Pieces both VM modules share (vm.js on v86, vm-unkernel.js on unkernel).

// A directory listing as image/agent.sh prints it: one "d\tname" or "f\tname"
// per entry, sorted.
export function parseLs(text) {
  if (!text) return [];
  return text.split("\n").filter(Boolean).map((line) => {
    const [type, name] = line.split("\t");
    return { type: type === "d" ? "dir" : "file", name };
  });
}

// The same listing from a shell, for the unkernel VM ($1 is the directory).
export const LS_SCRIPT =
  "[ -d \"$1\" ] || exit 1; find \"$1\" -mindepth 1 -maxdepth 1 \\( -type d -printf 'd\\t%f\\n' -o -printf 'f\\t%f\\n' \\) | sort";

// The unkernel app's saves live under their own keys.
export const unkKey = (saveKey) => (saveKey.startsWith("unk:") ? saveKey : `unk:${saveKey}`);
