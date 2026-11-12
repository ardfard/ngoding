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
    Problem {
        id: "log-status",
        title: "Status codes",
        input_file: "/home/user/challenge/log-status/access.log",
        output_file: "/home/user/output/log_status.txt",
        solution_file: "/home/user/log_status.py",
        description: r#"
<p><code>~/challenge/log-status/access.log</code> is a web server access log. Every line looks like this:</p>
<pre>10.0.3.7 - - [12/Nov/2026:08:15:02 +0000] "GET /index.html HTTP/1.1" 200 5120</pre>
<p>The number right after the quoted request is the HTTP status code. Count how many requests ended with
each status code. Write one line per code to <code>~/output/log_status.txt</code>, formatted as
<code>code count</code>. Sort by count descending, then by code ascending to break ties.</p>
<pre>200 312
404 57
...</pre>"#,
        generate: |rng| {
            const PATHS: &[&str] = &[
                "/", "/index.html", "/about", "/login", "/logout", "/api/users", "/api/orders",
                "/static/app.js", "/static/style.css", "/favicon.ico", "/admin", "/search?q=linux",
            ];
            const MONTHS: &[&str] = &["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            let statuses = [200, 200, 200, 200, 200, 201, 204, 301, 302, 304, 304, 400, 401, 403, 404, 404, 404, 500, 502, 503];
            // Each log leans toward a few codes so the counts differ between students.
            let weights: Vec<f64> = statuses.iter().map(|_| rng().powi(2)).collect();
            let total: f64 = weights.iter().sum();
            let n_lines = rand_int(rng, 300, 600);
            let month = pick(rng, MONTHS);
            let mut lines = Vec::new();
            for _ in 0..n_lines {
                let mut r = rng() * total;
                let mut status = statuses[statuses.len() - 1];
                for (w, s) in weights.iter().zip(statuses) {
                    r -= w;
                    if r <= 0.0 {
                        status = s;
                        break;
                    }
                }
                let ip = format!("10.{}.{}.{}", rand_int(rng, 0, 9), rand_int(rng, 0, 255), rand_int(rng, 1, 254));
                let time = format!(
                    "{:02}/{month}/2026:{:02}:{:02}:{:02} +0000",
                    rand_int(rng, 1, 28), rand_int(rng, 0, 23), rand_int(rng, 0, 59), rand_int(rng, 0, 59)
                );
                let method = pick(rng, &["GET", "GET", "GET", "POST", "PUT", "DELETE"]);
                let path = pick(rng, PATHS);
                let bytes = if status == 204 || status == 304 { 0 } else { rand_int(rng, 120, 90000) };
                lines.push(format!("{ip} - - [{time}] \"{method} {path} HTTP/1.1\" {status} {bytes}"));
            }
            lines.join("\n") + "\n"
        },
        solve: |input| {
            let mut counts: BTreeMap<u32, u32> = BTreeMap::new();
            for line in input.lines() {
                if let Some(code) = line.split('"').nth(2).and_then(|rest| rest.split_whitespace().next()) {
                    *counts.entry(code.parse().unwrap()).or_default() += 1;
                }
            }
            let mut counts: Vec<_> = counts.into_iter().collect();
            counts.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
            counts.iter().map(|(code, n)| format!("{code} {n}\n")).collect()
        },
    },
    Problem {
        id: "sales-totals",
        title: "Sales by region",
        input_file: "/home/user/challenge/sales-totals/sales.csv",
        output_file: "/home/user/output/sales_totals.txt",
        solution_file: "/home/user/sales_totals.py",
        description: r#"
<p><code>~/challenge/sales-totals/sales.csv</code> is a CSV file with a header row:</p>
<pre>region,product,quantity,unit_price
north,keyboard,3,45
south,monitor,1,210</pre>
<p>A row's revenue is <code>quantity × unit_price</code>. Work out the <b>total revenue for each region</b> and write
one line per region to <code>~/output/sales_totals.txt</code>, formatted as <code>region total</code>. Sort by total
descending, then by region name to break ties.</p>
<pre>north 18240
west 15985
...</pre>
<p class="hint">Python's <code>csv</code> module can read the header for you: try <code>csv.DictReader</code>.</p>"#,
        generate: |rng| {
            const REGIONS: &[&str] = &["north", "south", "east", "west", "central", "coastal", "highlands"];
            const PRODUCTS: &[(&str, u32, u32)] = &[
                ("keyboard", 25, 120), ("mouse", 8, 60), ("monitor", 120, 600), ("laptop", 500, 2400),
                ("cable", 3, 25), ("headset", 20, 250), ("webcam", 30, 150), ("dock", 80, 300),
            ];
            let n_regions = rand_int(rng, 4, REGIONS.len() as u32) as usize;
            let start = rand_int(rng, 0, REGIONS.len() as u32 - 1) as usize;
            let regions: Vec<&str> = (0..n_regions).map(|i| REGIONS[(start + i) % REGIONS.len()]).collect();
            let mut lines = vec!["region,product,quantity,unit_price".to_string()];
            for _ in 0..rand_int(rng, 150, 300) {
                let region = pick(rng, &regions);
                let (product, lo, hi) = pick(rng, PRODUCTS);
                lines.push(format!("{region},{product},{},{}", rand_int(rng, 1, 20), rand_int(rng, lo, hi)));
            }
            lines.join("\n") + "\n"
        },
        solve: |input| {
            let mut totals: HashMap<&str, u64> = HashMap::new();
            for line in input.lines().skip(1) {
                let f: Vec<&str> = line.split(',').collect();
                let qty: u64 = f[2].parse().unwrap();
                let price: u64 = f[3].parse().unwrap();
                *totals.entry(f[0]).or_default() += qty * price;
            }
            let mut totals: Vec<_> = totals.into_iter().collect();
            totals.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
            totals.iter().map(|(r, t)| format!("{r} {t}\n")).collect()
        },
    },
    Problem {
        id: "caesar",
        title: "Secret message",
        input_file: "/home/user/challenge/caesar/message.txt",
        output_file: "/home/user/output/caesar.txt",
        solution_file: "/home/user/caesar.py",
        description: r#"
<p><code>~/challenge/caesar/message.txt</code> holds a message encrypted with a Caesar cipher. The first line
gives the key, for example <code>shift 3</code>. Every lowercase letter in the lines after it was moved
<i>forward</i> that many places in the alphabet, wrapping from <code>z</code> back to <code>a</code>.
Anything that isn't <code>a</code>–<code>z</code> was left alone.</p>
<p>Decrypt the message and write it to <code>~/output/caesar.txt</code>. Leave out the key line and keep the
message's line breaks.</p>
<pre>input:  shift 3        output: hello, world
        khoor, zruog</pre>"#,
        generate: |rng| {
            let shift = rand_int(rng, 1, 25) as u8;
            let mut lines = vec![format!("shift {shift}")];
            for _ in 0..rand_int(rng, 20, 50) {
                let n = rand_int(rng, 3, 10);
                let words: Vec<String> = (0..n)
                    .map(|_| {
                        let w = pick(rng, VOCAB);
                        let punct = if rng() < 0.15 { pick(rng, &[",", ".", "!", "?"]) } else { "" };
                        let n = if rng() < 0.05 { format!(" {}", rand_int(rng, 1, 999)) } else { String::new() };
                        format!("{w}{punct}{n}")
                    })
                    .collect();
                let encrypted = words
                    .join(" ")
                    .bytes()
                    .map(|b| if b.is_ascii_lowercase() { (b - b'a' + shift) % 26 + b'a' } else { b } as char)
                    .collect();
                lines.push(encrypted);
            }
            lines.join("\n") + "\n"
        },
        solve: |input| {
            let mut lines = input.lines();
            let shift: u8 = lines.next().unwrap().trim_start_matches("shift ").parse().unwrap();
            lines
                .map(|line| {
                    let plain: String = line
                        .bytes()
                        .map(|b| if b.is_ascii_lowercase() { (b - b'a' + 26 - shift) % 26 + b'a' } else { b } as char)
                        .collect();
                    plain + "\n"
                })
                .collect()
        },
    },
    Problem {
        id: "brackets",
        title: "Balanced brackets",
        input_file: "/home/user/challenge/brackets/input.txt",
        output_file: "/home/user/output/brackets.txt",
        solution_file: "/home/user/brackets.py",
        description: r#"
<p>Each line of <code>~/challenge/brackets/input.txt</code> is a string of the brackets <code>( ) [ ] { }</code>.</p>
<p>Check every line and write one result per line to <code>~/output/brackets.txt</code>, in the same order:</p>
<ul>
<li><code>ok</code> if every bracket is closed by the matching kind, in the right order</li>
<li><code>error at N</code> if a closing bracket doesn't match the most recent unclosed bracket, or nothing is open.
<code>N</code> is that character's position on the line, counting from 1</li>
<li><code>incomplete</code> if there is no such error but some brackets are still open at the end of the line</li>
</ul>
<pre>input:  ([]{})       output: ok
        ([)]                 error at 3
        {[()                 incomplete</pre>
<p class="hint">A list used as a stack (<code>append</code> / <code>pop</code>) makes this easy.</p>"#,
        generate: |rng| {
            const PAIRS: &[(char, char)] = &[('(', ')'), ('[', ']'), ('{', '}')];
            const ALL: &[char] = &['(', ')', '[', ']', '{', '}'];
            let mut lines = Vec::new();
            for _ in 0..rand_int(rng, 150, 300) {
                // start from a balanced string, then (usually) break it
                let mut remaining = rand_int(rng, 2, 15);
                let mut s: Vec<char> = Vec::new();
                let mut stack = Vec::new();
                while remaining > 0 || !stack.is_empty() {
                    if remaining > 0 && (stack.is_empty() || rng() < 0.55) {
                        let (open, close) = pick(rng, PAIRS);
                        s.push(open);
                        stack.push(close);
                        remaining -= 1;
                    } else {
                        s.push(stack.pop().unwrap());
                    }
                }
                let at = (rng() * s.len() as f64) as usize;
                match (rng() * 4.0) as u32 {
                    0 => {}
                    1 => s[at] = pick(rng, ALL),
                    2 => {
                        s.remove(at);
                    }
                    _ => s.truncate(at.max(1)),
                }
                lines.push(s.into_iter().collect::<String>());
            }
            lines.join("\n") + "\n"
        },
        solve: |input| {
            input
                .lines()
                .map(|line| {
                    let mut stack = Vec::new();
                    for (i, c) in line.chars().enumerate() {
                        match c {
                            '(' => stack.push(')'),
                            '[' => stack.push(']'),
                            '{' => stack.push('}'),
                            ')' | ']' | '}' if stack.pop() != Some(c) => return format!("error at {}\n", i + 1),
                            _ => {}
                        }
                    }
                    if stack.is_empty() { "ok\n".into() } else { "incomplete\n".into() }
                })
                .collect()
        },
    },
    Problem {
        id: "anagrams",
        title: "Anagram groups",
        input_file: "/home/user/challenge/anagrams/words.txt",
        output_file: "/home/user/output/anagrams.txt",
        solution_file: "/home/user/anagrams.py",
        description: r#"
<p><code>~/challenge/anagrams/words.txt</code> has one lowercase word per line, with no repeats. Two words are
<b>anagrams</b> if they use exactly the same letters, like <code>listen</code> and <code>silent</code>.</p>
<p>Find every group of two or more words that are all anagrams of each other. Write one group per line to
<code>~/output/anagrams.txt</code>, with the words in alphabetical order and separated by single spaces. Put
bigger groups first, and break ties by the group's first word. Leave out words that have no anagram in the list.</p>
<pre>input:  listen         output: enlist listen silent
        stone                  notes stone
        silent
        notes
        enlist
        apple</pre>
<p class="hint">Two words are anagrams exactly when <code>sorted(word)</code> gives the same result for both.</p>"#,
        generate: |rng| {
            fn word(rng: Rng, len: u32) -> Vec<u8> {
                (0..len).map(|_| b'a' + rand_int(rng, 0, 25) as u8).collect()
            }
            fn shuffle<T>(rng: Rng, xs: &mut [T]) {
                for i in (1..xs.len()).rev() {
                    xs.swap(i, rand_int(rng, 0, i as u32) as usize);
                }
            }
            let mut words: Vec<String> = Vec::new();
            let add = |w: Vec<u8>, words: &mut Vec<String>| {
                let w = String::from_utf8(w).unwrap();
                if !words.contains(&w) {
                    words.push(w);
                }
            };
            for _ in 0..rand_int(rng, 15, 30) {
                let len = rand_int(rng, 4, 7);
                let base = word(rng, len);
                for _ in 0..rand_int(rng, 2, 5) {
                    let mut w = base.clone();
                    shuffle(rng, &mut w);
                    add(w, &mut words);
                }
            }
            for _ in 0..rand_int(rng, 60, 120) {
                let len = rand_int(rng, 4, 7);
                add(word(rng, len), &mut words);
            }
            shuffle(rng, &mut words);
            words.join("\n") + "\n"
        },
        solve: |input| {
            let mut groups: HashMap<Vec<u8>, Vec<&str>> = HashMap::new();
            for w in input.lines() {
                let mut key = w.as_bytes().to_vec();
                key.sort_unstable();
                groups.entry(key).or_default().push(w);
            }
            let mut groups: Vec<Vec<&str>> = groups.into_values().filter(|g| g.len() > 1).collect();
            for g in &mut groups {
                g.sort_unstable();
            }
            groups.sort_by(|a, b| b.len().cmp(&a.len()).then(a[0].cmp(b[0])));
            groups.iter().map(|g| g.join(" ") + "\n").collect()
        },
    },
    Problem {
        id: "timesheet",
        title: "Timesheet",
        input_file: "/home/user/challenge/timesheet/timesheet.txt",
        output_file: "/home/user/output/timesheet.txt",
        solution_file: "/home/user/timesheet.py",
        description: r#"
<p>Each line of <code>~/challenge/timesheet/timesheet.txt</code> records one block of work as
<code>task start end</code>, with times in 24-hour <code>HH:MM</code>. Every block starts and ends on the same day.</p>
<pre>code-review 09:15 10:40
standup 10:40 10:55</pre>
<p>Add up the <b>total time spent on each task</b>. Write one line per task to <code>~/output/timesheet.txt</code>,
formatted as <code>task H:MM</code> (minutes always have two digits). Sort by total time descending, then by task
name to break ties.</p>
<pre>code-review 12:05
standup 1:15
...</pre>"#,
        generate: |rng| {
            const TASKS: &[&str] = &[
                "code-review", "standup", "debugging", "writing-tests", "planning", "email",
                "deploy", "docs", "pairing", "interviews", "refactoring", "support",
            ];
            let n_tasks = rand_int(rng, 5, TASKS.len() as u32) as usize;
            let start = rand_int(rng, 0, TASKS.len() as u32 - 1) as usize;
            let tasks: Vec<&str> = (0..n_tasks).map(|i| TASKS[(start + i) % TASKS.len()]).collect();
            let mut lines = Vec::new();
            for _ in 0..rand_int(rng, 10, 20) {
                // one working day: back-to-back blocks with the odd break
                let mut t = rand_int(rng, 7 * 60, 10 * 60);
                while t < 18 * 60 {
                    let len = rand_int(rng, 5, 150);
                    let end = (t + len).min(23 * 60 + 59);
                    lines.push(format!("{} {:02}:{:02} {:02}:{:02}", pick(rng, &tasks), t / 60, t % 60, end / 60, end % 60));
                    t = end + if rng() < 0.3 { rand_int(rng, 5, 60) } else { 0 };
                }
            }
            lines.join("\n") + "\n"
        },
        solve: |input| {
            let minutes = |hhmm: &str| {
                let (h, m) = hhmm.split_once(':').unwrap();
                h.parse::<u32>().unwrap() * 60 + m.parse::<u32>().unwrap()
            };
            let mut totals: HashMap<&str, u32> = HashMap::new();
            for line in input.lines() {
                let f: Vec<&str> = line.split_whitespace().collect();
                *totals.entry(f[0]).or_default() += minutes(f[2]) - minutes(f[1]);
            }
            let mut totals: Vec<_> = totals.into_iter().collect();
            totals.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
            totals.iter().map(|(task, m)| format!("{task} {}:{:02}\n", m / 60, m % 60)).collect()
        },
    },
    Problem {
        id: "islands",
        title: "Islands",
        input_file: "/home/user/challenge/islands/map.txt",
        output_file: "/home/user/output/islands.txt",
        solution_file: "/home/user/islands.py",
        description: r#"
<p><code>~/challenge/islands/map.txt</code> is a map drawn with <code>#</code> for land and <code>.</code> for water.
All rows have the same length. Land squares that touch <b>up, down, left or right</b> belong to the same island.
Squares that only touch diagonally don't.</p>
<p>Write two lines to <code>~/output/islands.txt</code>: the number of islands, and the size (number of
<code>#</code> squares) of the largest one.</p>
<pre>input:  ##..#          output: islands 3
        #...#                  largest 3
        ..#..</pre>
<p class="hint">Visit each island once with a breadth-first or depth-first search and mark the squares you've
seen. If you search recursively, a big island can hit Python's recursion limit, so a loop over a list works better.</p>"#,
        generate: |rng| {
            let w = rand_int(rng, 30, 60) as usize;
            let h = rand_int(rng, 15, 30) as usize;
            let density = 0.3 + rng() * 0.2;
            (0..h)
                .map(|_| (0..w).map(|_| if rng() < density { '#' } else { '.' }).collect::<String>() + "\n")
                .collect()
        },
        solve: |input| {
            let mut grid: Vec<Vec<u8>> = input.lines().map(|l| l.as_bytes().to_vec()).collect();
            let (mut count, mut largest) = (0, 0);
            for r in 0..grid.len() {
                for c in 0..grid[r].len() {
                    if grid[r][c] != b'#' {
                        continue;
                    }
                    count += 1;
                    grid[r][c] = b'.';
                    let (mut todo, mut size) = (vec![(r, c)], 0);
                    while let Some((r, c)) = todo.pop() {
                        size += 1;
                        let next = [(r.wrapping_sub(1), c), (r + 1, c), (r, c.wrapping_sub(1)), (r, c + 1)];
                        for (nr, nc) in next {
                            if grid.get(nr).and_then(|row| row.get(nc)) == Some(&b'#') {
                                grid[nr][nc] = b'.';
                                todo.push((nr, nc));
                            }
                        }
                    }
                    largest = largest.max(size);
                }
            }
            format!("islands {count}\nlargest {largest}\n")
        },
    },
    Problem {
        id: "users-json",
        title: "Users by city",
        input_file: "/home/user/challenge/users-json/users.json",
        output_file: "/home/user/output/users_json.txt",
        solution_file: "/home/user/users_json.py",
        description: r#"
<p><code>~/challenge/users-json/users.json</code> is a JSON array of user records:</p>
<pre>[
  {"name": "ana", "city": "lisbon", "age": 34, "active": true},
  {"name": "bo", "city": "oslo", "age": 51, "active": false},
  ...
]</pre>
<p>Look only at <b>active</b> users. For every city that has at least one, write a line to
<code>~/output/users_json.txt</code> formatted as <code>city count oldest</code>: the number of active users in
that city, and the name of the oldest one. If several share the highest age, use the name that comes first
alphabetically. Sort the lines by city name.</p>
<pre>lisbon 12 marta
oslo 7 erik
...</pre>
<p class="hint">Python's <code>json</code> module turns the file into lists and dicts: <code>json.loads(text)</code>.</p>"#,
        generate: |rng| {
            const CITIES: &[&str] = &["lisbon", "oslo", "jakarta", "lagos", "lima", "seoul", "nairobi", "porto", "quito"];
            const NAMES: &[&str] = &[
                "ana", "bo", "chen", "dewi", "erik", "fatima", "gita", "hiro", "ines", "juan", "kofi", "lena",
                "marta", "nina", "omar", "priya", "rui", "sara", "tomas", "umi", "vera", "wei", "yusuf", "zara",
            ];
            let users: Vec<serde_json::Value> = (0..rand_int(rng, 80, 160))
                .map(|_| {
                    serde_json::json!({
                        "name": pick(rng, NAMES),
                        "city": pick(rng, CITIES),
                        "age": rand_int(rng, 18, 70),
                        "active": rng() < 0.7,
                    })
                })
                .collect();
            serde_json::to_string_pretty(&users).unwrap() + "\n"
        },
        solve: |input| {
            let users: Vec<serde_json::Value> = serde_json::from_str(input).unwrap();
            let mut cities: BTreeMap<&str, (u32, u64, &str)> = BTreeMap::new();
            for u in users.iter().filter(|u| u["active"] == true) {
                let (name, age) = (u["name"].as_str().unwrap(), u["age"].as_u64().unwrap());
                let entry = cities.entry(u["city"].as_str().unwrap()).or_insert((0, age, name));
                entry.0 += 1;
                if age > entry.1 || (age == entry.1 && name < entry.2) {
                    (entry.1, entry.2) = (age, name);
                }
            }
            cities.iter().map(|(city, (n, _, oldest))| format!("{city} {n} {oldest}\n")).collect()
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
