// Problem catalogue (server-side only). Each problem generates its input from a
// per-student seed, so answers can't be copied between students, and knows how
// to compute the expected output for that input. Only the text and the
// generated inputs are sent to the browser; solve() never leaves the server.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, xs) => xs[Math.floor(rng() * xs.length)];

const VOCAB = [
  "linux", "python", "kernel", "shell", "file", "pipe", "socket", "thread",
  "process", "memory", "cache", "buffer", "stream", "signal", "module",
  "package", "string", "integer", "list", "dict", "tuple", "lambda", "yield",
];

function isPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

export const PROBLEMS = [
  {
    id: "word-freq",
    title: "Word frequency",
    inputFile: "/home/user/challenge/word-freq/input.txt",
    outputFile: "/home/user/output/word_freq.txt",
    description: `
<p><code>~/challenge/word-freq/input.txt</code> contains English-ish text. Words are lowercase and separated by
spaces, newlines, and the punctuation <code>, . ; !</code></p>
<p>Write the <b>5 most frequent words</b> to <code>~/output/word_freq.txt</code>, one per line, formatted as
<code>word count</code>. Sort by count descending, then alphabetically to break ties.</p>
<pre>python    42
shell     40
...</pre>
<p class="hint">The example output above is padded for readability. Use a single space: <code>python 42</code>.</p>`,
    generate(rng) {
      const lines = [];
      const nLines = randInt(rng, 40, 80);
      // skew the distribution so there is a clear top 5
      const weights = VOCAB.map(() => rng() ** 3);
      const total = weights.reduce((a, b) => a + b, 0);
      const weighted = () => {
        let r = rng() * total;
        for (let i = 0; i < VOCAB.length; i++) {
          r -= weights[i];
          if (r <= 0) return VOCAB[i];
        }
        return VOCAB[VOCAB.length - 1];
      };
      for (let i = 0; i < nLines; i++) {
        const words = [];
        const n = randInt(rng, 4, 14);
        for (let j = 0; j < n; j++) {
          words.push(weighted() + (rng() < 0.12 ? pick(rng, [",", ".", ";", "!"]) : ""));
        }
        lines.push(words.join(" "));
      }
      return lines.join("\n") + "\n";
    },
    solve(input) {
      const counts = new Map();
      for (const w of input.split(/[\s,.;!]+/).filter(Boolean)) {
        counts.set(w, (counts.get(w) ?? 0) + 1);
      }
      return [...counts]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .slice(0, 5)
        .map(([w, c]) => `${w} ${c}`)
        .join("\n") + "\n";
    },
  },
  {
    id: "prime-sums",
    title: "Prime sums",
    inputFile: "/home/user/challenge/prime-sums/input.txt",
    outputFile: "/home/user/output/prime_sums.txt",
    description: `
<p>Each line of <code>~/challenge/prime-sums/input.txt</code> holds space-separated integers.</p>
<p>For every input line, write <b>the sum of the prime numbers on that line</b> to
<code>~/output/prime_sums.txt</code> (one number per line, same order). A line with no primes sums to <code>0</code>.</p>
<pre>input:  4 7 9 11      output: 18
        1 4 6                 0</pre>`,
    generate(rng) {
      const lines = [];
      const nLines = randInt(rng, 200, 400);
      for (let i = 0; i < nLines; i++) {
        const n = randInt(rng, 1, 12);
        const nums = Array.from({ length: n }, () => randInt(rng, 0, 100000));
        lines.push(nums.join(" "));
      }
      return lines.join("\n") + "\n";
    },
    solve(input) {
      return input
        .trimEnd()
        .split("\n")
        .map((line) =>
          line.split(/\s+/).filter(Boolean).map(Number).filter(isPrime).reduce((a, b) => a + b, 0),
        )
        .join("\n") + "\n";
    },
  },
];

// Normalise whitespace so trailing spaces / a missing final newline don't fail a
// correct answer.
const normalise = (s) => s.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trimEnd();

export function grade(expected, actual) {
  if (actual === null) return { ok: false, message: "Output file not found." };
  const exp = normalise(expected).split("\n");
  const act = normalise(actual).split("\n");
  for (let i = 0; i < Math.max(exp.length, act.length); i++) {
    if (exp[i] !== act[i]) {
      return {
        ok: false,
        message:
          act[i] === undefined ? `Output ends early: expected ${exp.length} lines, got ${act.length}.`
          : exp[i] === undefined ? `Too many lines: expected ${exp.length}, got ${act.length}.`
          : `Line ${i + 1} is wrong: got "${act[i]}".`,
      };
    }
  }
  return { ok: true, message: `All ${exp.length} lines correct.` };
}

// What the browser may see about a problem.
export const publicProblem = ({ id, title, description, inputFile, outputFile }) =>
  ({ id, title, description, inputFile, outputFile });

export const inputsFor = (seed) =>
  Object.fromEntries(PROBLEMS.map((p, i) => [p.id, p.generate(mulberry32(seed + i * 7919))]));
