// Learn's Check: run the lesson file in the student's shell (so they see the
// output as usual), capture its stdout, and compare it with the lesson's
// expected output. The browser only learns that the run finished by polling for
// a status file the script writes last.

import { runCommand } from "./languages.js";

// A direct child of ~: the agent creates missing directories as root and only
// chowns the file's own directory, so a deeper path (~/.cache/...) would leave
// ~/.cache owned by root and break tools that cache there (go build, pip).
export const CHECK_DIR = "/home/user/.ngoding-check";
export const CHECK_SCRIPT = `${CHECK_DIR}/check.sh`;
export const CHECK_OUT = `${CHECK_DIR}/check.out`;
export const CHECK_STATUS = `${CHECK_DIR}/check.status`;

const home = (path) => path.replace(/^\/home\/user(?=\/|$)/, "~");

/**
 * Bash script that runs `path`, tees stdout to CHECK_OUT, then writes
 * "<nonce> <exit status>". The nonce (the script's $1) ties the status to one
 * Check: after a reload, a restored shell may still finish an earlier run.
 */
export function checkScript(path, lang) {
  const out = home(CHECK_OUT);
  const st = home(CHECK_STATUS);
  return `#!/bin/bash
# Written by ngoding's Learn page: runs a lesson and saves its output for Check.
rm -f ${st} ${out}
trap 'echo "$1 130" > ${st}; exit 130' INT
{ ${runCommand(path, lang)}; } | tee ${out}
echo "$1 \${PIPESTATUS[0]}" > ${st}
`;
}

/** What to type in the shell to start a check. */
export const checkCommand = (nonce) => `bash ${home(CHECK_SCRIPT)} ${nonce}`;

/** The exit status from CHECK_STATUS's text if it belongs to this check, else null. */
export function parseStatus(text, nonce) {
  const m = /^(\S+) (\d+)\s*$/.exec(text ?? "");
  return m && m[1] === nonce ? Number(m[2]) : null;
}

const show = (line) => (line === undefined ? "(nothing)" : JSON.stringify(line));

/** Compare a finished run with the expected output: { ok, message }. */
export function compareOutput(expected, got, status) {
  if (status === 130) return { ok: false, message: "Interrupted." };
  if (status !== 0) return { ok: false, message: `Your program exited with status ${status}; see the shell.` };
  if (got === expected) return { ok: true, message: "Output matches. Lesson complete!" };
  const want = expected.replace(/\n$/, "").split("\n");
  const have = got.replace(/\n$/, "").split("\n");
  for (let i = 0; i < Math.max(want.length, have.length); i++) {
    if (want[i] === have[i]) continue;
    if (want[i] !== undefined && have[i] !== undefined && want[i].trimEnd() === have[i].trimEnd()) {
      return { ok: false, message: `Line ${i + 1} has different trailing spaces.` };
    }
    return { ok: false, message: `Line ${i + 1}: expected ${show(want[i])}, got ${show(have[i])}.` };
  }
  return { ok: false, message: "The output should end with exactly one newline." };
}
