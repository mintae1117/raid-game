import { test } from "node:test";
import assert from "node:assert/strict";
import { WEAPONS } from "../server/game/constants.js";
import { Game } from "../server/game/game.js";
import { Player } from "../server/game/player.js";

const mkGame = (ids = ["a", "b"], difficulty = "normal") =>
  new Game({ players: ids.map((id) => new Player({ id, name: id, spawn: { x: 0, y: 1, z: 0 } })), difficulty, seed: 1 });
const run = (g, from, to, dt = 0.05) => { for (let t = from; t <= to + 1e-9; t += dt) g.tick(dt, t); };

test("fall costs a life and respawns after 3s at a spawn point", () => {
  const g = mkGame(); const a = g.players.find((p) => p.id === "a");
  g.fell("a", 10);
  assert.equal(a.lives, 2); assert.ok(!a.alive);
  assert.ok(g.drainEvents().some((e) => e.type === "death" && e.id === "a" && e.cause === "fall" && e.lives === 2));
  run(g, 10.05, 13.1);
  assert.ok(a.alive); assert.equal(a.hp, 100);
  assert.ok(g.map.spawnPoints.some((s) => s.x === a.pos.x && s.z === a.pos.z));
  assert.ok(g.drainEvents().some((e) => e.type === "respawn" && e.id === "a"));
});

test("lose when all remaining players are out; dropped players ignored", () => {
  const g = mkGame(["a", "b", "c"]);
  g.drop("c");
  for (const id of ["a", "b"]) { g.fell(id, 0); run(g, 0.05, 3.1); g.fell(id, 4); run(g, 4.05, 7.1); g.fell(id, 8); }
  g.tick(0.05, 9);
  assert.equal(g.status, "lost");
  const lose = g.drainEvents().find((e) => e.type === "lose");
  assert.ok(lose && lose.stats.bossHpLeft === g.boss.hp && lose.stats.durationSec >= 0);
});

test("win when boss dies; stats sum to 100% and name the MVP", () => {
  const g = mkGame();
  g.boss.takeDamage(g.boss.maxHp - 1, "a", 0); g.recordDamage("a", g.boss.maxHp - 1, 0);
  g.boss.takeDamage(1, "b", 0); g.recordDamage("b", 1, 0);
  g.tick(0.05, 1);
  assert.equal(g.status, "won");
  const win = g.drainEvents().find((e) => e.type === "win");
  const pct = Object.values(win.stats.contributions).reduce((s, c) => s + c.pct, 0);
  assert.ok(Math.abs(pct - 100) < 0.01); assert.equal(win.stats.mvpId, "a");
  assert.equal(win.stats.contributions.a.name, "a");
});

test("melee attack damages boss with cooldown and records contribution", () => {
  const g = mkGame(); const a = g.players[0];
  a.pos = { x: g.boss.pos.x - 5, y: 1, z: g.boss.pos.z }; a.yaw = -Math.PI / 2; // 누나(+x) 쪽을 봄
  const hp = g.boss.hp;
  g.attack("a", 0); g.attack("a", 0.2); g.attack("a", 0.6);
  assert.equal(hp - g.boss.hp, WEAPONS.wood.dmg * 2);
  assert.equal(a.totalDamage, WEAPONS.wood.dmg * 2);
  assert.ok(g.drainEvents().filter((e) => e.type === "hit" && e.by === "a").length === 2);
});

test("bow consumes ammo and spawns an arrow; tnt throws", () => {
  const g = mkGame(); const a = g.players[0];
  a.special = { kind: "bow", ammo: 2 }; a.activeSlot = 2;
  g.attack("a", 0); assert.equal(a.special.ammo, 1); assert.equal(g.projectiles.list.length, 1);
  g.attack("a", 0.1); assert.equal(a.special.ammo, 1); // 쿨 0.8
  g.attack("a", 1); assert.equal(a.special, null); assert.equal(a.activeSlot, 1);
  g.setSlot("a", 2); assert.equal(a.activeSlot, 1); // 특수 없음
  a.special = { kind: "tnt", ammo: 3 }; g.setSlot("a", 2); assert.equal(a.activeSlot, 2);
  g.attack("a", 3); assert.ok(g.projectiles.list.some((p) => p.kind === "tnt"));
});

