import { test } from "node:test";
import assert from "node:assert/strict";
import { Player } from "../server/game/player.js";

const mk = (spawn = { x: 0, y: 1, z: 0 }) => new Player({ id: "a", name: "호스트", spawn });

test("damage, death, respawn, lives", () => {
  const p = mk();
  assert.equal(p.hp, 100); assert.equal(p.lives, 3); assert.equal(p.alive, true);
  assert.deepEqual(p.pos, { x: 0, y: 1, z: 0 });
  assert.equal(p.takeDamage(99, 0).died, false);
  assert.equal(p.takeDamage(1, 0).died, true);
  assert.equal(p.lives, 2); assert.equal(p.alive, false); assert.equal(p.respawnAt, 3);
  assert.equal(p.takeDamage(50, 1).died, false); // 죽은 상태에선 피해 무시
  p.special = { kind: "bow", ammo: 5 }; p.melee = "diamond"; p.activeSlot = 2;
  p.respawn({ x: 1, y: 1, z: 1 });
  assert.equal(p.hp, 100); assert.equal(p.melee, "wood"); assert.equal(p.special, null); assert.equal(p.activeSlot, 1);
  assert.equal(p.alive, true); assert.equal(p.respawnAt, null); assert.deepEqual(p.pos, { x: 1, y: 1, z: 1 });
  p.kill(10); assert.equal(p.respawnAt, 13);
  p.kill(11); assert.equal(p.lives, 1); // 이미 죽은 상태에선 다시 죽지 않음
  p.respawn({ x: 0, y: 1, z: 0 }); p.kill(20);
  assert.ok(p.isOut()); assert.equal(p.respawnAt, null);
});

test("recentDamage counts only the last 5 seconds", () => {
  const p = mk();
  p.damageLog.push({ t: 0, amount: 50 }, { t: 4, amount: 20 });
  assert.equal(p.recentDamage(6), 20);
  assert.equal(p.recentDamage(10), 0);
});

test("disconnected or dead player is not active", () => {
  const p = mk();
  assert.equal(p.isActive(0), true);
  p.disconnectedAt = 1; assert.equal(p.isActive(2), false);
  p.disconnectedAt = null; p.kill(5); assert.equal(p.isActive(6), false);
});
