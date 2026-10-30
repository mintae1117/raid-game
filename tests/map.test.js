import { test } from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../server/game/rng.js";
import { createMap } from "../server/game/map.js";
import { add, sub, scale, len, norm, dist, distXZ } from "../server/game/vec.js";
import { MAP, PLAYER, BOSS, WEAPONS, PICKUP, DIFFICULTY, PLAYER_COUNT_MUL, TICK } from "../server/game/constants.js";

test("island bounds and spawn geometry", () => {
  const m = createMap(1);
  assert.ok(m.isOnIsland(0, 0) && m.isOnIsland(23.9, -23.9));
  assert.ok(!m.isOnIsland(24.1, 0) && !m.isOnIsland(0, -24.1));
  assert.equal(m.spawnPoints.length, 4);
  for (const p of m.spawnPoints) assert.ok(Math.hypot(p.x, p.z) <= 6 && p.y === 1);
  assert.ok(m.decorations.length >= 8 && m.decorations.length <= 12);
  for (const d of m.decorations) assert.ok(Math.hypot(d.x, d.z) >= 14 && Math.hypot(d.x, d.z) <= 21);
  assert.ok(m.pickupSpots.length >= 20);
  for (const s of m.pickupSpots) {
    assert.ok(Math.hypot(s.x, s.z) >= 8);
    assert.ok(Math.abs(s.x) <= 21 && Math.abs(s.z) <= 21);
    assert.ok(!m.isBlocked(s.x, s.z));
  }
  assert.ok(m.isBlocked(m.decorations[0].x, m.decorations[0].z));
  assert.deepEqual(createMap(7).decorations, createMap(7).decorations);
});

test("mulberry32 is deterministic in [0,1)", () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 5; i++) { const v = a(); assert.equal(v, b()); assert.ok(v >= 0 && v < 1); }
});

test("vec helpers", () => {
  assert.deepEqual(add({x:1,y:2,z:3},{x:1,y:1,z:1}), {x:2,y:3,z:4});
  assert.deepEqual(sub({x:1,y:2,z:3},{x:1,y:1,z:1}), {x:0,y:1,z:2});
  assert.deepEqual(scale({x:1,y:2,z:3}, 2), {x:2,y:4,z:6});
  assert.equal(len({x:3,y:4,z:0}), 5);
  assert.deepEqual(norm({x:0,y:0,z:2}), {x:0,y:0,z:1});
  assert.deepEqual(norm({x:0,y:0,z:0}), {x:0,y:0,z:0});
  assert.equal(dist({x:0,y:0,z:0},{x:0,y:3,z:4}), 5);
  assert.equal(distXZ({x:0,y:9,z:0},{x:3,y:0,z:4}), 5);
});

test("constants carry the tuned values", () => {
  assert.equal(MAP.size, 48); assert.equal(MAP.half, 24); assert.equal(MAP.groundY, 1); assert.equal(MAP.fallY, -10);
  assert.equal(PLAYER.hp, 100); assert.equal(PLAYER.lives, 3); assert.equal(PLAYER.speed, 5); assert.equal(PLAYER.respawnDelay, 3); assert.equal(PLAYER.reconnectGrace, 60);
  assert.equal(PLAYER.eyeHeight, 1.6); assert.equal(PLAYER.airborneY, 1.4); assert.equal(PLAYER.airborneGrace, 0.3);
  // 2026-10-30 플레이 피드백: 예고 짧게·돌진 세게·더 멀리 밀림·우리 피해 2배 이상
  assert.equal(BOSS.charge.telegraph, 0.7); assert.equal(BOSS.charge.speed, 18); assert.equal(BOSS.charge.dist, 10); assert.equal(BOSS.charge.knock, 9);
  assert.equal(BOSS.stomp.telegraph, 0.7); assert.equal(BOSS.stomp.radius, 7); assert.equal(BOSS.stomp.knock, 7);
  assert.equal(BOSS.bite.telegraph, 0.4); assert.equal(BOSS.roar.telegraph, 0.5);
  assert.deepEqual(BOSS.phases.map((p) => p.chargeRepeat), [1, 2, 3]); assert.equal(DIFFICULTY.hard.chargeRepeat3, 4);
  assert.deepEqual(PLAYER_COUNT_MUL, [0.75, 1.5, 2.2, 2.8]);
  assert.equal(DIFFICULTY.hard.hp, 1.4); assert.equal(DIFFICULTY.easy.cool, 1.3);
  // 2차 피드백: 피해 또 2배, 좋은 무기 스폰 증가
  // 3차 피드백: 돌검 삭제, 기관총 추가, 누나 더 빠르고 자주 공격
  assert.equal(WEAPONS.stone, undefined); assert.equal(WEAPONS.wood.dmg, 56); assert.equal(WEAPONS.iron.dmg, 112); assert.equal(WEAPONS.diamond.dmg, 160);
  assert.deepEqual(WEAPONS.gun, { kind: "gun", slot: "special", dmg: 22, cool: 0.09, ammo: 80, range: 40, spread: 0.02, label: "기관총" });
  assert.equal(BOSS.speed, 3.5); assert.deepEqual(BOSS.phases.map((p) => p.speedMul), [1, 1.25, 1.5]); assert.deepEqual(BOSS.phases.map((p) => p.cool), [5, 4, 3]);
  assert.equal(BOSS.bite.cool, 1.3); assert.equal(BOSS.bite.telegraph, 0.4); assert.equal(BOSS.charge.telegraph, 0.7); assert.equal(BOSS.charge.stun, 1.2);
  assert.equal(WEAPONS.bow.dmg, 90); assert.equal(WEAPONS.bow.ammo, 30); assert.equal(WEAPONS.tnt.dmgBoss, 260); assert.equal(WEAPONS.tnt.knock, 5);
  assert.equal(PICKUP.max, 8); assert.equal(PICKUP.interval, 6); assert.deepEqual(PICKUP.weights, { iron: 30, bow: 15, gun: 20, diamond: 20, tnt: 10, boots: 15 }); assert.equal(TICK, 0.05);
  assert.deepEqual(WEAPONS.boots, { kind: "boots", slot: "buff", duration: 25, sprintMul: 1.7, label: "신발" });
});