test("boss knock is forwarded as knock event and damage applied", () => {
  const g = mkGame(["a"]); const a = g.players[0];
  g.boss.state = "stomp_tele"; g.boss.telegraph = { kind: "stomp", until: 1 };
  a.pos = { x: g.boss.pos.x + 4, y: 1, z: g.boss.pos.z };
  run(g, 0.05, 1.5);
  const ev = g.drainEvents();
  assert.ok(ev.some((e) => e.type === "knock" && e.id === "a" && e.impulse.x > 0));
  assert.equal(a.hp, 70);
});

test("pickup within 1.5m is applied and removed", () => {
  const g = mkGame(["a"]); const a = g.players[0];
  g.spawner.pickups.push({ id: 99, kind: "iron", x: 10, z: 10 });
  a.pos = { x: 10.5, y: 1, z: 10 };
  g.tick(0.05, 0.05);
  assert.equal(a.melee, "iron"); assert.ok(!g.spawner.pickups.some((p) => p.id === 99));
  assert.ok(g.drainEvents().some((e) => e.type === "pickup" && e.id === "a" && e.kind === "iron"));
});

test("input is rejected when it moves faster than allowed", () => {
  const g = mkGame(["a"]); const a = g.players[0];
  a.pos = { x: 0, y: 1, z: 0 };
  g.applyInput("a", { pos: { x: 0.2, y: 1, z: 0 }, yaw: 1, pitch: 0 }, 0.05);
  assert.equal(a.pos.x, 0.2); assert.equal(a.yaw, 1);
  g.applyInput("a", { pos: { x: 15, y: 1, z: 0 }, yaw: 1, pitch: 0 }, 0.1);
  assert.equal(a.pos.x, 0.2);
});

test("disconnect/reconnect/drop and snapshot shape", () => {
  const g = mkGame(["a", "b"]);
  g.disconnect("a", 5); assert.equal(g.players[0].disconnectedAt, 5);
  let snap = g.snapshot(); assert.equal(snap.players.find((p) => p.id === "a").connected, false);
  g.reconnect("a"); assert.equal(g.players[0].disconnectedAt, null);
  g.drop("b"); assert.equal(g.players.length, 1);
  snap = g.snapshot();
  assert.ok(snap.boss.maxHp > 0 && typeof snap.t === "number" && Array.isArray(snap.pickups) && Array.isArray(snap.projectiles) && snap.status === "playing");
  assert.ok("melee" in snap.players[0] && "activeSlot" in snap.players[0] && "lives" in snap.players[0]);
});

test("dead disconnected player does not respawn until reconnected", () => {
  const g = mkGame(["a"]); const a = g.players[0];
  g.fell("a", 0);
  g.disconnect("a", 0);
  g.tick(0.05, 5);
  assert.equal(a.alive, false);
  g.reconnect("a");
  g.tick(0.05, 5.05);
  assert.equal(a.alive, true);
});

test("sustained fast inputs are capped near the walking speed (budget), not per-message", () => {
  const g = mkGame(["a"]); const a = g.players[0]; a.pos = { x: 0, y: 1, z: 0 };
  let t = 0;
  for (let i = 0; i < 20; i++) {
    t += 0.05; g.tick(0.05, t);
    g.applyInput("a", { pos: { x: a.pos.x + 0.99, y: 1, z: 0 }, yaw: 0, pitch: 0 }, 0.05);
  }
  assert.ok(a.pos.x < 9, `1초 동안 ${a.pos.x.toFixed(2)}m 이동 (허용 ≈ 5m + 순간 여유)`);
  assert.ok(a.pos.x > 3, "정상 범위의 이동은 받아들임");
});

test("input above airborne height records lastAirborneAt for stomp lag compensation", () => {
  const g = mkGame(["a"]); const a = g.players[0]; a.pos = { x: 0, y: 1, z: 0 };
  g.tick(0.05, 1);
  g.applyInput("a", { pos: { x: 0, y: 2.0, z: 0 }, yaw: 0, pitch: 0 }, 0.05);
  assert.equal(a.lastAirborneAt, 1);
  g.tick(0.05, 1.05);
  g.applyInput("a", { pos: { x: 0, y: 1, z: 0 }, yaw: 0, pitch: 0 }, 0.05);
  assert.equal(a.lastAirborneAt, 1);
  assert.equal(a.isAirborne(1.25), true);
  assert.equal(a.isAirborne(1.4), false);
});

