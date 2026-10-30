import { test } from "node:test";
import assert from "node:assert/strict";
import { Boss } from "../server/game/boss.js";
import { Player } from "../server/game/player.js";
import { mulberry32 } from "../server/game/rng.js";
import { BOSS, PLAYER_COUNT_MUL, DIFFICULTY } from "../server/game/constants.js";
const HP = BOSS.baseHp;

const mk = (n = 4, diff = "normal") => new Boss({ difficulty: diff, playerCount: n, rng: mulberry32(1), spawnPos: { x: 15, y: 1, z: 0 } });
const mkP = (id, x, z) => new Player({ id, name: id, spawn: { x, y: 1, z } });
const run = (b, players, from, to, dt = 0.05) => { let ev = []; for (let t = from; t <= to + 1e-9; t += dt) ev = ev.concat(b.tick(dt, t, players)); return ev; };

test("hp scales with difficulty and players", () => {
  assert.equal(mk(4).maxHp, HP * PLAYER_COUNT_MUL[3]);
  assert.equal(mk(1, "hard").maxHp, Math.round(HP * PLAYER_COUNT_MUL[0] * 1.4));
  assert.equal(mk(2, "easy").maxHp, Math.round(HP * PLAYER_COUNT_MUL[1] * 0.7));
});

test("phases change at 60% and 30%, dead at 0", () => {
  const b = mk(1);
  assert.equal(b.phase, 1);
  assert.deepEqual(b.takeDamage(HP * 0.41, "a", 0), { phaseChanged: true });
  assert.equal(b.phase, 2);
  assert.deepEqual(b.takeDamage(HP * 0.3, "a", 0), { phaseChanged: true });
  assert.equal(b.phase, 3);
  b.takeDamage(99999, "a", 0);
  assert.equal(b.state, "dead"); assert.equal(b.hp, 0);
  assert.deepEqual(b.takeDamage(10, "a", 1), { phaseChanged: false });
});

test("aabb matches size around pos", () => {
  const b = mk(1); const box = b.aabb();
  assert.deepEqual(box.min, { x: 12, y: 1, z: -2.5 }); assert.deepEqual(box.max, { x: 18, y: 5, z: 2.5 });
});

test("charge telegraphs then damages and knocks a player in path", () => {
  const b = mk(1); const p = mkP("a", 9, 0);
  b.state = "charge_tele"; b.telegraph = { kind: "charge", until: 1.2 }; b.chargeDir = { x: -1, y: 0, z: 0 }; b.chargeLeft = BOSS.charge.dist;
  const ev = run(b, [p], 0.05, 3);
  const hit = ev.find((e) => e.type === "bossHit");
  assert.ok(hit && hit.id === "a" && hit.amount === 25 && hit.knock.x < 0);
  assert.equal(ev.filter((e) => e.type === "bossHit" && e.kind === "charge").length, 1); // 한 번의 돌진에 한 번만(돌진 뒤 물기는 별도)
  assert.ok(b.pos.x < 15 - 7.5); // 8m 가까이 이동
});

test("stomp skips airborne players and ignores disconnected", () => {
  const b = mk(1);
  const air = mkP("a", 17, 0); air.pos.y = 2.5;
  const gone = mkP("b", 17, 1); gone.disconnectedAt = 0;
  const ground = mkP("c", 17, -1);
  b.state = "stomp_tele"; b.telegraph = { kind: "stomp", until: 1 };
  const ev = run(b, [air, gone, ground], 0.05, 1.5);
  const hits = ev.filter((e) => e.type === "bossHit");
  assert.equal(hits.length, 1); assert.equal(hits[0].id, "c"); assert.equal(hits[0].amount, 30); assert.ok(hits[0].knock.x > 0);
});

test("aggro never targets inactive players and chases the active one", () => {
  const b = mk(1);
  const gone = mkP("b", 12, 0); gone.disconnectedAt = 0;
  const p = mkP("a", -20, 0);
  run(b, [gone, p], 0.05, 4);
  assert.equal(b.targetId, "a");
  assert.ok(b.pos.x < 15); // a 쪽(-x)으로 이동
});

