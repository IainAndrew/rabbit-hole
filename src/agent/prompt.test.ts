import assert from "node:assert/strict";
import { test } from "node:test";
import { FEWEST_HOPS, openingMessage, promptHash, SCORING_RULE } from "./prompt.ts";

test("each variant has its own hash, and the original keeps the hash every earlier eval has", () => {
  assert.equal(promptHash(FEWEST_HOPS), "09c5b008298d");
  assert.notEqual(promptHash(SCORING_RULE), promptHash(FEWEST_HOPS));
});

test("the opening message names the start and the target", () => {
  assert.equal(openingMessage("Guinness", "Albert Einstein"), 'You are on "Guinness". The target is "Albert Einstein".');
});
