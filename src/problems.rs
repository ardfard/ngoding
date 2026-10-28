// Problem catalogue (server-side only). Each problem generates its input from a
// per-student seed, so answers can't be copied between students, and knows how
// to compute the expected output for that input. Only the text and the
// generated inputs are sent to the browser; solve() never leaves the server.
use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

/// Same generator as the original JS version (mulberry32), so a seed keeps
/// producing the same inputs.
pub fn mulberry32(seed: u32) -> impl FnMut() -> f64 {
    let mut a = seed;
    move || {
        a = a.wrapping_add(0x6d2b79f5);
        let mut t = a;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        (t ^ (t >> 14)) as f64 / 4294967296.0
    }
}

type Rng<'a> = &'a mut dyn FnMut() -> f64;

fn rand_int(rng: Rng, lo: u32, hi: u32) -> u32 {
    lo + (rng() * (hi - lo + 1) as f64) as u32
}

fn pick<T: Copy>(rng: Rng, xs: &[T]) -> T {
    xs[(rng() * xs.len() as f64) as usize]
}

const VOCAB: &[&str] = &[
    "linux", "python", "kernel", "shell", "file", "pipe", "socket", "thread",
    "process", "memory", "cache", "buffer", "stream", "signal", "module",
    "package", "string", "integer", "list", "dict", "tuple", "lambda", "yield",
];

fn is_prime(n: u64) -> bool {
    if n < 2 {
        return false;
    }
    let mut d = 2;
    while d * d <= n {
        if n.is_multiple_of(d) {
            return false;
        }
        d += 1;
    }
    true
}

/// What the browser may see about a problem.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Problem {
    pub id: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub input_file: &'static str,
    pub output_file: &'static str,
    /// Where the editor keeps the student's program.
    pub solution_file: &'static str,
    #[serde(skip)]
    pub generate: fn(Rng) -> String,
    #[serde(skip)]
    pub solve: fn(&str) -> String,
}

pub static PROBLEMS: &[Problem] = &[
    Problem {
        id: "word-freq",
        title: "Word frequency",
        input_file: "/home/user/challenge/word-freq/input.txt",
        output_file: "/home/user/output/word_freq.txt",
        solution_file: "/home/user/word_freq.py",
        description: r#"
<p><code>~/challenge/word-freq/input.txt</code> contains English-ish text. Words are lowercase and separated by
spaces, newlines, and the punctuation <code>, . ; !</code></p>
<p>Write the <b>5 most frequent words</b> to <code>~/output/word_freq.txt</code>, one per line, formatted as
<code>word count</code>. Sort by count descending, then alphabetically to break ties.</p>
<pre>python    42
shell     40
...</pre>
<p class="hint">The example output above is padded for readability. Use a single space: <code>python 42</code>.</p>"#,
        generate: |rng| {
            let mut lines = Vec::new();
            let n_lines = rand_int(rng, 40, 80);
            // skew the distribution so there is a clear top 5
            let weights: Vec<f64> = VOCAB.iter().map(|_| rng().powi(3)).collect();
            let total: f64 = weights.iter().sum();
            let weighted = |rng: Rng| {
                let mut r = rng() * total;
                for (w, word) in weights.iter().zip(VOCAB) {
                    r -= w;
                    if r <= 0.0 {
                        return *word;
                    }
                }
                VOCAB[VOCAB.len() - 1]
            };
            for _ in 0..n_lines {
                let n = rand_int(rng, 4, 14);
                let words: Vec<String> = (0..n)
                    .map(|_| {
                        let w = weighted(rng);
                        let punct = if rng() < 0.12 { pick(rng, &[",", ".", ";", "!"]) } else { "" };
                        format!("{w}{punct}")
                    })
                    .collect();
                lines.push(words.join(" "));
            }
            lines.join("\n") + "\n"
        },
        solve: |input| {
            let mut counts: HashMap<&str, u32> = HashMap::new();
            for w in input.split(|c: char| c.is_whitespace() || ",.;!".contains(c)).filter(|w| !w.is_empty()) {
                *counts.entry(w).or_default() += 1;
            }
            let mut counts: Vec<_> = counts.into_iter().collect();
            counts.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
            counts.iter().take(5).map(|(w, c)| format!("{w} {c}\n")).collect()
        },
    },
    Problem {
        id: "prime-sums",
        title: "Prime sums",
        input_file: "/home/user/challenge/prime-sums/input.txt",
        output_file: "/home/user/output/prime_sums.txt",
        solution_file: "/home/user/prime_sums.py",
        description: r#"
<p>Each line of <code>~/challenge/prime-sums/input.txt</code> holds space-separated integers.</p>
<p>For every input line, write <b>the sum of the prime numbers on that line</b> to
<code>~/output/prime_sums.txt</code> (one number per line, same order). A line with no primes sums to <code>0</code>.</p>
<pre>input:  4 7 9 11      output: 18
        1 4 6                 0</pre>"#,
        generate: |rng| {
            let mut lines = Vec::new();
            let n_lines = rand_int(rng, 200, 400);
            for _ in 0..n_lines {
                let n = rand_int(rng, 1, 12);
                let nums: Vec<String> = (0..n).map(|_| rand_int(rng, 0, 100000).to_string()).collect();
                lines.push(nums.join(" "));
            }
            lines.join("\n") + "\n"
        },
        solve: |input| {
            input
                .trim_end()
                .split('\n')
                .map(|line| {
                    let sum: u64 = line
                        .split_whitespace()
                        .filter_map(|n| n.parse().ok())
                        .filter(|&n| is_prime(n))
                        .sum();
                    format!("{sum}\n")
                })
                .collect()
        },
    },
];

