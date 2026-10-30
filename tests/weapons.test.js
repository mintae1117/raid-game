import { test } from "node:test";
import assert from "node:assert/strict";
import { Player } from "../server/game/player.js";
import { tryPickup, useAmmo, PickupSpawner, rollKind, weaponDef, MELEE_TIER } from "../server/game/weapons.js";
import { WEAPONS } from "../server/game/constants.js";
import { mulberry32 } from "../server/game/rng.js";
import { createMap } from "../server/game/map.js";

const mk = () => new Player({ id: "a", name: "n", spawn: { x: 0, y: 1, z: 0 } });

test("melee only upgrades; special replaces or refills", () => {
  const p = mk();
  assert.equal(MELEE_TIER.diamond, 2);
  assert.equal(tryPickup(p, { kind: "iron" }), true); assert.equal(p.melee, "iron");
  assert.equal(tryPickup(p, { kind: "stone" }), false); assert.equal(p.melee, "iron"); // 돌검은 더 이상 없음
  assert.deepEqual(MELEE_TIER, { wood: 0, iron: 1, diamond: 2 });
  assert.equal(tryPickup(p, { kind: "iron" }), false);
  assert.equal(tryPickup(p, { kind: "bow" }), true); assert.deepEqual(p.special, { kind: "bow", ammo: 30 });
  p.special.ammo = 3; assert.equal(tryPickup(p, { kind: "bow" }), true); assert.equal(p.special.ammo, 30);
  assert.equal(tryPickup(p, { kind: "tnt" }), true); assert.deepEqual(p.special, { kind: "tnt", ammo: 3 });
  assert.equal(weaponDef("tnt").label, "TNT");
});

test("ammo runs out → special slot empties and melee becomes active", () => {
  const p = mk();
  p.special = { kind: "tnt", ammo: 2 }; p.activeSlot = 2;
  assert.equal(useAmmo(p), true); assert.equal(p.special.ammo, 1); assert.equal(p.activeSlot, 2);
  assert.equal(useAmmo(p), true); assert.equal(p.special, null); assert.equal(p.activeSlot, 1);
  assert.equal(useAmmo(p), false);
});

test("spawner respects max 8, 6s interval, free spots, weights", () => {
  const sp = new PickupSpawner({ rng: mulberry32(1), spots: createMap(1).pickupSpots });
  for (let t = 0; t <= 100; t += 6) sp.tick(t);
  assert.equal(sp.pickups.length, 8);
  const ids = new Set(sp.pickups.map((p) => p.id)); assert.equal(ids.size, 8);
  const spotsUsed = new Set(sp.pickups.map((p) => `${p.x},${p.z}`)); assert.equal(spotsUsed.size, 8);
  sp.remove(sp.pickups[0].id); sp.tick(100.5); assert.equal(sp.pickups.length, 7); // 다음 스폰(102초) 전
  sp.tick(102.5); assert.equal(sp.pickups.length, 8);
  const counts = {}; const r = mulberry32(2);
  for (let i = 0; i < 2000; i++) { const k = rollKind(r); counts[k] = (counts[k] || 0) + 1; }
  assert.ok(!counts.stone && counts.gun > 150 && counts.iron > counts.tnt && counts.diamond > counts.tnt && counts.bow > counts.tnt);
  assert.ok(!counts.wood);
});

test("boots are a timed buff: pickup sets bootsUntil, picking again extends, and they spawn", () => {
  const p = new Player({ id: "a", name: "a", spawn: { x: 0, y: 1, z: 0 } });
  assert.equal(p.bootsUntil, 0);
  assert.equal(tryPickup(p, { kind: "boots" }, 10), true);
  assert.equal(p.bootsUntil, 10 + WEAPONS.boots.duration);
  assert.equal(tryPickup(p, { kind: "boots" }, 20), true);
  assert.equal(p.bootsUntil, 20 + WEAPONS.boots.duration);
  assert.equal(p.melee, "wood"); assert.equal(p.special, null);
  const counts = {}; const r = mulberry32(3);
  for (let i = 0; i < 2000; i++) { const k = rollKind(r); counts[k] = (counts[k] || 0) + 1; }
  assert.ok(counts.boots > 100, `boots ${counts.boots}`);
});
