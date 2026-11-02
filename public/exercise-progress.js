export function unionSolved(a, b) {
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

export function exerciseStats(problems, solvedIds) {
  const solved = new Set(solvedIds);
  let done = 0;
  for (const p of problems) {
    if (solved.has(p.id)) done++;
  }
  const total = problems.length;
  return { done, notYet: total - done, total };
}

export function pickExerciseProblem(problems, solvedIds) {
  if (!problems.length) return null;
  const solved = new Set(solvedIds);
  return problems.find((p) => !solved.has(p.id)) ?? problems[0];
}
