// Global solution languages: which file the editor opens, how Run compiles and
// executes it, and the starter template for a new file.

export const LANGUAGES = [
  { id: "python", label: "Python", ext: "py", indent: "    " },
  { id: "c", label: "C", ext: "c", indent: "    " },
  { id: "cpp", label: "C++", ext: "cpp", indent: "    " },
  { id: "go", label: "Go", ext: "go", indent: "\t" },
  { id: "rust", label: "Rust", ext: "rs", indent: "    " },
  { id: "haskell", label: "Haskell", ext: "hs", indent: "  " },
  { id: "javascript", label: "JavaScript", ext: "js", indent: "  " },
  { id: "typescript", label: "TypeScript", ext: "ts", indent: "  " },
];

export const DEFAULT_LANG = "python";
export const LANG_STORAGE_KEY = "ngoding.lang";

export function languageById(id) {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
}

/** Playground starter files relative to the session workspace. `blank` → none. */
export function playgroundTemplate(id) {
  if (!id || id === "blank") return { files: [], open: null };
  switch (id) {
    case "python":
      return {
        open: "main.py",
        files: [{ path: "main.py", content: 'print("Hello, ngoding!")\n' }],
      };
    case "c":
      return {
        open: "main.c",
        files: [{
          path: "main.c",
          content: `#include <stdio.h>

int main(void) {
    puts("Hello, ngoding!");
    return 0;
}
`,
        }],
      };
    case "cpp":
      return {
        open: "main.cpp",
        files: [{
          path: "main.cpp",
          content: `#include <iostream>

int main() {
    std::cout << "Hello, ngoding!" << std::endl;
}
`,
        }],
      };
    case "go":
      return {
        open: "main.go",
        files: [{
          path: "main.go",
          content: `package main

import "fmt"

func main() {
	fmt.Println("Hello, ngoding!")
}
`,
        }],
      };
    case "rust":
      return {
        open: "src/main.rs",
        files: [
          {
            path: "Cargo.toml",
            content: `[package]
name = "ngoding"
version = "0.1.0"
edition = "2021"
`,
          },
          {
            path: "src/main.rs",
            content: `fn main() {
    println!("Hello, ngoding!");
}
`,
          },
        ],
      };
    case "haskell":
      return {
        open: "Main.hs",
        files: [{
          path: "Main.hs",
          content: `main :: IO ()
main = putStrLn "Hello, ngoding!"
`,
        }],
      };
    case "javascript":
      return {
        open: "main.js",
        files: [{ path: "main.js", content: 'console.log("Hello, ngoding!");\n' }],
      };
    case "typescript":
      return {
        open: "main.ts",
        files: [{
          path: "main.ts",
          content: `const greeting: string = "Hello, ngoding!";
console.log(greeting);
`,
        }],
      };
    default:
      return playgroundTemplate("blank");
  }
}

export function languageFromPath(path) {
  const m = path.toLowerCase().match(/\.([^./]+)$/);
  const ext = m?.[1];
  return LANGUAGES.find((l) => l.ext === ext) ?? languageById(DEFAULT_LANG);
}

// Server sends solutionFile with a .py suffix; swap the extension for the
// selected language.
export function solutionPath(problem, lang) {
  return problem.solutionFile.replace(/\.[^.]+$/, `.${lang.ext}`);
}

const homeRel = (abs) => abs.replace(/^\/home\/user\//, "");

export function runCommand(path, lang) {
  const file = path.replace(/^\/home\/user(?=\/|$)/, "~");
  switch (lang.id) {
    case "python":
      return `python3 ${file}`;
    case "c":
      return `gcc -O2 -o /tmp/ngoding ${file} && /tmp/ngoding`;
    case "cpp":
      return `g++ -O2 -std=c++17 -o /tmp/ngoding ${file} && /tmp/ngoding`;
    case "go":
      return `go run ${file}`;
    case "rust":
      return `rustc -O -o /tmp/ngoding ${file} && /tmp/ngoding`;
    case "haskell":
      return `runghc ${file}`;
    case "javascript":
      return `node ${file}`;
    case "typescript":
      // tsc has no global @types; point it at the copy baked into the image.
      return `tsc --target es2020 --module commonjs --types node --typeRoots /usr/local/lib/node_modules/@types --outDir /tmp/ngoding-ts ${file} && node /tmp/ngoding-ts/${file.replace(/^.*\//, "").replace(/\.ts$/, ".js")}`;
    default:
      return `python3 ${file}`;
  }
}

export function templateFor(problem, lang) {
  const title = problem.title;
  const input = homeRel(problem.inputFile);
  const output = homeRel(problem.outputFile);
  switch (lang.id) {
    case "python":
      return `# ${title}: read the input file, write your answer to the output file.
from pathlib import Path

input_path = Path.home() / "${input}"
output_path = Path.home() / "${output}"

text = input_path.read_text()

answer = ""  # your code here

output_path.write_text(answer)
`;
    case "c":
      return `/* ${title}: read the input file, write your answer to the output file. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    FILE *in = fopen("${problem.inputFile}", "r");
    if (!in) { perror("input"); return 1; }
    fseek(in, 0, SEEK_END);
    long n = ftell(in);
    fseek(in, 0, SEEK_SET);
    char *text = malloc(n + 1);
    fread(text, 1, n, in);
    text[n] = '\\0';
    fclose(in);

    const char *answer = ""; /* your code here */

    FILE *out = fopen("${problem.outputFile}", "w");
    if (!out) { perror("output"); return 1; }
    fputs(answer, out);
    fclose(out);
    free(text);
    return 0;
}
`;
    case "cpp":
      return `// ${title}: read the input file, write your answer to the output file.
#include <fstream>
#include <string>

int main() {
    std::ifstream in("${problem.inputFile}");
    std::string text((std::istreambuf_iterator<char>(in)),
                     std::istreambuf_iterator<char>());

    std::string answer; // your code here

    std::ofstream("${problem.outputFile}") << answer;
}
`;
    case "go":
      return `// ${title}: read the input file, write your answer to the output file.
package main

import (
	"os"
)

func main() {
	data, err := os.ReadFile("${problem.inputFile}")
	if err != nil {
		panic(err)
	}
	_ = data

	answer := "" // your code here

	if err := os.WriteFile("${problem.outputFile}", []byte(answer), 0644); err != nil {
		panic(err)
	}
}
`;
    case "rust":
      return `// ${title}: read the input file, write your answer to the output file.
use std::fs;

fn main() {
    let text = fs::read_to_string("${problem.inputFile}").expect("input");

    let answer = String::new(); // your code here
    let _ = text;

    fs::write("${problem.outputFile}", answer).expect("output");
}
`;
    case "haskell":
      return `-- ${title}: read the input file, write your answer to the output file.
main :: IO ()
main = do
  text <- readFile "${problem.inputFile}"
  let answer = "" -- your code here
      _ = text
  writeFile "${problem.outputFile}" answer
`;
    case "javascript":
      return `// ${title}: read the input file, write your answer to the output file.
const fs = require("fs");

const text = fs.readFileSync("${problem.inputFile}", "utf8");

const answer = ""; // your code here

fs.writeFileSync("${problem.outputFile}", answer);
`;
    case "typescript":
      return `// ${title}: read the input file, write your answer to the output file.
import { readFileSync, writeFileSync } from "fs";

const text: string = readFileSync("${problem.inputFile}", "utf8");

const answer: string = ""; // your code here

writeFileSync("${problem.outputFile}", answer);
`;
    default:
      return templateFor(problem, LANGUAGES[0]);
  }
}
