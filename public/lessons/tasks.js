// Lessons: common tasks (files, JSON, processes, threads, sockets, ...).

export default [
  {
    id: "files",
    title: "Reading & Writing Files",
    intro: `<p>Files are the most common way programs keep data. The usual steps: <b>open</b> a file in a mode (write, append, read), <b>read or write</b>, then <b>close</b> it so the data is flushed to disk.</p>
<p>Write a file in <code>/tmp</code>, append to it, read it back whole and line by line, then delete it. Most languages also have one-call helpers that open, write and close for you (Python's <code>Path.write_text</code>, Go's <code>os.WriteFile</code>, Rust's <code>fs::write</code>, Haskell's <code>writeFile</code>).</p>`,
    output: `wrote /tmp/ngoding_notes.txt
size: 34 bytes
1: first line
2: second line
3: third line
exists after delete: false
`,
    code: {
      python: `import os

path = "/tmp/ngoding_notes.txt"

# "w" creates the file or truncates it; \`with\` closes it when the block ends.
with open(path, "w") as f:
    f.write("first line\\n")
    f.write("second line\\n")
print("wrote", path)

# "a" appends to the end instead of truncating.
with open(path, "a") as f:
    f.write("third line\\n")

# Read the whole file into one string.
with open(path) as f:
    text = f.read()
print("size:", len(text), "bytes")

# Iterating over a file yields one line at a time (with its "\\n").
with open(path) as f:
    for n, line in enumerate(f, start=1):
        print(f"{n}: {line.rstrip()}")

os.remove(path)
print("exists after delete:", str(os.path.exists(path)).lower())
`,
      c: `#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(void) {
    const char *path = "/tmp/ngoding_notes.txt";

    /* "w" creates the file or truncates it. fopen returns NULL on failure. */
    FILE *f = fopen(path, "w");
    if (!f) {
        perror(path);
        return 1;
    }
    fputs("first line\\n", f);
    fprintf(f, "%s\\n", "second line");
    fclose(f); /* flushes the buffered data to the file */
    printf("wrote %s\\n", path);

    /* "a" appends to the end instead of truncating. */
    f = fopen(path, "a");
    fputs("third line\\n", f);
    fclose(f);

    /* Seek to the end to find the size, then back to the start to read. */
    f = fopen(path, "r");
    fseek(f, 0, SEEK_END);
    printf("size: %ld bytes\\n", ftell(f));
    rewind(f);

    /* fgets reads one line (including its '\\n') into a buffer. */
    char line[256];
    int n = 0;
    while (fgets(line, sizeof line, f)) {
        line[strcspn(line, "\\n")] = '\\0'; /* strip the newline */
        printf("%d: %s\\n", ++n, line);
    }
    fclose(f);

    remove(path);
    /* access(F_OK) checks whether a path exists. */
    printf("exists after delete: %s\\n", access(path, F_OK) == 0 ? "true" : "false");
    return 0;
}
`,
      cpp: `#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>

namespace fs = std::filesystem;

int main() {
    const fs::path path = "/tmp/ngoding_notes.txt";

    // An ofstream truncates by default; it's closed when it goes out of scope.
    {
        std::ofstream out(path);
        if (!out) {
            std::cerr << "cannot open " << path << "\\n";
            return 1;
        }
        out << "first line\\n" << "second line\\n";
    }
    std::cout << "wrote " << path.string() << "\\n";

    // std::ios::app appends instead of truncating.
    {
        std::ofstream out(path, std::ios::app);
        out << "third line\\n";
    }

    std::cout << "size: " << fs::file_size(path) << " bytes\\n";

    // std::getline reads one line at a time (without the '\\n').
    std::ifstream in(path);
    std::string line;
    int n = 0;
    while (std::getline(in, line)) std::cout << ++n << ": " << line << "\\n";
    in.close();

    fs::remove(path);
    std::cout << "exists after delete: " << std::boolalpha << fs::exists(path) << "\\n";
}
`,
      go: `package main

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"os"
)

// check stops the program on an error; real code would handle it.
func check(err error) {
	if err != nil {
		panic(err)
	}
}

func main() {
	path := "/tmp/ngoding_notes.txt"

	// os.WriteFile creates (or truncates), writes and closes in one call.
	// 0644 is the permission: owner can write, everyone can read.
	check(os.WriteFile(path, []byte("first line\\nsecond line\\n"), 0644))
	fmt.Println("wrote", path)

	// For more control, open with flags (here: append, write-only).
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0644)
	check(err)
	_, err = f.WriteString("third line\\n")
	check(err)
	check(f.Close())

	data, err := os.ReadFile(path)
	check(err)
	fmt.Println("size:", len(data), "bytes")

	// bufio.Scanner reads line by line (without the '\\n').
	f, err = os.Open(path)
	check(err)
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for n := 1; scanner.Scan(); n++ {
		fmt.Printf("%d: %s\\n", n, scanner.Text())
	}
	check(scanner.Err())

	check(os.Remove(path))
	_, err = os.Stat(path)
	fmt.Println("exists after delete:", !errors.Is(err, fs.ErrNotExist))
}
`,
      rust: `use std::fs::{self, OpenOptions};
use std::io::{self, BufRead, BufReader, Write};
use std::path::Path;

// main can return a Result: \`?\` passes any io::Error up and ends the program.
fn main() -> io::Result<()> {
    let path = "/tmp/ngoding_notes.txt";

    // fs::write creates (or truncates), writes and closes in one call.
    fs::write(path, "first line\\nsecond line\\n")?;
    println!("wrote {}", path);

    // OpenOptions picks the mode; the file closes when \`f\` goes out of scope.
    {
        let mut f = OpenOptions::new().append(true).open(path)?;
        f.write_all(b"third line\\n")?;
    }

    let text = fs::read_to_string(path)?;
    println!("size: {} bytes", text.len());

    // A BufReader reads in chunks; lines() yields each line without the '\\n'.
    let reader = BufReader::new(fs::File::open(path)?);
    for (i, line) in reader.lines().enumerate() {
        println!("{}: {}", i + 1, line?);
    }

    fs::remove_file(path)?;
    println!("exists after delete: {}", Path::new(path).exists());
    Ok(())
}
`,
      haskell: `import System.Directory (doesFileExist, removeFile)

main :: IO ()
main = do
  let path = "/tmp/ngoding_notes.txt"

  -- writeFile creates (or truncates) the file; appendFile adds to the end.
  writeFile path "first line\\nsecond line\\n"
  putStrLn ("wrote " ++ path)
  appendFile path "third line\\n"

  -- readFile is lazy: it reads as you use the string. Using its length
  -- reads everything, so the file is closed before we delete it.
  text <- readFile path
  putStrLn ("size: " ++ show (length text) ++ " bytes")

  -- lines splits on '\\n'; zip pairs each line with its number.
  mapM_
    (\\(n, line) -> putStrLn (show n ++ ": " ++ line))
    (zip [1 :: Int ..] (lines text))

  removeFile path
  exists <- doesFileExist path
  putStrLn ("exists after delete: " ++ (if exists then "true" else "false"))
`,
      javascript: `const fs = require("fs");

const path = "/tmp/ngoding_notes.txt";

// The *Sync functions block until done; fs.promises has async versions.
fs.writeFileSync(path, "first line\\nsecond line\\n");
console.log("wrote", path);

fs.appendFileSync(path, "third line\\n");

// Without an encoding you get a Buffer of bytes; "utf8" gives a string.
const text = fs.readFileSync(path, "utf8");
console.log("size:", Buffer.byteLength(text), "bytes");

// Split into lines; the text ends with "\\n", so drop the last empty piece.
const lines = text.split("\\n").slice(0, -1);
lines.forEach((line, i) => console.log(\`\${i + 1}: \${line}\`));

fs.unlinkSync(path);
console.log("exists after delete:", fs.existsSync(path));
`,
      typescript: `import * as fs from "fs";

const path: string = "/tmp/ngoding_notes.txt";

// The *Sync functions block until done; fs.promises has async versions.
fs.writeFileSync(path, "first line\\nsecond line\\n");
console.log("wrote", path);

fs.appendFileSync(path, "third line\\n");

// With an encoding, readFileSync returns a string instead of a Buffer.
const text: string = fs.readFileSync(path, "utf8");
console.log("size:", Buffer.byteLength(text), "bytes");

// Split into lines; the text ends with "\\n", so drop the last empty piece.
const lines: string[] = text.split("\\n").slice(0, -1);
lines.forEach((line, i) => console.log(\`\${i + 1}: \${line}\`));

fs.unlinkSync(path);
console.log("exists after delete:", fs.existsSync(path));
`,
    },
  },

  {
    id: "directories",
    title: "Directories",
    intro: `<p>Directories (folders) hold files and other directories. Common tasks: <b>create</b> a directory and any missing parents (like <code>mkdir -p</code>), <b>list</b> what's inside, <b>walk</b> the whole tree, and <b>remove</b> it with everything in it (like <code>rm -r</code>).</p>
<p>Listings come back in whatever order the filesystem stores them, so sort them if order matters. Paths are joined with <code>/</code> on Linux; most languages have a helper that picks the right separator.</p>`,
    output: `created /tmp/ngoding_dir/sub/deep
entries in /tmp/ngoding_dir:
  a.txt
  b.txt
  sub/
all files:
  a.txt
  b.txt
  sub/c.txt
removed: true
`,
    code: {
      python: `import shutil
from pathlib import Path

base = Path("/tmp/ngoding_dir")
shutil.rmtree(base, ignore_errors=True)  # start fresh on every run

# parents=True also creates missing parents, like mkdir -p.
deep = base / "sub" / "deep"
deep.mkdir(parents=True)
print("created", deep)

# The / operator joins paths.
(base / "a.txt").write_text("a")
(base / "b.txt").write_text("b")
(base / "sub" / "c.txt").write_text("c")

# iterdir lists one level, in no particular order: sort it.
print(f"entries in {base}:")
for entry in sorted(base.iterdir()):
    print("  " + entry.name + ("/" if entry.is_dir() else ""))

# rglob("*") walks the whole tree.
print("all files:")
for path in sorted(p for p in base.rglob("*") if p.is_file()):
    print("  " + str(path.relative_to(base)))

shutil.rmtree(base)  # removes the directory and everything in it
print("removed:", str(not base.exists()).lower())
`,
      c: `/* Ask for POSIX 2008 functions (nftw, strdup) from the C library. */
#define _XOPEN_SOURCE 700
#include <dirent.h>
#include <ftw.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#define BASE "/tmp/ngoding_dir"

static int is_dir(const char *path) {
    struct stat st;
    return stat(path, &st) == 0 && S_ISDIR(st.st_mode);
}

static void touch(const char *path) {
    FILE *f = fopen(path, "w");
    if (f) fclose(f);
}

static int cmp(const void *a, const void *b) {
    return strcmp(*(char *const *)a, *(char *const *)b);
}

/* Collect file paths under dir (relative to BASE) into names. */
static void walk(const char *dir, char **names, int *n) {
    DIR *d = opendir(dir);
    struct dirent *e;
    while ((e = readdir(d))) {
        if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
        char path[512];
        snprintf(path, sizeof path, "%s/%s", dir, e->d_name);
        if (is_dir(path)) walk(path, names, n);
        else names[(*n)++] = strdup(path + strlen(BASE) + 1);
    }
    closedir(d);
}

/* nftw calls this for every path; FTW_DEPTH visits children first. */
static int remove_one(const char *path, const struct stat *st, int flag, struct FTW *ftw) {
    (void)st, (void)flag, (void)ftw;
    return remove(path);
}

int main(void) {
    nftw(BASE, remove_one, 16, FTW_DEPTH | FTW_PHYS); /* start fresh */

    /* mkdir creates one level at a time; 0755 = rwxr-xr-x. */
    mkdir(BASE, 0755);
    mkdir(BASE "/sub", 0755);
    mkdir(BASE "/sub/deep", 0755);
    printf("created %s\\n", BASE "/sub/deep");

    touch(BASE "/a.txt");
    touch(BASE "/b.txt");
    touch(BASE "/sub/c.txt");

    /* readdir returns entries in no particular order: collect and sort. */
    char *names[16];
    int n = 0;
    DIR *d = opendir(BASE);
    struct dirent *e;
    while ((e = readdir(d))) {
        if (strcmp(e->d_name, ".") && strcmp(e->d_name, "..")) names[n++] = strdup(e->d_name);
    }
    closedir(d);
    qsort(names, n, sizeof *names, cmp);
    printf("entries in %s:\\n", BASE);
    for (int i = 0; i < n; i++) {
        char path[512];
        snprintf(path, sizeof path, "%s/%s", BASE, names[i]);
        printf("  %s%s\\n", names[i], is_dir(path) ? "/" : "");
        free(names[i]);
    }

    n = 0;
    walk(BASE, names, &n);
    qsort(names, n, sizeof *names, cmp);
    printf("all files:\\n");
    for (int i = 0; i < n; i++) {
        printf("  %s\\n", names[i]);
        free(names[i]);
    }

    nftw(BASE, remove_one, 16, FTW_DEPTH | FTW_PHYS);
    printf("removed: %s\\n", access(BASE, F_OK) != 0 ? "true" : "false");
    return 0;
}
`,
      cpp: `#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

namespace fs = std::filesystem;

int main() {
    const fs::path base = "/tmp/ngoding_dir";
    fs::remove_all(base); // start fresh on every run

    // create_directories also creates missing parents, like mkdir -p.
    // The / operator joins paths.
    fs::create_directories(base / "sub" / "deep");
    std::cout << "created " << (base / "sub" / "deep").string() << "\\n";

    std::ofstream(base / "a.txt") << "a";
    std::ofstream(base / "b.txt") << "b";
    std::ofstream(base / "sub" / "c.txt") << "c";

    // directory_iterator lists one level, in no particular order: sort it.
    std::vector<std::string> entries;
    for (const auto &e : fs::directory_iterator(base)) {
        entries.push_back(e.path().filename().string() + (e.is_directory() ? "/" : ""));
    }
    std::sort(entries.begin(), entries.end());
    std::cout << "entries in " << base.string() << ":\\n";
    for (const auto &name : entries) std::cout << "  " << name << "\\n";

    // recursive_directory_iterator walks the whole tree.
    std::vector<std::string> files;
    for (const auto &e : fs::recursive_directory_iterator(base)) {
        if (e.is_regular_file()) files.push_back(fs::relative(e.path(), base).string());
    }
    std::sort(files.begin(), files.end());
    std::cout << "all files:\\n";
    for (const auto &f : files) std::cout << "  " << f << "\\n";

    fs::remove_all(base); // the directory and everything in it
    std::cout << "removed: " << std::boolalpha << !fs::exists(base) << "\\n";
}
`,
      go: `package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

func check(err error) {
	if err != nil {
		panic(err)
	}
}

func main() {
	base := "/tmp/ngoding_dir"
	check(os.RemoveAll(base)) // start fresh on every run

	// MkdirAll also creates missing parents, like mkdir -p.
	// filepath.Join puts the right separator between parts.
	deep := filepath.Join(base, "sub", "deep")
	check(os.MkdirAll(deep, 0755))
	fmt.Println("created", deep)

	for _, name := range []string{"a.txt", "b.txt", "sub/c.txt"} {
		check(os.WriteFile(filepath.Join(base, name), []byte(name), 0644))
	}

	// os.ReadDir lists one level, already sorted by name.
	entries, err := os.ReadDir(base)
	check(err)
	fmt.Printf("entries in %s:\\n", base)
	for _, e := range entries {
		suffix := ""
		if e.IsDir() {
			suffix = "/"
		}
		fmt.Println("  " + e.Name() + suffix)
	}

	// WalkDir visits the whole tree in lexical order.
	fmt.Println("all files:")
	check(filepath.WalkDir(base, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			rel, _ := filepath.Rel(base, path)
			fmt.Println("  " + rel)
		}
		return nil
	}))

	check(os.RemoveAll(base)) // the directory and everything in it
	_, err = os.Stat(base)
	fmt.Println("removed:", os.IsNotExist(err))
}
`,
      rust: `use std::fs;
use std::io;
use std::path::{Path, PathBuf};

// Collect every file under dir, recursing into subdirectories.
fn walk(dir: &Path, files: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            walk(&path, files)?;
        } else {
            files.push(path);
        }
    }
    Ok(())
}

fn main() -> io::Result<()> {
    let base = Path::new("/tmp/ngoding_dir");
    let _ = fs::remove_dir_all(base); // start fresh; ignore "not found"

    // create_dir_all also creates missing parents, like mkdir -p.
    // join puts the right separator between parts.
    let deep = base.join("sub").join("deep");
    fs::create_dir_all(&deep)?;
    println!("created {}", deep.display());

    fs::write(base.join("a.txt"), "a")?;
    fs::write(base.join("b.txt"), "b")?;
    fs::write(base.join("sub/c.txt"), "c")?;

    // read_dir lists one level, in no particular order: sort it.
    let mut entries = Vec::new();
    for entry in fs::read_dir(base)? {
        let entry = entry?;
        let suffix = if entry.file_type()?.is_dir() { "/" } else { "" };
        entries.push(format!("{}{}", entry.file_name().to_string_lossy(), suffix));
    }
    entries.sort();
    println!("entries in {}:", base.display());
    for name in &entries {
        println!("  {}", name);
    }

    let mut files = Vec::new();
    walk(base, &mut files)?;
    files.sort();
    println!("all files:");
    for f in &files {
        println!("  {}", f.strip_prefix(base).unwrap().display());
    }

    fs::remove_dir_all(base)?; // the directory and everything in it
    println!("removed: {}", !base.exists());
    Ok(())
}
`,
      haskell: `import Control.Monad (filterM, forM, forM_, when)
import Data.List (sort)
import System.Directory
import System.FilePath (makeRelative, (</>))

-- Every file under dir, recursing into subdirectories.
walk :: FilePath -> IO [FilePath]
walk dir = do
  names <- listDirectory dir
  paths <- forM names $ \\name -> do
    let path = dir </> name
    isDir <- doesDirectoryExist path
    if isDir then walk path else return [path]
  return (concat paths)

main :: IO ()
main = do
  let base = "/tmp/ngoding_dir"
  -- Start fresh on every run.
  existed <- doesDirectoryExist base
  when existed (removeDirectoryRecursive base)

  -- True also creates missing parents, like mkdir -p. </> joins paths.
  let deep = base </> "sub" </> "deep"
  createDirectoryIfMissing True deep
  putStrLn ("created " ++ deep)

  writeFile (base </> "a.txt") "a"
  writeFile (base </> "b.txt") "b"
  writeFile (base </> "sub" </> "c.txt") "c"

  -- listDirectory lists one level, in no particular order: sort it.
  names <- sort <$> listDirectory base
  dirs <- filterM (doesDirectoryExist . (base </>)) names
  putStrLn ("entries in " ++ base ++ ":")
  forM_ names $ \\name ->
    putStrLn ("  " ++ name ++ (if name \`elem\` dirs then "/" else ""))

  files <- sort <$> walk base
  putStrLn "all files:"
  forM_ files $ \\f -> putStrLn ("  " ++ makeRelative base f)

  removeDirectoryRecursive base
  gone <- not <$> doesDirectoryExist base
  putStrLn ("removed: " ++ (if gone then "true" else "false"))
`,
      javascript: `const fs = require("fs");
const path = require("path");

const base = "/tmp/ngoding_dir";
fs.rmSync(base, { recursive: true, force: true }); // start fresh on every run

// recursive: true also creates missing parents, like mkdir -p.
// path.join puts the right separator between parts.
const deep = path.join(base, "sub", "deep");
fs.mkdirSync(deep, { recursive: true });
console.log("created", deep);

fs.writeFileSync(path.join(base, "a.txt"), "a");
fs.writeFileSync(path.join(base, "b.txt"), "b");
fs.writeFileSync(path.join(base, "sub", "c.txt"), "c");

// withFileTypes returns entries that know whether they're directories.
// The order isn't guaranteed: sort by name.
const entries = fs.readdirSync(base, { withFileTypes: true });
entries.sort((a, b) => a.name.localeCompare(b.name));
console.log(\`entries in \${base}:\`);
for (const e of entries) console.log("  " + e.name + (e.isDirectory() ? "/" : ""));

// Walk the tree with a recursive function.
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
console.log("all files:");
for (const f of walk(base).sort()) console.log("  " + path.relative(base, f));

fs.rmSync(base, { recursive: true }); // the directory and everything in it
console.log("removed:", !fs.existsSync(base));
`,
      typescript: `import * as fs from "fs";
import * as path from "path";

const base = "/tmp/ngoding_dir";
fs.rmSync(base, { recursive: true, force: true }); // start fresh on every run

// recursive: true also creates missing parents, like mkdir -p.
// path.join puts the right separator between parts.
const deep = path.join(base, "sub", "deep");
fs.mkdirSync(deep, { recursive: true });
console.log("created", deep);

fs.writeFileSync(path.join(base, "a.txt"), "a");
fs.writeFileSync(path.join(base, "b.txt"), "b");
fs.writeFileSync(path.join(base, "sub", "c.txt"), "c");

// withFileTypes returns fs.Dirent objects that know whether they're directories.
// The order isn't guaranteed: sort by name.
const entries: fs.Dirent[] = fs.readdirSync(base, { withFileTypes: true });
entries.sort((a, b) => a.name.localeCompare(b.name));
console.log(\`entries in \${base}:\`);
for (const e of entries) console.log("  " + e.name + (e.isDirectory() ? "/" : ""));

// Walk the tree with a recursive function.
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
console.log("all files:");
for (const f of walk(base).sort()) console.log("  " + path.relative(base, f));

fs.rmSync(base, { recursive: true }); // the directory and everything in it
console.log("removed:", !fs.existsSync(base));
`,
    },
  },

  {
    id: "json",
    title: "JSON",
    intro: `<p><b>JSON</b> is the most common format for sending data between programs: objects <code>{"key": value}</code>, arrays <code>[1, 2]</code>, strings, numbers, <code>true</code>/<code>false</code> and <code>null</code>. <b>Parsing</b> (decoding) turns JSON text into the language's values; <b>encoding</b> turns values back into text.</p>
<p>Python, Go, JavaScript and TypeScript have JSON in their standard library. C, C++, Rust and Haskell don't; real projects use a library (<code>cJSON</code>, <code>nlohmann/json</code>, <code>serde_json</code>, <code>aeson</code>). In those, write a small parser yourself, which also shows how parsing works: look at the next character, decide what kind of value starts there, and recurse for nested values.</p>`,
    output: `name: Ada
age: 36
languages: C, Haskell
admin: false
encoded: {"name":"Ada","age":37,"languages":["C","Haskell","Rust"]}
`,
    code: {
      python: `import json

text = '{"name": "Ada", "age": 36, "languages": ["C", "Haskell"], "admin": false}'

# json.loads turns JSON text into dicts, lists, str, int/float, bool and None.
person = json.loads(text)
print("name:", person["name"])
print("age:", person["age"])
print("languages:", ", ".join(person["languages"]))
# JSON false became Python False; dumps turns it back into JSON.
print("admin:", json.dumps(person["admin"]))

# Build a new value and encode it. separators drops the spaces dumps adds by default.
updated = {
    "name": person["name"],
    "age": person["age"] + 1,
    "languages": person["languages"] + ["Rust"],
}
print("encoded:", json.dumps(updated, separators=(",", ":")))
`,
      c: `/* C has no JSON in its standard library (real code uses a library such as
   cJSON). This is a small parser: enough for objects, arrays, strings,
   numbers, true/false/null, without \\u escapes. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef enum { J_NULL, J_BOOL, J_NUM, J_STR, J_ARR, J_OBJ } Kind;

typedef struct Json {
    Kind kind;
    double num;          /* J_NUM, and J_BOOL (0 or 1) */
    char *str;           /* J_STR */
    int len;             /* number of items (J_ARR) or fields (J_OBJ) */
    char **keys;         /* J_OBJ */
    struct Json **items; /* J_ARR values, or J_OBJ values */
} Json;

static const char *p; /* the parser's position in the text */

static void skip_ws(void) {
    while (*p == ' ' || *p == '\\n' || *p == '\\t' || *p == '\\r') p++;
}

static Json *new_json(Kind kind) {
    Json *j = calloc(1, sizeof *j);
    j->kind = kind;
    return j;
}

/* Parse "..." and return a new string (handles \\" and \\\\ only). */
static char *parse_string(void) {
    char *out = malloc(strlen(p) + 1), *o = out;
    p++; /* opening quote */
    while (*p != '"') {
        if (*p == '\\\\') p++;
        *o++ = *p++;
    }
    p++; /* closing quote */
    *o = '\\0';
    return out;
}

static Json *parse_value(void);

/* Arrays and objects: values separated by commas until the closing bracket. */
static Json *parse_list(Kind kind, char close) {
    Json *j = new_json(kind);
    p++; /* [ or { */
    skip_ws();
    while (*p != close) {
        j->items = realloc(j->items, (j->len + 1) * sizeof *j->items);
        if (kind == J_OBJ) {
            j->keys = realloc(j->keys, (j->len + 1) * sizeof *j->keys);
            j->keys[j->len] = parse_string();
            skip_ws();
            p++; /* : */
        }
        j->items[j->len++] = parse_value();
        skip_ws();
        if (*p == ',') p++;
        skip_ws();
    }
    p++;
    return j;
}

/* Look at the next character to see what kind of value starts here. */
static Json *parse_value(void) {
    skip_ws();
    if (*p == '{') return parse_list(J_OBJ, '}');
    if (*p == '[') return parse_list(J_ARR, ']');
    if (*p == '"') {
        Json *j = new_json(J_STR);
        j->str = parse_string();
        return j;
    }
    if (!strncmp(p, "true", 4) || !strncmp(p, "false", 5)) {
        Json *j = new_json(J_BOOL);
        j->num = *p == 't';
        p += *p == 't' ? 4 : 5;
        return j;
    }
    if (!strncmp(p, "null", 4)) {
        p += 4;
        return new_json(J_NULL);
    }
    Json *j = new_json(J_NUM);
    char *end;
    j->num = strtod(p, &end); /* parses the number and tells us where it ended */
    p = end;
    return j;
}

static Json *get(const Json *obj, const char *key) {
    for (int i = 0; i < obj->len; i++) {
        if (!strcmp(obj->keys[i], key)) return obj->items[i];
    }
    return NULL;
}

static void free_json(Json *j) {
    for (int i = 0; i < j->len; i++) {
        free_json(j->items[i]);
        if (j->keys) free(j->keys[i]);
    }
    free(j->items);
    free(j->keys);
    free(j->str);
    free(j);
}

int main(void) {
    p = "{\\"name\\": \\"Ada\\", \\"age\\": 36, \\"languages\\": [\\"C\\", \\"Haskell\\"], \\"admin\\": false}";
    Json *person = parse_value();

    Json *langs = get(person, "languages");
    printf("name: %s\\n", get(person, "name")->str);
    int age = (int)get(person, "age")->num;
    printf("age: %d\\n", age);
    printf("languages: ");
    for (int i = 0; i < langs->len; i++) printf("%s%s", i ? ", " : "", langs->items[i]->str);
    printf("\\n");
    printf("admin: %s\\n", get(person, "admin")->num ? "true" : "false");

    /* Encoding is printing with the right punctuation. */
    printf("encoded: {\\"name\\":\\"%s\\",\\"age\\":%d,\\"languages\\":[", get(person, "name")->str, age + 1);
    for (int i = 0; i < langs->len; i++) printf("\\"%s\\",", langs->items[i]->str);
    printf("\\"Rust\\"]}\\n");

    free_json(person);
    return 0;
}
`,
      cpp: `// C++ has no JSON in its standard library (real code uses a library such as
// nlohmann/json). This is a small parser: objects, arrays, strings, numbers,
// true/false/null, without \\u escapes.
#include <cctype>
#include <stdexcept>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

struct Json {
    enum Kind { Null, Bool, Num, Str, Arr, Obj } kind = Null;
    bool b = false;
    double num = 0;
    std::string str;
    std::vector<Json> items;                         // Arr
    std::vector<std::pair<std::string, Json>> fields; // Obj, in order

    const Json &operator[](const std::string &key) const {
        for (const auto &f : fields)
            if (f.first == key) return f.second;
        throw std::out_of_range("no key " + key);
    }
};

class Parser {
public:
    explicit Parser(const std::string &text) : s(text) {}

    // Look at the next character to see what kind of value starts here.
    Json value() {
        skipWs();
        Json j;
        char c = s[i];
        if (c == '{') {
            j.kind = Json::Obj;
            list('}', [&] {
                std::string key = string();
                expect(':');
                j.fields.emplace_back(key, value());
            });
        } else if (c == '[') {
            j.kind = Json::Arr;
            list(']', [&] { j.items.push_back(value()); });
        } else if (c == '"') {
            j.kind = Json::Str;
            j.str = string();
        } else if (s.compare(i, 4, "true") == 0 || s.compare(i, 5, "false") == 0) {
            j.kind = Json::Bool;
            j.b = c == 't';
            i += j.b ? 4 : 5;
        } else if (s.compare(i, 4, "null") == 0) {
            i += 4;
        } else {
            j.kind = Json::Num;
            std::size_t used;
            j.num = std::stod(s.substr(i), &used); // tells us how much it read
            i += used;
        }
        return j;
    }

private:
    const std::string &s;
    std::size_t i = 0;

    void skipWs() {
        while (i < s.size() && std::isspace(static_cast<unsigned char>(s[i]))) i++;
    }

    void expect(char c) {
        skipWs();
        if (s[i] != c) throw std::runtime_error(std::string("expected ") + c);
        i++;
    }

    std::string string() {
        skipWs();
        expect('"');
        std::string out;
        while (s[i] != '"') {
            if (s[i] == '\\\\') i++;
            out += s[i++];
        }
        i++;
        return out;
    }

    // Items separated by commas until the closing bracket; item() parses one.
    template <typename F>
    void list(char close, F item) {
        i++;
        skipWs();
        while (s[i] != close) {
            item();
            skipWs();
            if (s[i] == ',') i++;
            skipWs();
        }
        i++;
    }
};

// Encoding: write each kind of value with the right punctuation.
std::string encode(const Json &j) {
    switch (j.kind) {
    case Json::Null: return "null";
    case Json::Bool: return j.b ? "true" : "false";
    case Json::Num: return std::to_string(static_cast<long long>(j.num));
    case Json::Str: return "\\"" + j.str + "\\"";
    case Json::Arr: {
        std::string out = "[";
        for (std::size_t k = 0; k < j.items.size(); k++) out += (k ? "," : "") + encode(j.items[k]);
        return out + "]";
    }
    case Json::Obj: {
        std::string out = "{";
        for (std::size_t k = 0; k < j.fields.size(); k++) {
            out += (k ? ",\\"" : "\\"") + j.fields[k].first + "\\":" + encode(j.fields[k].second);
        }
        return out + "}";
    }
    }
    return "";
}

int main() {
    std::string text = R"({"name": "Ada", "age": 36, "languages": ["C", "Haskell"], "admin": false})";
    Json person = Parser(text).value();

    std::cout << "name: " << person["name"].str << "\\n";
    std::cout << "age: " << person["age"].num << "\\n";
    std::cout << "languages: ";
    const auto &langs = person["languages"].items;
    for (std::size_t k = 0; k < langs.size(); k++) std::cout << (k ? ", " : "") << langs[k].str;
    std::cout << "\\n";
    std::cout << "admin: " << std::boolalpha << person["admin"].b << "\\n";

    Json updated;
    updated.kind = Json::Obj;
    Json age = person["age"];
    age.num += 1;
    Json languages = person["languages"];
    Json rust;
    rust.kind = Json::Str;
    rust.str = "Rust";
    languages.items.push_back(rust);
    updated.fields = {{"name", person["name"]}, {"age", age}, {"languages", languages}};
    std::cout << "encoded: " << encode(updated) << "\\n";
}
`,
      go: `package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Struct tags map JSON keys to fields. omitempty leaves a field out of the
// encoded JSON when it has its zero value (false, 0, "", nil).
type Person struct {
	Name      string   \`json:"name"\`
	Age       int      \`json:"age"\`
	Languages []string \`json:"languages"\`
	Admin     bool     \`json:"admin,omitempty"\`
}

func main() {
	text := \`{"name": "Ada", "age": 36, "languages": ["C", "Haskell"], "admin": false}\`

	// Unmarshal fills the struct through a pointer; unknown keys are ignored.
	var p Person
	if err := json.Unmarshal([]byte(text), &p); err != nil {
		panic(err)
	}
	fmt.Println("name:", p.Name)
	fmt.Println("age:", p.Age)
	fmt.Println("languages:", strings.Join(p.Languages, ", "))
	fmt.Println("admin:", p.Admin)

	p.Age++
	p.Languages = append(p.Languages, "Rust")
	// Marshal encodes fields in struct order; Admin is false, so it's omitted.
	out, err := json.Marshal(p)
	if err != nil {
		panic(err)
	}
	fmt.Println("encoded:", string(out))
}
`,
      rust: `// Rust's standard library has no JSON (real code uses the serde_json crate).
// This is a small parser: objects, arrays, strings, numbers, true/false/null,
// without \\u escapes.
use std::iter::Peekable;
use std::str::Chars;

#[derive(Clone, Debug)]
enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>), // keeps keys in order
}

impl Json {
    fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Obj(fields) => fields.iter().find(|f| f.0 == key).map(|f| &f.1),
            _ => None,
        }
    }

    // Encoding: write each kind of value with the right punctuation.
    fn encode(&self) -> String {
        match self {
            Json::Null => "null".to_string(),
            Json::Bool(b) => b.to_string(),
            Json::Num(n) => n.to_string(), // 37.0 prints as "37"
            Json::Str(s) => format!("\\"{}\\"", s),
            Json::Arr(items) => {
                let parts: Vec<String> = items.iter().map(|j| j.encode()).collect();
                format!("[{}]", parts.join(","))
            }
            Json::Obj(fields) => {
                let parts: Vec<String> = fields.iter().map(|(k, v)| format!("\\"{}\\":{}", k, v.encode())).collect();
                format!("{{{}}}", parts.join(","))
            }
        }
    }
}

struct Parser<'a> {
    chars: Peekable<Chars<'a>>,
}

impl<'a> Parser<'a> {
    fn skip_ws(&mut self) {
        while self.chars.peek().map_or(false, |c| c.is_whitespace()) {
            self.chars.next();
        }
    }

    fn word(&mut self, w: &str, value: Json) -> Result<Json, String> {
        for expected in w.chars() {
            if self.chars.next() != Some(expected) {
                return Err(format!("expected {}", w));
            }
        }
        Ok(value)
    }

    fn string(&mut self) -> Result<String, String> {
        self.chars.next(); // opening quote
        let mut out = String::new();
        loop {
            match self.chars.next() {
                Some('"') => return Ok(out),
                Some('\\\\') => out.extend(self.chars.next()),
                Some(c) => out.push(c),
                None => return Err("unterminated string".to_string()),
            }
        }
    }

    // Items separated by commas until \`close\`; item() parses one.
    fn list<F: FnMut(&mut Self) -> Result<(), String>>(&mut self, close: char, mut item: F) -> Result<(), String> {
        self.chars.next(); // [ or {
        loop {
            self.skip_ws();
            match self.chars.peek() {
                Some(&c) if c == close => {
                    self.chars.next();
                    return Ok(());
                }
                Some(',') => {
                    self.chars.next();
                }
                Some(_) => item(self)?,
                None => return Err(format!("expected {}", close)),
            }
        }
    }

    // Look at the next character to see what kind of value starts here.
    fn value(&mut self) -> Result<Json, String> {
        self.skip_ws();
        match self.chars.peek() {
            Some('{') => {
                let mut fields = Vec::new();
                self.list('}', |p| {
                    let key = p.string()?;
                    p.skip_ws();
                    p.chars.next(); // :
                    fields.push((key, p.value()?));
                    Ok(())
                })?;
                Ok(Json::Obj(fields))
            }
            Some('[') => {
                let mut items = Vec::new();
                self.list(']', |p| {
                    items.push(p.value()?);
                    Ok(())
                })?;
                Ok(Json::Arr(items))
            }
            Some('"') => Ok(Json::Str(self.string()?)),
            Some('t') => self.word("true", Json::Bool(true)),
            Some('f') => self.word("false", Json::Bool(false)),
            Some('n') => self.word("null", Json::Null),
            _ => {
                let mut num = String::new();
                while let Some(&c) = self.chars.peek() {
                    if !(c.is_ascii_digit() || "+-.eE".contains(c)) {
                        break;
                    }
                    num.push(c);
                    self.chars.next();
                }
                num.parse().map(Json::Num).map_err(|_| format!("bad number {:?}", num))
            }
        }
    }
}

fn parse(text: &str) -> Result<Json, String> {
    Parser { chars: text.chars().peekable() }.value()
}

fn main() {
    let text = r#"{"name": "Ada", "age": 36, "languages": ["C", "Haskell"], "admin": false}"#;
    let person = parse(text).expect("invalid JSON");

    // Pull typed values out with pattern matching.
    let name = match person.get("name") {
        Some(Json::Str(s)) => s.clone(),
        _ => panic!("no name"),
    };
    let age = match person.get("age") {
        Some(&Json::Num(n)) => n,
        _ => panic!("no age"),
    };
    let mut languages = match person.get("languages") {
        Some(Json::Arr(items)) => items.clone(),
        _ => Vec::new(),
    };
    let names: Vec<String> = languages.iter().map(|j| match j {
        Json::Str(s) => s.clone(),
        other => other.encode(),
    }).collect();

    println!("name: {}", name);
    println!("age: {}", age);
    println!("languages: {}", names.join(", "));
    println!("admin: {}", person.get("admin").map_or("null".to_string(), |j| j.encode()));

    languages.push(Json::Str("Rust".to_string()));
    let updated = Json::Obj(vec![
        ("name".to_string(), Json::Str(name)),
        ("age".to_string(), Json::Num(age + 1.0)),
        ("languages".to_string(), Json::Arr(languages)),
    ]);
    println!("encoded: {}", updated.encode());
}
`,
      haskell: `-- Haskell's standard library has no JSON (real code uses the aeson package).
-- This is a small parser built from ReadP, the parser combinators in base:
-- objects, arrays, strings, numbers, true/false/null, without \\u escapes.
import Data.Char (isDigit)
import Data.List (intercalate)
import Text.ParserCombinators.ReadP

data JSON
  = JNull
  | JBool Bool
  | JNum Integer
  | JStr String
  | JArr [JSON]
  | JObj [(String, JSON)]
  deriving (Show)

-- Each parser skips the spaces after it.
token :: ReadP a -> ReadP a
token p = p <* skipSpaces

str :: ReadP String
str = token (between (char '"') (char '"') (munch (/= '"')))

-- <++ tries the left parser first and only falls back to the right one.
value :: ReadP JSON
value =
  (JNull <$ token (string "null"))
    <++ (JBool True <$ token (string "true"))
    <++ (JBool False <$ token (string "false"))
    <++ (JNum . read <$> token (munch1 isDigit))
    <++ (JStr <$> str)
    <++ (JArr <$> listOf '[' ']' value)
    <++ (JObj <$> listOf '{' '}' field)
  where
    listOf open close item = between (token (char open)) (token (char close)) (sepBy item (token (char ',')))
    field = (,) <$> str <* token (char ':') <*> value

parseJSON :: String -> Maybe JSON
parseJSON text = case readP_to_S (skipSpaces *> value <* eof) text of
  [(v, "")] -> Just v
  _ -> Nothing

encode :: JSON -> String
encode JNull = "null"
encode (JBool b) = if b then "true" else "false"
encode (JNum n) = show n
encode (JStr s) = show s
encode (JArr xs) = "[" ++ intercalate "," (map encode xs) ++ "]"
encode (JObj kvs) = "{" ++ intercalate "," [show k ++ ":" ++ encode v | (k, v) <- kvs] ++ "}"

main :: IO ()
main = do
  let text = "{\\"name\\": \\"Ada\\", \\"age\\": 36, \\"languages\\": [\\"C\\", \\"Haskell\\"], \\"admin\\": false}"
  case parseJSON text of
    Just (JObj fields) -> do
      -- Pattern matching pulls typed values out; a mismatch would crash here.
      let Just (JStr name) = lookup "name" fields
          Just (JNum age) = lookup "age" fields
          Just (JArr langs) = lookup "languages" fields
          Just admin = lookup "admin" fields
      putStrLn ("name: " ++ name)
      putStrLn ("age: " ++ show age)
      putStrLn ("languages: " ++ intercalate ", " [s | JStr s <- langs])
      putStrLn ("admin: " ++ encode admin)
      let updated =
            JObj
              [ ("name", JStr name),
                ("age", JNum (age + 1)),
                ("languages", JArr (langs ++ [JStr "Rust"]))
              ]
      putStrLn ("encoded: " ++ encode updated)
    _ -> putStrLn "invalid JSON"
`,
      javascript: `const text = '{"name": "Ada", "age": 36, "languages": ["C", "Haskell"], "admin": false}';

// JSON is JavaScript's own object syntax (with stricter quoting).
const person = JSON.parse(text);
console.log("name:", person.name);
console.log("age:", person.age);
console.log("languages:", person.languages.join(", "));
console.log("admin:", person.admin);

// stringify keeps keys in insertion order. Spread (...) copies the array.
const updated = {
  name: person.name,
  age: person.age + 1,
  languages: [...person.languages, "Rust"],
};
console.log("encoded:", JSON.stringify(updated));
`,
      typescript: `// Describe the shape you expect. JSON.parse returns \`any\`, so TypeScript
// can't check it: real code should validate the data before trusting it.
interface Person {
  name: string;
  age: number;
  languages: string[];
  admin?: boolean;
}

const text = '{"name": "Ada", "age": 36, "languages": ["C", "Haskell"], "admin": false}';

const person: Person = JSON.parse(text);
console.log("name:", person.name);
console.log("age:", person.age);
console.log("languages:", person.languages.join(", "));
console.log("admin:", person.admin);

// stringify keeps keys in insertion order. Spread (...) copies the array.
const updated: Person = {
  name: person.name,
  age: person.age + 1,
  languages: [...person.languages, "Rust"],
};
console.log("encoded:", JSON.stringify(updated));
`,
    },
  },

  {
    id: "parsing_numbers",
    title: "Parsing Numbers",
    intro: `<p>Input from files, the command line or the network arrives as text. To do arithmetic you first <b>parse</b> the text into a number, and you must handle text that isn't a number.</p>
<p>Watch out for lenient parsers: C's <code>atoi("12abc")</code>, C++'s <code>std::stoi</code> and JavaScript's <code>parseInt</code> all return <code>12</code> and ignore the rest. Check that the <i>whole</i> string was used. Going the other way, formatting a number as text, can also pick a base, such as hexadecimal.</p>`,
    output: `42 + 1 = 43
3.5 * 2 = 7.0
ff in hex = 255
255 back to hex = ff
"12abc" is not a number
`,
    code: {
      python: `n = int("42")
print("42 + 1 =", n + 1)

x = float("3.5")
print("3.5 * 2 =", x * 2)

# The second argument is the base.
h = int("ff", 16)
print("ff in hex =", h)
# format specs turn numbers back into text: "x" is lowercase hex.
print("255 back to hex =", format(255, "x"))

# int() raises ValueError when the whole string isn't a number.
try:
    int("12abc")
except ValueError:
    print('"12abc" is not a number')
`,
      c: `#include <errno.h>
#include <stdio.h>
#include <stdlib.h>

/* strtol parses a number and sets *end to the first character it didn't use.
   It's only a valid number if it used the whole string. */
static int parse_int(const char *s, int base, long *out) {
    char *end;
    errno = 0;
    *out = strtol(s, &end, base);
    return end != s && *end == '\\0' && errno == 0; /* errno: out of range */
}

int main(void) {
    long n;
    if (parse_int("42", 10, &n)) printf("42 + 1 = %ld\\n", n + 1);

    /* strtod is the same for floating point. */
    double x = strtod("3.5", NULL);
    printf("3.5 * 2 = %.1f\\n", x * 2);

    long h;
    if (parse_int("ff", 16, &h)) printf("ff in hex = %ld\\n", h);
    /* %x formats a number in hexadecimal. */
    printf("255 back to hex = %x\\n", 255);

    if (!parse_int("12abc", 10, &n)) printf("\\"12abc\\" is not a number\\n");
    return 0;
}
`,
      cpp: `#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>

// std::stoi("12abc") returns 12 and ignores the rest. Its second argument
// reports how many characters it used: require all of them.
int parseInt(const std::string &s, int base = 10) {
    std::size_t used = 0;
    int n = std::stoi(s, &used, base); // throws if there's no number at all
    if (used != s.size()) throw std::invalid_argument(s);
    return n;
}

int main() {
    int n = parseInt("42");
    std::cout << "42 + 1 = " << n + 1 << "\\n";

    double x = std::stod("3.5");
    // std::fixed with setprecision(1) prints one digit after the point.
    std::cout << "3.5 * 2 = " << std::fixed << std::setprecision(1) << x * 2 << "\\n";

    std::cout << "ff in hex = " << parseInt("ff", 16) << "\\n";
    // std::hex switches the stream to hexadecimal.
    std::cout << "255 back to hex = " << std::hex << 255 << std::dec << "\\n";

    try {
        parseInt("12abc");
    } catch (const std::invalid_argument &) {
        std::cout << "\\"12abc\\" is not a number\\n";
    }
}
`,
      go: `package main

import (
	"fmt"
	"strconv"
)

func main() {
	// strconv.Atoi parses a base-10 int; it returns an error for bad input.
	n, err := strconv.Atoi("42")
	if err != nil {
		panic(err)
	}
	fmt.Println("42 + 1 =", n+1)

	// 64 is the precision: float64.
	x, _ := strconv.ParseFloat("3.5", 64)
	fmt.Printf("3.5 * 2 = %.1f\\n", x*2)

	// ParseInt takes a base (16) and a bit size (64).
	h, _ := strconv.ParseInt("ff", 16, 64)
	fmt.Println("ff in hex =", h)
	fmt.Println("255 back to hex =", strconv.FormatInt(255, 16))

	if _, err := strconv.Atoi("12abc"); err != nil {
		fmt.Printf("%q is not a number\\n", "12abc")
	}
}
`,
      rust: `fn main() {
    // parse() works for any type that implements FromStr. It returns a
    // Result, so bad input is an Err rather than a crash or a silent 0.
    let n: i32 = "42".parse().unwrap();
    println!("42 + 1 = {}", n + 1);

    let x: f64 = "3.5".parse().unwrap();
    println!("3.5 * 2 = {:.1}", x * 2.0);

    let h = i64::from_str_radix("ff", 16).unwrap();
    println!("ff in hex = {}", h);
    // {:x} formats in hexadecimal.
    println!("255 back to hex = {:x}", 255);

    match "12abc".parse::<i32>() {
        Ok(v) => println!("parsed {}", v),
        Err(_) => println!("{:?} is not a number", "12abc"),
    }
}
`,
      haskell: `import Numeric (readHex, showHex)
import Text.Printf (printf)
import Text.Read (readMaybe)

main :: IO ()
main = do
  -- read crashes on bad input; readMaybe returns Nothing instead.
  let n = read "42" :: Int
  putStrLn ("42 + 1 = " ++ show (n + 1))

  let x = read "3.5" :: Double
  printf "3.5 * 2 = %.1f\\n" (x * 2)

  -- readHex returns every way to parse a prefix: [(value, rest)].
  let [(h, "")] = readHex "ff" :: [(Int, String)]
  putStrLn ("ff in hex = " ++ show h)
  putStrLn ("255 back to hex = " ++ showHex (255 :: Int) "")

  case readMaybe "12abc" :: Maybe Int of
    Just v -> print v
    Nothing -> putStrLn (show "12abc" ++ " is not a number")
`,
      javascript: `// Number() needs the whole string to be a number; parseInt stops at the
// first bad character, so parseInt("12abc") is 12.
const n = Number("42");
console.log("42 + 1 =", n + 1);

const x = Number("3.5");
// toFixed(1) formats with one digit after the point.
console.log("3.5 * 2 =", (x * 2).toFixed(1));

// parseInt takes a base; check the input first since it's lenient.
const h = parseInt("ff", 16);
console.log("ff in hex =", h);
console.log("255 back to hex =", (255).toString(16));

// Bad input gives NaN ("not a number"), not an exception.
if (Number.isNaN(Number("12abc"))) console.log('"12abc" is not a number');
`,
      typescript: `// Number() needs the whole string to be a number; parseInt stops at the
// first bad character, so parseInt("12abc") is 12.
const n: number = Number("42");
console.log("42 + 1 =", n + 1);

const x: number = Number("3.5");
// toFixed(1) formats with one digit after the point.
console.log("3.5 * 2 =", (x * 2).toFixed(1));

// parseInt takes a base; check the input first since it's lenient.
const h: number = parseInt("ff", 16);
console.log("ff in hex =", h);
console.log("255 back to hex =", (255).toString(16));

// Bad input gives NaN ("not a number"), not an exception. Wrap that in a
// function that returns null so the type system makes callers check.
function parseNumber(s: string): number | null {
  const v = Number(s);
  return Number.isNaN(v) ? null : v;
}
if (parseNumber("12abc") === null) console.log('"12abc" is not a number');
`,
    },
  },

  {
    id: "env_vars",
    title: "Environment Variables",
    intro: `<p>Every process has a set of <b>environment variables</b>: name/value strings inherited from the program that started it. They're a common way to configure programs (<code>HOME</code>, <code>PATH</code>, <code>DATABASE_URL</code>…). Try <code>env</code> in the shell to see yours.</p>
<p>Reading a variable that isn't set is normal, so APIs return "maybe a value" and you supply a default. Setting a variable only changes this process and the processes it starts afterwards, never the shell that ran it.</p>`,
    output: `GREETING = hello
NGODING_MISSING is not set
port = 8080 (default)
after unset: GREETING is not set
`,
    code: {
      python: `import os

# os.environ works like a dict of strings.
os.environ["GREETING"] = "hello"
print("GREETING =", os.environ["GREETING"])

# .get returns None (or a default) instead of raising KeyError.
if os.environ.get("NGODING_MISSING") is None:
    print("NGODING_MISSING is not set")

port = os.environ.get("NGODING_PORT", "8080")
print(f"port = {port} (default)")

del os.environ["GREETING"]
if "GREETING" not in os.environ:
    print("after unset: GREETING is not set")
`,
      c: `#include <stdio.h>
#include <stdlib.h>

int main(void) {
    /* The last argument says whether to overwrite an existing value. */
    setenv("GREETING", "hello", 1);
    printf("GREETING = %s\\n", getenv("GREETING"));

    /* getenv returns NULL when the variable isn't set. */
    if (getenv("NGODING_MISSING") == NULL) printf("NGODING_MISSING is not set\\n");

    const char *port = getenv("NGODING_PORT");
    if (port == NULL) port = "8080";
    printf("port = %s (default)\\n", port);

    unsetenv("GREETING");
    if (!getenv("GREETING")) printf("after unset: GREETING is not set\\n");
    return 0;
}
`,
      cpp: `#include <cstdlib>
#include <iostream>
#include <optional>
#include <string>

// Wrap getenv (which returns nullptr when unset) in std::optional.
std::optional<std::string> env(const char *name) {
    const char *v = std::getenv(name);
    if (v == nullptr) return std::nullopt;
    return std::string(v);
}

int main() {
    // setenv is POSIX, not standard C++, but available on Linux.
    setenv("GREETING", "hello", 1);
    std::cout << "GREETING = " << env("GREETING").value() << "\\n";

    if (!env("NGODING_MISSING")) std::cout << "NGODING_MISSING is not set\\n";

    std::string port = env("NGODING_PORT").value_or("8080");
    std::cout << "port = " << port << " (default)\\n";

    unsetenv("GREETING");
    if (!env("GREETING")) std::cout << "after unset: GREETING is not set\\n";
}
`,
      go: `package main

import (
	"fmt"
	"os"
)

func main() {
	os.Setenv("GREETING", "hello")
	// Getenv returns "" both for unset and empty variables.
	fmt.Println("GREETING =", os.Getenv("GREETING"))

	// LookupEnv also tells you whether it was set at all.
	if _, ok := os.LookupEnv("NGODING_MISSING"); !ok {
		fmt.Println("NGODING_MISSING is not set")
	}

	port, ok := os.LookupEnv("NGODING_PORT")
	if !ok {
		port = "8080"
	}
	fmt.Printf("port = %s (default)\\n", port)

	os.Unsetenv("GREETING")
	if _, ok := os.LookupEnv("GREETING"); !ok {
		fmt.Println("after unset: GREETING is not set")
	}
}
`,
      rust: `use std::env;

fn main() {
    env::set_var("GREETING", "hello");
    // env::var returns a Result: Err if unset (or not valid UTF-8).
    println!("GREETING = {}", env::var("GREETING").unwrap());

    if env::var("NGODING_MISSING").is_err() {
        println!("NGODING_MISSING is not set");
    }

    let port = env::var("NGODING_PORT").unwrap_or_else(|_| "8080".to_string());
    println!("port = {} (default)", port);

    env::remove_var("GREETING");
    if env::var("GREETING").is_err() {
        println!("after unset: GREETING is not set");
    }
}
`,
      haskell: `import Data.Maybe (fromMaybe)
import System.Environment (lookupEnv, setEnv, unsetEnv)

main :: IO ()
main = do
  setEnv "GREETING" "hello"
  -- lookupEnv returns Maybe String: Nothing when unset.
  Just greeting <- lookupEnv "GREETING"
  putStrLn ("GREETING = " ++ greeting)

  missing <- lookupEnv "NGODING_MISSING"
  case missing of
    Nothing -> putStrLn "NGODING_MISSING is not set"
    Just v -> putStrLn ("NGODING_MISSING = " ++ v)

  port <- fromMaybe "8080" <$> lookupEnv "NGODING_PORT"
  putStrLn ("port = " ++ port ++ " (default)")

  unsetEnv "GREETING"
  after <- lookupEnv "GREETING"
  case after of
    Nothing -> putStrLn "after unset: GREETING is not set"
    Just _ -> putStrLn "still set?"
`,
      javascript: `// process.env is an object; every value is a string.
process.env.GREETING = "hello";
console.log("GREETING =", process.env.GREETING);

// Unset variables are undefined.
if (process.env.NGODING_MISSING === undefined) console.log("NGODING_MISSING is not set");

// ?? picks the right side when the left is null or undefined.
const port = process.env.NGODING_PORT ?? "8080";
console.log(\`port = \${port} (default)\`);

delete process.env.GREETING;
if (!("GREETING" in process.env)) console.log("after unset: GREETING is not set");
`,
      typescript: `// process.env values have type string | undefined: TypeScript makes you
// handle the unset case.
process.env.GREETING = "hello";
console.log("GREETING =", process.env.GREETING);

if (process.env.NGODING_MISSING === undefined) console.log("NGODING_MISSING is not set");

// ?? picks the right side when the left is null or undefined.
const port: string = process.env.NGODING_PORT ?? "8080";
console.log(\`port = \${port} (default)\`);

delete process.env.GREETING;
if (!("GREETING" in process.env)) console.log("after unset: GREETING is not set");
`,
    },
  },

  {
    id: "processes",
    title: "Running Commands",
    intro: `<p>Programs often start other programs: a compiler, <code>git</code>, a shell script. The new <b>child process</b> runs separately. You can <b>capture its output</b>, <b>feed it input</b> on its standard input, and read its <b>exit status</b> (0 means success, anything else is an error code).</p>
<p>Passing the program and its arguments as a list runs it directly. Going through a shell (<code>sh -c "…"</code>) lets you use pipes and other shell syntax, but be careful putting user input into a shell command.</p>`,
    output: `output: hello from a child process
tr says: SHOUT
exit status: 3
`,
    code: {
      python: `import subprocess

# capture_output collects stdout/stderr; text=True decodes bytes to str.
result = subprocess.run(["echo", "hello from a child process"], capture_output=True, text=True)
print("output:", result.stdout.strip())

# input= is written to the child's standard input.
result = subprocess.run(["tr", "a-z", "A-Z"], input="shout", capture_output=True, text=True)
print("tr says:", result.stdout)

# returncode is the exit status. (check=True would raise on non-zero.)
result = subprocess.run(["sh", "-c", "exit 3"])
print("exit status:", result.returncode)
`,
      c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>

int main(void) {
    /* popen runs a shell command; "r" gives us a FILE* to read its output. */
    FILE *p = popen("echo hello from a child process", "r");
    char line[256];
    if (fgets(line, sizeof line, p)) {
        line[strcspn(line, "\\n")] = '\\0';
        printf("output: %s\\n", line);
    }
    pclose(p);

    /* "w" writes to the child's standard input instead. tr prints straight to
       our stdout, so flush what we printed first to keep the order. */
    printf("tr says: ");
    fflush(stdout);
    p = popen("tr a-z A-Z", "w");
    fputs("shout\\n", p);
    pclose(p); /* waits for tr to finish */

    /* system runs a command and returns its wait status; WEXITSTATUS extracts
       the exit code. */
    int status = system("exit 3");
    printf("exit status: %d\\n", WEXITSTATUS(status));
    return 0;
}
`,
      cpp: `// The C++ standard library can't start processes, so C++ code on Linux
// uses the C/POSIX functions: popen, pclose and system.
#include <cstdio>
#include <iostream>
#include <stdexcept>
#include <string>
#include <sys/wait.h>

// Run a shell command and return everything it printed.
std::string capture(const std::string &cmd) {
    FILE *p = popen(cmd.c_str(), "r");
    if (!p) throw std::runtime_error("popen failed");
    std::string out;
    char buf[256];
    while (std::fgets(buf, sizeof buf, p)) out += buf;
    pclose(p);
    return out;
}

int main() {
    std::string out = capture("echo hello from a child process");
    out.pop_back(); // drop the trailing newline
    std::cout << "output: " << out << "\\n";

    // Feed input through the shell this time: printf's output is tr's input.
    std::cout << "tr says: " << capture("printf shout | tr a-z A-Z") << "\\n";

    int status = std::system("exit 3");
    std::cout << "exit status: " << WEXITSTATUS(status) << "\\n";
}
`,
      go: `package main

import (
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

func main() {
	// Output runs the command and returns its stdout.
	out, err := exec.Command("echo", "hello from a child process").Output()
	if err != nil {
		panic(err)
	}
	fmt.Println("output:", strings.TrimSpace(string(out)))

	// Anything that implements io.Reader can be the child's stdin.
	cmd := exec.Command("tr", "a-z", "A-Z")
	cmd.Stdin = strings.NewReader("shout")
	out, _ = cmd.Output()
	fmt.Println("tr says:", string(out))

	// A non-zero exit is an *exec.ExitError; errors.As extracts it.
	err = exec.Command("sh", "-c", "exit 3").Run()
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		fmt.Println("exit status:", exitErr.ExitCode())
	}
}
`,
      rust: `use std::io::{self, Write};
use std::process::{Command, Stdio};

fn main() -> io::Result<()> {
    // output() runs the command and collects stdout, stderr and the status.
    let out = Command::new("echo").arg("hello from a child process").output()?;
    // stdout is bytes (Vec<u8>); from_utf8_lossy turns it into text.
    println!("output: {}", String::from_utf8_lossy(&out.stdout).trim());

    // Pipe stdin/stdout so we can write to the child and read its answer.
    let mut child = Command::new("tr")
        .args(&["a-z", "A-Z"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()?;
    // take() moves stdin out of child; dropping it at the end of this
    // statement closes the pipe, so tr sees the end of its input.
    child.stdin.take().unwrap().write_all(b"shout")?;
    let out = child.wait_with_output()?;
    println!("tr says: {}", String::from_utf8_lossy(&out.stdout));

    let status = Command::new("sh").args(&["-c", "exit 3"]).status()?;
    // code() is None if the process was killed by a signal.
    println!("exit status: {}", status.code().unwrap_or(-1));
    Ok(())
}
`,
      haskell: `import System.Exit (ExitCode (..))
import System.Process (readProcess, readProcessWithExitCode)

main :: IO ()
main = do
  -- readProcess program args stdin returns stdout (and fails on non-zero exit).
  out <- readProcess "echo" ["hello from a child process"] ""
  putStrLn ("output: " ++ init out) -- init drops the trailing newline

  shouted <- readProcess "tr" ["a-z", "A-Z"] "shout"
  putStrLn ("tr says: " ++ shouted)

  -- readProcessWithExitCode also returns the exit code and stderr.
  (code, _, _) <- readProcessWithExitCode "sh" ["-c", "exit 3"] ""
  case code of
    ExitSuccess -> putStrLn "exit status: 0"
    ExitFailure n -> putStrLn ("exit status: " ++ show n)
`,
      javascript: `const { execFileSync, spawnSync } = require("child_process");

// execFileSync runs a program and returns its stdout.
// It throws if the program exits with a non-zero status.
const out = execFileSync("echo", ["hello from a child process"], { encoding: "utf8" });
console.log("output:", out.trim());

// input is written to the child's standard input.
const shouted = execFileSync("tr", ["a-z", "A-Z"], { input: "shout", encoding: "utf8" });
console.log("tr says:", shouted);

// spawnSync doesn't throw; it returns an object with the status.
const result = spawnSync("sh", ["-c", "exit 3"]);
console.log("exit status:", result.status);

// (Async versions without "Sync" don't block: they call you back when done.)
`,
      typescript: `import { execFileSync, spawnSync, SpawnSyncReturns } from "child_process";

// execFileSync runs a program and returns its stdout.
// It throws if the program exits with a non-zero status.
const out: string = execFileSync("echo", ["hello from a child process"], { encoding: "utf8" });
console.log("output:", out.trim());

// input is written to the child's standard input.
const shouted: string = execFileSync("tr", ["a-z", "A-Z"], { input: "shout", encoding: "utf8" });
console.log("tr says:", shouted);

// spawnSync doesn't throw. status is null if the child was killed by a signal.
const result: SpawnSyncReturns<Buffer> = spawnSync("sh", ["-c", "exit 3"]);
console.log("exit status:", result.status);
`,
    },
  },

  {
    id: "threads",
    title: "Threads",
    intro: `<p>A <b>thread</b> is a separate flow of execution in the same program, sharing its memory. Splitting work across threads lets a program use several CPU cores. Here four workers each sum a quarter of 1..40000, and the main thread <b>joins</b> (waits for) each one and adds up their results.</p>
<p>When threads change the <i>same</i> variable at the same time, updates can be lost. A <b>mutex</b> (lock) lets only one thread at a time into that section. Notes: Python threads take turns running Python code (the GIL), so they help with waiting rather than computing. Go uses lightweight <i>goroutines</i>, and JavaScript runs separate <i>workers</i> that share memory only through <code>SharedArrayBuffer</code>.</p>`,
    output: `worker 1 summed 1..10000 = 50005000
worker 2 summed 10001..20000 = 150005000
worker 3 summed 20001..30000 = 250005000
worker 4 summed 30001..40000 = 350005000
total = 800020000
counter = 4000
`,
    code: {
      python: `import threading

N, WORKERS = 40000, 4
chunk = N // WORKERS
results = [0] * WORKERS


def work(i):
    lo, hi = i * chunk + 1, (i + 1) * chunk
    # Each worker writes only its own slot, so no lock is needed here.
    results[i] = sum(range(lo, hi + 1))


threads = [threading.Thread(target=work, args=(i,)) for i in range(WORKERS)]
for t in threads:
    t.start()
for t in threads:
    t.join()  # wait for the thread to finish

for i, r in enumerate(results):
    print(f"worker {i + 1} summed {i * chunk + 1}..{(i + 1) * chunk} = {r}")
print("total =", sum(results))

# A shared counter: \`counter += 1\` is read, add, write; the lock makes the
# three steps happen together so no update is lost.
counter = 0
lock = threading.Lock()


def increment():
    global counter
    for _ in range(1000):
        with lock:
            counter += 1


threads = [threading.Thread(target=increment) for _ in range(4)]
for t in threads:
    t.start()
for t in threads:
    t.join()
print("counter =", counter)
`,
      c: `#include <pthread.h>
#include <stdio.h>

#define N 40000
#define WORKERS 4

typedef struct {
    int lo, hi;
    long sum;
} Job;

/* A thread runs a function taking and returning void *. */
static void *work(void *arg) {
    Job *job = arg;
    job->sum = 0;
    for (int i = job->lo; i <= job->hi; i++) job->sum += i;
    return NULL;
}

static int counter = 0;
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;

static void *increment(void *arg) {
    (void)arg;
    for (int i = 0; i < 1000; i++) {
        pthread_mutex_lock(&lock); /* only one thread at a time past here */
        counter++;
        pthread_mutex_unlock(&lock);
    }
    return NULL;
}

int main(void) {
    pthread_t threads[WORKERS];
    Job jobs[WORKERS];
    int chunk = N / WORKERS;
    for (int i = 0; i < WORKERS; i++) {
        jobs[i] = (Job){i * chunk + 1, (i + 1) * chunk, 0};
        pthread_create(&threads[i], NULL, work, &jobs[i]);
    }

    long total = 0;
    for (int i = 0; i < WORKERS; i++) {
        pthread_join(threads[i], NULL); /* wait for the thread to finish */
        printf("worker %d summed %d..%d = %ld\\n", i + 1, jobs[i].lo, jobs[i].hi, jobs[i].sum);
        total += jobs[i].sum;
    }
    printf("total = %ld\\n", total);

    for (int i = 0; i < 4; i++) pthread_create(&threads[i], NULL, increment, NULL);
    for (int i = 0; i < 4; i++) pthread_join(threads[i], NULL);
    printf("counter = %d\\n", counter);
    return 0;
}
`,
      cpp: `#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

int main() {
    const int n = 40000, workers = 4, chunk = n / workers;
    std::vector<long> results(workers);
    std::vector<std::thread> threads;

    for (int i = 0; i < workers; i++) {
        // The lambda captures i by value and results by reference;
        // each thread writes only its own slot.
        threads.emplace_back([i, chunk, &results] {
            long sum = 0;
            for (int x = i * chunk + 1; x <= (i + 1) * chunk; x++) sum += x;
            results[i] = sum;
        });
    }

    long total = 0;
    for (int i = 0; i < workers; i++) {
        threads[i].join(); // wait for the thread to finish
        std::cout << "worker " << i + 1 << " summed " << i * chunk + 1 << ".." << (i + 1) * chunk
                  << " = " << results[i] << "\\n";
        total += results[i];
    }
    std::cout << "total = " << total << "\\n";

    int counter = 0;
    std::mutex m;
    threads.clear();
    for (int t = 0; t < 4; t++) {
        threads.emplace_back([&] {
            for (int k = 0; k < 1000; k++) {
                // lock_guard locks now and unlocks at the end of the block.
                std::lock_guard<std::mutex> guard(m);
                counter++;
            }
        });
    }
    for (auto &t : threads) t.join();
    std::cout << "counter = " << counter << "\\n";
}
`,
      go: `package main

import (
	"fmt"
	"sync"
)

func main() {
	const n, workers = 40000, 4
	chunk := n / workers
	results := make([]int, workers)

	// A WaitGroup counts running goroutines; Wait blocks until it's zero.
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		// \`go\` starts the function in a new goroutine. Pass i as an argument
		// so each goroutine gets its own copy.
		go func(i int) {
			defer wg.Done()
			sum := 0
			for x := i*chunk + 1; x <= (i+1)*chunk; x++ {
				sum += x
			}
			results[i] = sum // each goroutine writes only its own slot
		}(i)
	}
	wg.Wait()

	total := 0
	for i, r := range results {
		fmt.Printf("worker %d summed %d..%d = %d\\n", i+1, i*chunk+1, (i+1)*chunk, r)
		total += r
	}
	fmt.Println("total =", total)

	counter := 0
	var mu sync.Mutex
	for t := 0; t < 4; t++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for k := 0; k < 1000; k++ {
				mu.Lock()
				counter++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	fmt.Println("counter =", counter)
}
`,
      rust: `use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let (n, workers) = (40000, 4);
    let chunk = n / workers;

    // thread::spawn runs the closure in a new thread; \`move\` gives it its
    // own copy of i. The closure's return value comes back from join().
    let handles: Vec<_> = (0..workers)
        .map(|i| thread::spawn(move || (i * chunk + 1..=(i + 1) * chunk).sum::<i64>()))
        .collect();

    let mut total = 0;
    for (i, handle) in handles.into_iter().enumerate() {
        let sum = handle.join().unwrap(); // wait for the thread to finish
        let i = i as i64;
        println!("worker {} summed {}..{} = {}", i + 1, i * chunk + 1, (i + 1) * chunk, sum);
        total += sum;
    }
    println!("total = {}", total);

    // Shared data needs Arc (shared ownership across threads) and Mutex (one
    // thread at a time). Rust won't compile code that shares it unprotected.
    let counter = Arc::new(Mutex::new(0));
    let handles: Vec<_> = (0..4)
        .map(|_| {
            let counter = Arc::clone(&counter);
            thread::spawn(move || {
                for _ in 0..1000 {
                    *counter.lock().unwrap() += 1; // unlocked when the guard is dropped
                }
            })
        })
        .collect();
    for handle in handles {
        handle.join().unwrap();
    }
    println!("counter = {}", *counter.lock().unwrap());
}
`,
      haskell: `import Control.Concurrent (forkIO)
import Control.Concurrent.MVar
import Control.Monad (forM, forM_, replicateM, replicateM_)

-- An MVar is a box that is either full or empty: takeMVar waits until it's
-- full. Each worker puts its result in its own MVar, and main waits on them.
main :: IO ()
main = do
  let (n, workers) = (40000, 4) :: (Int, Int)
      chunk = n \`div\` workers
      range i = (i * chunk + 1, (i + 1) * chunk)
  boxes <- forM [0 .. workers - 1] $ \\i -> do
    box <- newEmptyMVar
    let (lo, hi) = range i
    -- forkIO starts a lightweight thread. $! computes the sum in the thread.
    _ <- forkIO (putMVar box $! sum [lo .. hi])
    return box

  results <- mapM takeMVar boxes -- waits for each worker in turn
  forM_ (zip [0 ..] results) $ \\(i, r) -> do
    let (lo, hi) = range i
    putStrLn ("worker " ++ show (i + 1) ++ " summed " ++ show lo ++ ".." ++ show hi ++ " = " ++ show r)
  putStrLn ("total = " ++ show (sum results))

  -- An MVar also works as a lock around shared state: modifyMVar_ takes the
  -- value (so other threads wait), applies the function, and puts it back.
  counter <- newMVar (0 :: Int)
  done <- replicateM 4 newEmptyMVar
  forM_ done $ \\d -> forkIO $ do
    replicateM_ 1000 (modifyMVar_ counter (return . (+ 1)))
    putMVar d ()
  mapM_ takeMVar done
  final <- readMVar counter
  putStrLn ("counter = " ++ show final)
`,
      javascript: `// Node runs your JavaScript on one thread. worker_threads starts real
// threads, each with its own copy of the program; they talk by messages
// or through shared memory (SharedArrayBuffer).
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

if (isMainThread) {
  const n = 40000, workers = 4, chunk = n / workers;
  // Shared memory: one 32-bit integer that every worker can see.
  const shared = new Int32Array(new SharedArrayBuffer(4));

  // Start this same file as a worker; resolve with the message it sends back.
  const run = (lo, hi) =>
    new Promise((resolve, reject) => {
      const w = new Worker(__filename, { workerData: { lo, hi, shared } });
      w.once("message", resolve);
      w.once("error", reject);
    });

  const ranges = [...Array(workers).keys()].map((i) => [i * chunk + 1, (i + 1) * chunk]);
  // Promise.all waits for every worker (like joining threads).
  Promise.all(ranges.map(([lo, hi]) => run(lo, hi))).then((results) => {
    results.forEach((r, i) => console.log(\`worker \${i + 1} summed \${ranges[i][0]}..\${ranges[i][1]} = \${r}\`));
    console.log("total =", results.reduce((a, b) => a + b, 0));
    // Atomics.add made each increment indivisible, like a lock would.
    console.log("counter =", Atomics.load(shared, 0));
  });
} else {
  const { lo, hi, shared } = workerData;
  let sum = 0;
  for (let x = lo; x <= hi; x++) sum += x;
  for (let k = 0; k < 1000; k++) Atomics.add(shared, 0, 1);
  parentPort.postMessage(sum);
}
`,
      typescript: `// Node runs your JavaScript on one thread. worker_threads starts real
// threads, each with its own copy of the program; they talk by messages
// or through shared memory (SharedArrayBuffer).
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";

interface Job {
  lo: number;
  hi: number;
  shared: Int32Array;
}

if (isMainThread) {
  const n = 40000, workers = 4, chunk = n / workers;
  // Shared memory: one 32-bit integer that every worker can see.
  const shared = new Int32Array(new SharedArrayBuffer(4));

  // Start this same file as a worker; resolve with the message it sends back.
  const run = (lo: number, hi: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const job: Job = { lo, hi, shared };
      const w = new Worker(__filename, { workerData: job });
      w.once("message", resolve);
      w.once("error", reject);
    });

  const ranges = [...Array(workers).keys()].map((i) => [i * chunk + 1, (i + 1) * chunk]);
  // Promise.all waits for every worker (like joining threads).
  Promise.all(ranges.map(([lo, hi]) => run(lo, hi))).then((results) => {
    results.forEach((r, i) => console.log(\`worker \${i + 1} summed \${ranges[i][0]}..\${ranges[i][1]} = \${r}\`));
    console.log("total =", results.reduce((a, b) => a + b, 0));
    // Atomics.add made each increment indivisible, like a lock would.
    console.log("counter =", Atomics.load(shared, 0));
  });
} else {
  const { lo, hi, shared } = workerData as Job;
  let sum = 0;
  for (let x = lo; x <= hi; x++) sum += x;
  for (let k = 0; k < 1000; k++) Atomics.add(shared, 0, 1);
  parentPort?.postMessage(sum);
}
`,
    },
  },

  {
    id: "sockets",
    title: "TCP Sockets",
    intro: `<p>A <b>socket</b> is one end of a network connection. With TCP, a <b>server</b> socket <i>binds</i> to an address and port, <i>listens</i>, and <i>accepts</i> connections. A <b>client</b> socket <i>connects</i> to that address, and then both sides send and receive bytes.</p>
<p>To keep it to one program, yours is both: the server listens on <code>127.0.0.1</code> (this machine), the client connects to it, sends <code>ping</code> and gets <code>pong</code> back. Port <code>0</code> asks the OS for any free port. Connecting works before the server calls <code>accept</code>: the OS queues the connection. Haskell's standard library has no sockets (real code uses the <code>network</code> package), so call the C functions directly through the FFI (the starter declares them for you).</p>`,
    output: `server listening on 127.0.0.1
client sent: ping
server got: ping
client got: pong
`,
    code: {
      python: `import socket

# AF_INET = IPv4, SOCK_STREAM = TCP.
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.bind(("127.0.0.1", 0))  # port 0: let the OS pick a free port
server.listen()
host, port = server.getsockname()
print("server listening on", host)

# The OS queues the connection until the server accepts it.
client = socket.create_connection((host, port))
client.sendall(b"ping")  # sockets send bytes, not str
print("client sent: ping")

conn, addr = server.accept()  # a new socket for this one connection
data = conn.recv(1024)  # up to 1024 bytes
print("server got:", data.decode())
conn.sendall(b"pong")

print("client got:", client.recv(1024).decode())

for s in (client, conn, server):
    s.close()
`,
      c: `#include <arpa/inet.h>
#include <netinet/in.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

int main(void) {
    /* AF_INET = IPv4, SOCK_STREAM = TCP. A socket is a file descriptor. */
    int server = socket(AF_INET, SOCK_STREAM, 0);

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof addr);
    addr.sin_family = AF_INET;
    addr.sin_port = htons(0); /* port 0: let the OS pick; htons = network byte order */
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);
    if (bind(server, (struct sockaddr *)&addr, sizeof addr) < 0 || listen(server, 1) < 0) {
        perror("server");
        return 1;
    }
    /* getsockname fills addr with the port the OS picked. */
    socklen_t len = sizeof addr;
    getsockname(server, (struct sockaddr *)&addr, &len);
    char host[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &addr.sin_addr, host, sizeof host);
    printf("server listening on %s\\n", host);

    /* The OS queues the connection until the server accepts it. */
    int client = socket(AF_INET, SOCK_STREAM, 0);
    if (connect(client, (struct sockaddr *)&addr, sizeof addr) < 0) {
        perror("connect");
        return 1;
    }
    send(client, "ping", 4, 0);
    printf("client sent: ping\\n");

    int conn = accept(server, NULL, NULL); /* a new socket for this connection */
    char buf[64];
    ssize_t n = recv(conn, buf, sizeof buf - 1, 0);
    buf[n] = '\\0';
    printf("server got: %s\\n", buf);
    send(conn, "pong", 4, 0);

    n = recv(client, buf, sizeof buf - 1, 0);
    buf[n] = '\\0';
    printf("client got: %s\\n", buf);

    close(client);
    close(conn);
    close(server);
    return 0;
}
`,
      cpp: `// The C++ standard library has no sockets yet, so C++ on Linux uses the
// POSIX socket API (or a library such as Boost.Asio). A small class closes
// the socket automatically when it goes out of scope.
#include <arpa/inet.h>
#include <netinet/in.h>
#include <stdexcept>
#include <iostream>
#include <string>
#include <sys/socket.h>
#include <unistd.h>

class Socket {
public:
    explicit Socket(int fd) : fd_(fd) {
        if (fd_ < 0) throw std::runtime_error("socket failed");
    }
    Socket(const Socket &) = delete; // one owner per descriptor
    ~Socket() { close(fd_); }
    int fd() const { return fd_; }

    void send(const std::string &s) const { ::send(fd_, s.data(), s.size(), 0); }

    std::string recv() const {
        char buf[64];
        ssize_t n = ::recv(fd_, buf, sizeof buf, 0);
        return std::string(buf, n > 0 ? n : 0);
    }

private:
    int fd_;
};

int main() {
    // AF_INET = IPv4, SOCK_STREAM = TCP.
    Socket server(socket(AF_INET, SOCK_STREAM, 0));
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(0); // port 0: let the OS pick a free port
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);
    auto *sa = reinterpret_cast<sockaddr *>(&addr);
    if (bind(server.fd(), sa, sizeof addr) < 0 || listen(server.fd(), 1) < 0) {
        throw std::runtime_error("bind/listen failed");
    }
    socklen_t len = sizeof addr;
    getsockname(server.fd(), sa, &len); // fills in the chosen port
    std::cout << "server listening on " << inet_ntoa(addr.sin_addr) << "\\n";

    // The OS queues the connection until the server accepts it.
    Socket client(socket(AF_INET, SOCK_STREAM, 0));
    if (connect(client.fd(), sa, sizeof addr) < 0) throw std::runtime_error("connect failed");
    client.send("ping");
    std::cout << "client sent: ping\\n";

    Socket conn(accept(server.fd(), nullptr, nullptr));
    std::cout << "server got: " << conn.recv() << "\\n";
    conn.send("pong");

    std::cout << "client got: " << client.recv() << "\\n";
}
`,
      go: `package main

import (
	"fmt"
	"net"
)

func check(err error) {
	if err != nil {
		panic(err)
	}
}

func main() {
	// Port 0: let the OS pick a free port.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	check(err)
	defer ln.Close()
	addr := ln.Addr().(*net.TCPAddr) // the address, including the chosen port
	fmt.Println("server listening on", addr.IP)

	// The OS queues the connection until the server accepts it.
	client, err := net.Dial("tcp", addr.String())
	check(err)
	defer client.Close()
	_, err = client.Write([]byte("ping"))
	check(err)
	fmt.Println("client sent: ping")

	conn, err := ln.Accept() // a new connection for this client
	check(err)
	defer conn.Close()
	buf := make([]byte, 64)
	n, err := conn.Read(buf)
	check(err)
	fmt.Println("server got:", string(buf[:n]))
	_, err = conn.Write([]byte("pong"))
	check(err)

	n, err = client.Read(buf)
	check(err)
	fmt.Println("client got:", string(buf[:n]))
	// A real server would loop on Accept and handle each conn in a goroutine.
}
`,
      rust: `use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};

fn main() -> io::Result<()> {
    // Port 0: let the OS pick a free port.
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let addr = listener.local_addr()?; // includes the chosen port
    println!("server listening on {}", addr.ip());

    // The OS queues the connection until the server accepts it.
    let mut client = TcpStream::connect(addr)?;
    client.write_all(b"ping")?;
    println!("client sent: ping");

    let (mut conn, _peer) = listener.accept()?; // a new stream for this client
    let mut buf = [0u8; 64];
    let n = conn.read(&mut buf)?;
    println!("server got: {}", String::from_utf8_lossy(&buf[..n]));
    conn.write_all(b"pong")?;

    let n = client.read(&mut buf)?;
    println!("client got: {}", String::from_utf8_lossy(&buf[..n]));
    // Streams and the listener close when they go out of scope.
    Ok(())
}
`,
      haskell: `{-# LANGUAGE ForeignFunctionInterface #-}
-- Haskell's standard library has no sockets (real code uses the network
-- package). Here we call the C socket functions directly through the FFI.
import Foreign
import Foreign.C
import System.Posix.Types (CSsize (..))

foreign import ccall unsafe "socket" c_socket :: CInt -> CInt -> CInt -> IO CInt
foreign import ccall unsafe "bind" c_bind :: CInt -> Ptr Word8 -> CUInt -> IO CInt
foreign import ccall unsafe "listen" c_listen :: CInt -> CInt -> IO CInt
foreign import ccall unsafe "getsockname" c_getsockname :: CInt -> Ptr Word8 -> Ptr CUInt -> IO CInt
foreign import ccall unsafe "connect" c_connect :: CInt -> Ptr Word8 -> CUInt -> IO CInt
foreign import ccall unsafe "accept" c_accept :: CInt -> Ptr Word8 -> Ptr CUInt -> IO CInt
foreign import ccall unsafe "send" c_send :: CInt -> CString -> CSize -> CInt -> IO CSsize
foreign import ccall unsafe "recv" c_recv :: CInt -> CString -> CSize -> CInt -> IO CSsize
foreign import ccall unsafe "close" c_close :: CInt -> IO CInt

-- Constants from the Linux headers: IPv4 and TCP.
afInet, sockStream :: CInt
afInet = 2
sockStream = 1

-- Throw an IOError (with the C errno message) if a call returns -1.
check :: (Eq a, Num a) => String -> IO a -> IO a
check = throwErrnoIfMinus1

sendStr :: CInt -> String -> IO ()
sendStr fd s = withCStringLen s $ \\(p, n) -> () <$ check "send" (c_send fd p (fromIntegral n) 0)

recvStr :: CInt -> IO String
recvStr fd = allocaBytes 64 $ \\buf -> do
  n <- check "recv" (c_recv fd buf 64 0)
  peekCStringLen (buf, fromIntegral n)

main :: IO ()
main = allocaBytes 16 $ \\addr -> do
  -- struct sockaddr_in is 16 bytes: family (2 bytes, little-endian on x86),
  -- port (2 bytes, big-endian; 0 lets the OS pick), IPv4 address, padding.
  pokeArray addr ([2, 0, 0, 0, 127, 0, 0, 1] ++ replicate 8 0)
  server <- check "socket" (c_socket afInet sockStream 0)
  _ <- check "bind" (c_bind server addr 16)
  _ <- check "listen" (c_listen server 1)
  -- getsockname writes the actual address (with the chosen port) into addr.
  _ <- with 16 $ \\len -> check "getsockname" (c_getsockname server addr len)
  ip <- peekArray 4 (addr \`plusPtr\` 4) :: IO [Word8]
  putStrLn ("server listening on " ++ concatMap (\\(i, b) -> (if i > 0 then "." else "") ++ show b) (zip [0 :: Int ..] ip))

  -- The OS queues the connection until the server accepts it.
  client <- check "socket" (c_socket afInet sockStream 0)
  _ <- check "connect" (c_connect client addr 16)
  sendStr client "ping"
  putStrLn "client sent: ping"

  conn <- check "accept" (c_accept server nullPtr nullPtr)
  got <- recvStr conn
  putStrLn ("server got: " ++ got)
  sendStr conn "pong"

  reply <- recvStr client
  putStrLn ("client got: " ++ reply)
  mapM_ c_close [client, conn, server]
`,
      javascript: `// Node's sockets are asynchronous: instead of waiting for each step, you
// register callbacks that run when something happens (a connection, data).
const net = require("net");

const server = net.createServer((conn) => {
  // Runs for each new connection; conn is the server's end of it.
  conn.on("data", (data) => {
    console.log("server got:", data.toString());
    conn.end("pong"); // send, then close our end
  });
});

// Port 0: let the OS pick a free port.
server.listen(0, "127.0.0.1", () => {
  const { address, port } = server.address();
  console.log("server listening on", address);

  const client = net.connect(port, address, () => {
    client.write("ping");
    console.log("client sent: ping");
  });
  client.on("data", (data) => {
    console.log("client got:", data.toString());
    client.end();
    server.close(); // stop listening so the program can exit
  });
});
`,
      typescript: `// Node's sockets are asynchronous: instead of waiting for each step, you
// register callbacks that run when something happens (a connection, data).
import * as net from "net";

const server: net.Server = net.createServer((conn: net.Socket) => {
  // Runs for each new connection; conn is the server's end of it.
  conn.on("data", (data: Buffer) => {
    console.log("server got:", data.toString());
    conn.end("pong"); // send, then close our end
  });
});

// Port 0: let the OS pick a free port.
server.listen(0, "127.0.0.1", () => {
  // address() can also return a string (for Unix sockets) or null.
  const { address, port } = server.address() as net.AddressInfo;
  console.log("server listening on", address);

  const client = net.connect(port, address, () => {
    client.write("ping");
    console.log("client sent: ping");
  });
  client.on("data", (data: Buffer) => {
    console.log("client got:", data.toString());
    client.end();
    server.close(); // stop listening so the program can exit
  });
});
`,
    },
  },
];