test("difficulty scales damage and cooldowns", () => {
  const easy = mk(1, "easy"), hard = mk(1, "hard");
  assert.equal(easy.scaledDamage(25), Math.round(25 * 0.7)); assert.equal(hard.scaledDamage(25), Math.round(25 * 1.3));
  const c1 = BOSS.phases[0].cool; assert.ok(Math.abs(easy.phaseCooldown() - c1 * 1.3) < 1e-9); assert.ok(Math.abs(hard.phaseCooldown() - c1 * 0.8) < 1e-9);
  const h3 = mk(1, "hard"); h3.takeDamage(HP * 1.4 * 0.71, "a", 0); assert.equal(h3.chargeRepeat(), DIFFICULTY.hard.chargeRepeat3);
});

test("bite damages a close player on cooldown, telegraph events emitted", () => {
  const b = mk(1); const p = mkP("a", 11.5, 0); // 몸체 표면(x=12)에서 0.5m
  const ev = run(b, [p], 0.05, 2);
  const bites = ev.filter((e) => e.type === "bossHit" && e.kind === "bite");
  assert.ok(bites.length >= 1 && bites.length <= 2 && bites[0].knock === null);
  assert.ok(ev.some((e) => e.type === "telegraph") || ev.some((e) => e.type === "bossHit"));
});

test("charge corridor is the boss body width along the charge axis: 4m lateral is safe, 2m lateral is hit", () => {
  const b = mk(1); b.pos = { x: 15, y: 1, z: 0 };
  b.state = "charge_tele"; b.telegraph = { kind: "charge", until: 1.2 }; b.chargeDir = { x: -1, y: 0, z: 0 }; b.chargeLeft = BOSS.charge.dist; b.chargesQueued = 1;
  const side = mkP("side", 10, 4), near = mkP("near", 10, 2);
  const ev = run(b, [side, near], 1.2, 2.0);
  const hits = ev.filter((e) => e.type === "bossHit" && e.kind === "charge").map((e) => e.id);
  assert.deepEqual(hits, ["near"]);
});

test("no bite during the recovery right after a charge ends", () => {
  const b = mk(1); b.pos = { x: 15, y: 1, z: 0 };
  b.state = "charge_tele"; b.telegraph = { kind: "charge", until: 1.2 }; b.chargeDir = { x: -1, y: 0, z: 0 }; b.chargeLeft = BOSS.charge.dist; b.chargesQueued = 1;
  const p = mkP("a", 5, 4.5); // 복도 밖(측면 4.5m), 돌진이 끝나면 물기 범위 안
  const chargeEnd = 1.2 + BOSS.charge.dist / BOSS.charge.speed;
  const quietUntil = chargeEnd + BOSS.bite.recover + BOSS.bite.telegraph - 0.1; // 회복 + 예고 전까진 물릴 수 없음
  const ev = run(b, [p], 1.2, quietUntil);
  const bites = ev.filter((e) => e.type === "bossHit" && e.kind === "bite");
  assert.notEqual(b.state, "charging");
  assert.equal(bites.length, 0, "회복 동안은 안 문다");
  const later = run(b, [p], quietUntil + 0.05, quietUntil + 1.0);
  assert.ok(later.some((e) => e.type === "bossHit" && e.kind === "bite"), "회복이 끝나면 문다");
});

test("bite is telegraphed (bite_tele) and misses a player who is airborne when it lands", () => {
  const b = mk(1); b.pos = { x: 0, y: 1, z: 0 }; b.nextAbilityAt = 999;
  const p = mkP("a", 0, 4.3); // 표면 1.8m — 물기 범위 안
  const ev = run(b, [p], 0, 0.3);
  assert.equal(b.state, "bite_tele");
  assert.ok(ev.some((e) => e.type === "telegraph" && e.kind === "bite" && Math.abs(e.until - BOSS.bite.telegraph) < 1e-6));
  p.pos.y = 2.2; // 점프 중
  const ev2 = run(b, [p], 0.35, 0.7);
  assert.ok(ev2.some((e) => e.type === "bite"), "물기 모션 이벤트");
  assert.ok(!ev2.some((e) => e.type === "bossHit" && e.kind === "bite"), "공중이면 안 물림");
  assert.equal(b.state, "chase");
});

