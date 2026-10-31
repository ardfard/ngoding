// Global solution languages: which file the editor opens, how Run compiles and
// executes it, and the starter template for a new file.

export const LANGUAGES = [
  { id: "python", label: "Python", ext: "py", indent: "    " },
  { id: "c", label: "C", ext: "c", indent: "    " },
  { id: "cpp", label: "C++", ext: "cpp", indent: "    " },
  { id: "go", label: "Go", ext: "go", indent: "\t" },
  { id: "rust", label: "Rust", ext: "rs", indent: "    " },
  { id: "haskell", label: "Haskell", ext: "hs", indent: "  " },
];

export const DEFAULT_LANG = "python";
export const LANG_STORAGE_KEY = "ngoding.lang";

export function languageById(id) {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
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
    default:
      return templateFor(problem, LANGUAGES[0]);
  }
}
