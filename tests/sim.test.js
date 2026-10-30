import { test } from "node:test";
import assert from "node:assert/strict";
import { runSim, summarize } from "../server/sim/bots.js";

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

test("4 bots on normal clear in 50~130s on average with ≤20% losses (humans land ~half the hits → 2~4min)", () => {
  const s = summarize(SEEDS.map((seed) => runSim({ players: 4, difficulty: "normal", seed })));
  console.log("4p normal:", JSON.stringify(s));
  assert.ok(s.avgDuration >= 50 && s.avgDuration <= 130, `avg ${s.avgDuration}`);
  assert.ok(s.lossRate <= 0.2, `loss ${s.lossRate}`);
});

test("1 bot on normal takes 50~130s on average", () => {
  const s = summarize(SEEDS.map((seed) => runSim({ players: 1, difficulty: "normal", seed })));
  console.log("1p normal:", JSON.stringify(s));
  assert.ok(s.avgDuration >= 50 && s.avgDuration <= 130, `avg ${s.avgDuration}`);
});

test("1 bot on easy is the intended solo path: ≤30% losses", () => {
  const s = summarize(SEEDS.map((seed) => runSim({ players: 1, difficulty: "easy", seed })));
  console.log("1p easy:", JSON.stringify(s));
  assert.ok(s.lossRate <= 0.3, `loss ${s.lossRate}`);
  assert.ok(s.avgDuration >= 25 && s.avgDuration <= 130, `avg ${s.avgDuration}`);
});