test("hit events carry the impact position so clients can show damage numbers there", () => {
  const g = mkGame(); const a = g.players[0];
  a.pos = { x: g.boss.pos.x - 5, y: 1, z: g.boss.pos.z }; a.yaw = -Math.PI / 2;
  g.attack("a", 0);
  const hit = g.drainEvents().find((e) => e.type === "hit");
  assert.ok(hit && hit.pos && Number.isFinite(hit.pos.x) && Number.isFinite(hit.pos.y) && Number.isFinite(hit.pos.z));
  assert.ok(Math.abs(hit.pos.x - (g.boss.pos.x - 3)) < 1e-6, "누나 몸통(−x 면) 위의 점");
});

test("boots raise the server-side movement allowance (sprint) while active, and show in the snapshot", () => {
  const g = mkGame(["a"]); const a = g.players[0]; a.pos = { x: 0, y: 1, z: 0 };
  let t = 0;
  // 부츠 없이 0.4m/50ms(8m/s) → 예산에 막혀 1초에 약 5m + 순간 여유
  for (let i = 0; i < 20; i++) { t += 0.05; g.tick(0.05, t); g.applyInput("a", { pos: { x: a.pos.x + 0.4, y: 1, z: 0 }, yaw: 0, pitch: 0 }, 0.05); }
  const slow = a.pos.x;
  assert.ok(slow < 8.1, `부츠 없이 ${slow.toFixed(2)}m`);
  a.pos = { x: 0, y: 1, z: 0 }; a.bootsUntil = t + 60;
  for (let i = 0; i < 20; i++) { t += 0.05; g.tick(0.05, t); g.applyInput("a", { pos: { x: a.pos.x + 0.4, y: 1, z: 0 }, yaw: 0, pitch: 0 }, 0.05); }
  assert.ok(a.pos.x > 7.9, `부츠 있으면 8m/s 가 그대로 통과해야 함: ${a.pos.x.toFixed(2)}m`);
  const me = g.snapshot().players[0];
  assert.equal(me.bootsUntil, a.bootsUntil);
});

test("machine gun is hitscan: damages the boss along the look ray, uses ammo, emits a tracer", () => {
  const g = mkGame(); const a = g.players[0];
  a.pos = { x: g.boss.pos.x - 15, y: 1, z: g.boss.pos.z }; a.yaw = -Math.PI / 2; a.pitch = 0;
  a.special = { kind: "gun", ammo: 80 }; a.activeSlot = 2;
  const hp = g.boss.hp;
  g.attack("a", 0); g.attack("a", 0.05); g.attack("a", 0.1); // 0.09 쿨: 2발만
  assert.equal(hp - g.boss.hp, WEAPONS.gun.dmg * 2);
  assert.equal(a.special.ammo, 78);
  const ev = g.drainEvents();
  const shots = ev.filter((e) => e.type === "shoot" && e.kind === "gun");
  assert.equal(shots.length, 2);
  assert.ok(shots[0].from && shots[0].to && Math.abs(shots[0].to.x - (g.boss.pos.x - 3)) < 0.6, JSON.stringify(shots[0]));
  const hits = ev.filter((e) => e.type === "hit" && e.kind === "gun");
  assert.equal(hits.length, 2);
  // 등 돌리면 빗나가지만 탄약은 줄고 궤적은 사거리 끝까지
  a.yaw = Math.PI / 2; g.attack("a", 1);
  assert.equal(a.special.ammo, 77);
  const miss = g.drainEvents().find((e) => e.type === "shoot");
  assert.ok(Math.abs(miss.to.x - (a.pos.x - WEAPONS.gun.range)) < 1.5);
});

test("a player inside the boss body is pushed out to the nearest face on tick", () => {
  const g = mkGame(["a"]); const a = g.players[0];
  a.pos = { x: g.boss.pos.x + 1, y: 1, z: g.boss.pos.z + 0.5 }; // 몸 안
  g.boss.nextAbilityAt = 999;
  g.tick(0.05, 0.05);
  const box = g.boss.aabb();
  const inside = a.pos.x > box.min.x && a.pos.x < box.max.x && a.pos.z > box.min.z && a.pos.z < box.max.z;
  assert.equal(inside, false, `밀려나야 함: ${JSON.stringify(a.pos)} box ${JSON.stringify(box)}`);
});
