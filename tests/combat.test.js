import { test } from "node:test";
import assert from "node:assert/strict";
import { BOSS, WEAPONS } from "../server/game/constants.js";
import { meleeHit, meleeHitPoint, chargeKnock, stompKnock, isSafeFromFall, Projectiles } from "../server/game/combat.js";
import { len } from "../server/game/vec.js";

const box = { min: { x: -3, y: 0, z: -2.5 }, max: { x: 3, y: 4, z: 2.5 } }; // 누나 at origin

test("melee requires facing and range", () => {
  assert.ok(meleeHit({ pos: { x: 0, y: 1, z: -5 }, yaw: 0, pitch: 0 }, box));        // 2.5m 앞, 정면(+z)
  assert.ok(!meleeHit({ pos: { x: 0, y: 1, z: -5 }, yaw: Math.PI, pitch: 0 }, box)); // 등 돌림
  assert.ok(!meleeHit({ pos: { x: 0, y: 1, z: -6.5 }, yaw: 0, pitch: 0 }, box));     // 4m, 사거리 밖
  assert.ok(meleeHit({ pos: { x: 5, y: 1, z: 0 }, yaw: Math.PI / 2, pitch: 0 }, box)); // +x 쪽에서 -x 를 봄 (규약: dir = (-sin yaw, ·, cos yaw))
  assert.ok(!meleeHit({ pos: { x: 5, y: 1, z: 0 }, yaw: -Math.PI / 2, pitch: 0 }, box)); // 반대쪽을 봄
});

test("knockback magnitudes and fall safety", () => {
  const c = chargeKnock({ x: 1, y: 0, z: 0 });
  assert.equal(len({ ...c, y: 0 }), BOSS.charge.knock); assert.equal(c.y, 1.5);
  const k = stompKnock({ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 4 });
  assert.ok(Math.abs(len({ ...k, y: 0 }) - BOSS.stomp.knock) < 1e-9 && k.x > 0 && k.z > 0 && k.y === 1.5);
  assert.ok(isSafeFromFall({ x: 11, y: 1, z: 0 }, chargeKnock({ x: 1, y: 0, z: 0 })));
  assert.ok(isSafeFromFall({ x: 0, y: 1, z: 0 }, chargeKnock({ x: 0, y: 0, z: 1 })));
  assert.ok(!isSafeFromFall({ x: 21, y: 1, z: 0 }, chargeKnock({ x: 1, y: 0, z: 0 })));
});

test("arrow hits boss within 2s, tnt explodes after 2s", () => {
  const pr = new Projectiles();
  pr.fireArrow({ pos: { x: 0, y: 1.5, z: -20 }, dir: { x: 0, y: 0, z: 1 }, ownerId: "a", now: 0 });
  assert.equal(pr.list.length, 1);
  let ev = [];
  for (let t = 0.05; t <= 1.5; t += 0.05) ev = ev.concat(pr.tick(0.05, t, box, []));
  assert.ok(ev.some((e) => e.type === "hit" && e.amount === WEAPONS.bow.dmg && e.by === "a"));
  assert.equal(pr.list.length, 0);
  pr.throwTnt({ pos: { x: 0, y: 1.5, z: -3 }, dir: { x: 0, y: 0.4, z: 1 }, ownerId: "a", now: 0 });
  ev = [];
  for (let t = 0.05; t <= 2.1; t += 0.05) ev = ev.concat(pr.tick(0.05, t, box, [{ id: "a", pos: { x: 0, y: 1, z: 2 } }, { id: "far", pos: { x: 20, y: 1, z: 20 } }])); // "a" 는 TNT 가 떨어지는 지점(z≈3) 근처로 들어간 상황
  const ex = ev.find((e) => e.type === "explode");
  assert.ok(ex && ex.bossHit && ex.playerHits.some((h) => h.id === "a" && len({ ...h.knock, y: 0 }) > 0));
  assert.ok(!ex.playerHits.some((h) => h.id === "far"));
  assert.ok(ev.filter((e) => e.type === "explode").length === 1);
});

test("arrow that misses expires after its lifetime", () => {
  const pr = new Projectiles();
  pr.fireArrow({ pos: { x: 0, y: 1.5, z: -20 }, dir: { x: 0, y: 0, z: -1 }, ownerId: "a", now: 0 });
  let ev = [];
  for (let t = 0.05; t <= 2.2; t += 0.05) ev = ev.concat(pr.tick(0.05, t, box, []));
  assert.equal(ev.length, 0); assert.equal(pr.list.length, 0);
});

test("melee hits when the look ray enters the boss body even if the closest face point is off-angle", () => {
  // 플레이어가 몸통 옆면에 붙어 서서(최근접점은 옆으로 0.35m) 몸통 중심 쪽을 45° 로 바라봄
  const box = { min: { x: -3.58, y: 1, z: -1.94 }, max: { x: 2.42, y: 5, z: 3.06 } };
  const p = { pos: { x: -3.399, y: 1, z: 3.411 }, yaw: -2.358, pitch: 0 };
  assert.equal(meleeHit(p, box, 3), true);
  // 등 돌리고 있으면 빗나감
  assert.equal(meleeHit({ ...p, yaw: -2.358 + Math.PI }, box, 3), false);
});

test("melee eye height is 1.6m above the feet (matches the camera and the player model's head)", () => {
  // 바닥에 붙은 낮은 상자(y 1~1.3): 눈이 발+0.6(옛값)이면 최근접점이 시야각 8° 라 맞지만, 발+1.6 이면 33° 라 수평 시선으론 빗나간다
  const low = { min: { x: -1, y: 1, z: 2 }, max: { x: 1, y: 1.3, z: 3 } };
  const p = { pos: { x: 0, y: 1, z: 0 }, yaw: 0, pitch: 0 };
  assert.equal(meleeHit(p, low, 3), false, "정면 수평 시선은 2.6m 높이에서 바닥 상자를 못 맞힘");
  assert.equal(meleeHit({ ...p, pitch: -0.6 }, low, 3), true, "내려다보면 맞힘");
});

test("meleeHitPoint returns where the look ray enters the boss body, or null when missing", () => {
  const box = { min: { x: -3, y: 1, z: -2.5 }, max: { x: 3, y: 5, z: 2.5 } };
  const p = { pos: { x: 0, y: 1, z: -5 }, yaw: 0, pitch: 0 }; // 2.5m 앞, 정면(+z)
  const pt = meleeHitPoint(p, box, 3);
  assert.ok(pt && Math.abs(pt.z - (-2.5)) < 1e-6 && Math.abs(pt.x) < 1e-6 && Math.abs(pt.y - 2.6) < 1e-6, JSON.stringify(pt));
  assert.equal(meleeHitPoint({ ...p, yaw: Math.PI }, box, 3), null);
});