test("bite lands on a grounded player after the telegraph", () => {
  const b = mk(1); b.pos = { x: 0, y: 1, z: 0 }; b.nextAbilityAt = 999;
  const p = mkP("a", 0, 4.3);
  const ev = run(b, [p], 0, 0.8);
  const bites = ev.filter((e) => e.type === "bossHit" && e.kind === "bite");
  assert.equal(bites.length, 1);
  assert.equal(bites[0].amount, BOSS.bite.dmg);
});

test("roar is telegraphed and does not slow an airborne player", () => {
  const b = mk(1); b.pos = { x: 0, y: 1, z: 0 };
  b.state = "roar_tele"; b.telegraph = { kind: "roar", until: 0.5 };
  const ground = mkP("g", 5, 0), air = mkP("a", -5, 0); air.pos.y = 2.2;
  const ev = run(b, [ground, air], 0.5, 0.6);
  const roar = ev.find((e) => e.type === "roar");
  assert.ok(roar);
  assert.deepEqual(roar.slowIds, ["g"]);
});

test("stomp honors the recent-airborne grace (lag compensation)", () => {
  const b = mk(1); b.pos = { x: 0, y: 1, z: 0 };
  b.state = "stomp_tele"; b.telegraph = { kind: "stomp", until: 1 };
  const p = mkP("a", 4, 0); p.lastAirborneAt = 0.8; // 0.2초 전까지 공중에 있었음
  const ev = run(b, [p], 1, 1.1);
  assert.ok(!ev.some((e) => e.type === "bossHit" && e.kind === "stomp"));
  const q = mkP("b", 4, 0); q.lastAirborneAt = 0.4;
  const b2 = mk(1); b2.pos = { x: 0, y: 1, z: 0 }; b2.state = "stomp_tele"; b2.telegraph = { kind: "stomp", until: 1 };
  const ev2 = run(b2, [q], 1, 1.1);
  assert.ok(ev2.some((e) => e.type === "bossHit" && e.kind === "stomp"));
});

test("boss cannot walk through decorations: it is pushed out and the player behind a tree stays unreached", () => {
  const map = { decorations: [{ x: 8, z: 0, w: 2, h: 3, d: 2, kind: "tree" }] };
  const b = mk(1); b.pos = { x: 0, y: 1, z: 0 }; b.map = map; b.nextAbilityAt = 999;
  const p = mkP("a", 12.5, 0); // 나무 바로 뒤
  run(b, [p], 0, 3);
  // 누나 몸(반폭 3)과 나무(반폭 1)가 겹치지 않아야 함: 중심 간 x 거리 ≥ 4 또는 z 거리 ≥ 3.5
  const dx = Math.abs(b.pos.x - 8), dz = Math.abs(b.pos.z - 0);
  assert.ok(dx >= 4 - 1e-6 || dz >= 3.5 - 1e-6, `누나가 나무를 통과함: ${JSON.stringify(b.pos)}`);
});

test("charging into a decoration stops the charge, stuns the boss, and the player behind is not hit", () => {
  const map = { decorations: [{ x: 8, z: 0, w: 2, h: 3, d: 2, kind: "rock" }] };
  const b = mk(1); b.pos = { x: 0, y: 1, z: 0 }; b.map = map;
  b.state = "charge_tele"; b.telegraph = { kind: "charge", until: 0.5 }; b.chargeDir = { x: 1, y: 0, z: 0 }; b.chargeLeft = BOSS.charge.dist; b.chargesQueued = 3;
  const p = mkP("a", 13, 0);
  const ev = run(b, [p], 0.5, 1.2);
  assert.ok(ev.some((e) => e.type === "stun"), "부딪힘 이벤트");
  assert.equal(b.state, "stunned");
  assert.ok(!ev.some((e) => e.type === "bossHit"), "나무 뒤 플레이어는 안 맞음");
  assert.ok(b.pos.x <= 4 + 1e-6, `바위 앞에서 멈춤: x=${b.pos.x}`);
  run(b, [p], 1.25, 1.2 + BOSS.charge.stun + 0.1);
  assert.equal(b.state, "chase");
  assert.equal(b.chargesQueued, 0, "연속 돌진도 취소");
});
