import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exerciseStats, pickExerciseProblem } from "../public/exercise-progress.js";

const probs = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("exerciseStats", () => {
  it("counts done and not yet", () => {
    assert.deepEqual(exerciseStats(probs, ["a"]), { done: 1, notYet: 2, total: 3 });
  });
  it("ignores unknown solved ids", () => {
    assert.deepEqual(exerciseStats(probs, ["a", "zzz"]), { done: 1, notYet: 2, total: 3 });
  });
});

describe("pickExerciseProblem", () => {
  it("picks first unsolved", () => {
    assert.equal(pickExerciseProblem(probs, ["a"]).id, "b");
  });
  it("falls back to first when all solved", () => {
    assert.equal(pickExerciseProblem(probs, ["a", "b", "c"]).id, "a");
  });
  it("returns null when empty", () => {
    assert.equal(pickExerciseProblem([], []), null);
  });
});