#[derive(Serialize, Debug)]
pub struct Grade {
    pub ok: bool,
    pub message: String,
}

// Normalise whitespace so trailing spaces / a missing final newline don't fail a
// correct answer.
fn normalise(s: &str) -> Vec<String> {
    let s = s.replace("\r\n", "\n");
    let joined: Vec<&str> = s.split('\n').map(str::trim_end).collect();
    joined.join("\n").trim_end().split('\n').map(String::from).collect()
}

pub fn grade(expected: &str, actual: Option<&str>) -> Grade {
    let Some(actual) = actual else {
        return Grade { ok: false, message: "Output file not found.".into() };
    };
    let exp = normalise(expected);
    let act = normalise(actual);
    for i in 0..exp.len().max(act.len()) {
        let message = match (exp.get(i), act.get(i)) {
            (Some(e), Some(a)) if e == a => continue,
            (_, None) => format!("Output ends early: expected {} lines, got {}.", exp.len(), act.len()),
            (None, _) => format!("Too many lines: expected {}, got {}.", exp.len(), act.len()),
            (_, Some(a)) => format!("Line {} is wrong: got \"{a}\".", i + 1),
        };
        return Grade { ok: false, message };
    }
    Grade { ok: true, message: format!("All {} lines correct.", exp.len()) }
}

pub fn generate(p: &Problem, seed: u32) -> String {
    (p.generate)(&mut mulberry32(seed))
}

pub fn inputs_for(seed: u64) -> BTreeMap<&'static str, String> {
    PROBLEMS
        .iter()
        .enumerate()
        .map(|(i, p)| (p.id, generate(p, seed.wrapping_add(i as u64 * 7919) as u32)))
        .collect()
}

#[cfg(test)]
mod tests {
    // Cross-checks the reference solvers against the Python solutions a student
    // would write, over many seeds.
    use super::*;
    use std::{fs, path::Path, process::Command};

    #[test]
    fn solvers_match_python_solutions() {
        let solutions = Path::new(env!("CARGO_MANIFEST_DIR")).join("test/solutions");
        for p in PROBLEMS {
            let script = solutions.join(format!("{}.py", p.id.replace('-', "_")));
            for seed in 1..=20 {
                let home = std::env::temp_dir().join(format!("ngoding-{}-{}-{seed}", std::process::id(), p.id));
                let input = generate(p, seed);
                let in_path = home.join(p.input_file.strip_prefix("/home/user/").unwrap());
                fs::create_dir_all(in_path.parent().unwrap()).unwrap();
                fs::write(&in_path, &input).unwrap();
                let status = Command::new("python3").arg("-I").arg(&script).env_clear().env("HOME", &home).status().unwrap();
                assert!(status.success(), "{} failed", script.display());
                let actual = fs::read_to_string(home.join(p.output_file.strip_prefix("/home/user/").unwrap())).unwrap();
                fs::remove_dir_all(&home).unwrap();
                let result = grade(&(p.solve)(&input), Some(&actual));
                assert!(result.ok, "{} seed {seed}: {}", p.id, result.message);
            }
        }
    }

    #[test]
    fn generation_is_deterministic_per_seed() {
        for p in PROBLEMS {
            assert_eq!(generate(p, 7), generate(p, 7));
            assert_ne!(generate(p, 7), generate(p, 8));
        }
    }

    #[test]
    fn grade_tolerates_trailing_whitespace_but_rejects_wrong_lines() {
        assert!(grade("a 1\nb 2\n", Some("a 1  \nb 2")).ok);
        assert!(!grade("a 1\n", None).ok);
        assert!(grade("a 1\nb 2\n", Some("a 1\nb 3\n")).message.contains("Line 2"));
        assert!(grade("a 1\nb 2\n", Some("a 1\n")).message.contains("ends early"));
    }
}
