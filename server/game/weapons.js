// 무기 정의·줍기 규칙·스포너. 규칙: 근접은 상위 등급만 교체, 특수는 같은 종류면 탄약 보충·다른 종류면 교체.
import { WEAPONS, PICKUP } from "./constants.js";

export const MELEE_TIER = { wood: 0, iron: 1, diamond: 2 }; // 돌검은 3차 피드백으로 삭제

export const weaponDef = (kind) => WEAPONS[kind];

export function tryPickup(player, pickup, now = 0) {
  const def = WEAPONS[pickup.kind];
  if (!def) return false;
  if (def.slot === "buff") { // 신발: 주울 때마다 지속시간을 새로 채운다
    player.bootsUntil = now + def.duration;
    return true;
  }
  if (def.slot === "melee") {
    if (MELEE_TIER[pickup.kind] <= MELEE_TIER[player.melee]) return false;
    player.melee = pickup.kind;
    return true;
  }
  if (player.special && player.special.kind === pickup.kind) {
    if (player.special.ammo >= def.ammo) return false;
    player.special.ammo = def.ammo;
    return true;
  }
  player.special = { kind: pickup.kind, ammo: def.ammo };
  return true;
}

export function useAmmo(player) {
  if (!player.special || player.special.ammo <= 0) return false;
  player.special.ammo -= 1;
  if (player.special.ammo === 0) { player.special = null; player.activeSlot = 1; }
  return true;
}

const WEIGHT_ENTRIES = Object.entries(PICKUP.weights);
const WEIGHT_TOTAL = WEIGHT_ENTRIES.reduce((s, [, w]) => s + w, 0);

export function rollKind(rng) {
  let r = rng() * WEIGHT_TOTAL;
  for (const [kind, w] of WEIGHT_ENTRIES) { r -= w; if (r < 0) return kind; }
  return WEIGHT_ENTRIES[WEIGHT_ENTRIES.length - 1][0];
}

export class PickupSpawner {
  constructor({ rng, spots }) {
    this.rng = rng;
    this.spots = spots;
    this.pickups = [];
    this.nextId = 1;
    this.nextSpawnAt = 0; // 10초 주기 타이머 — 자리가 없으면 그 주기는 건너뛴다
  }

  tick(now) {
    while (now >= this.nextSpawnAt) {
      this.nextSpawnAt += PICKUP.interval;
      if (this.pickups.length >= PICKUP.max) continue;
      const used = new Set(this.pickups.map((p) => `${p.x},${p.z}`));
      const free = this.spots.filter((s) => !used.has(`${s.x},${s.z}`));
      if (free.length === 0) continue;
      const spot = free[Math.floor(this.rng() * free.length)];
      this.pickups.push({ id: this.nextId++, kind: rollKind(this.rng), x: spot.x, z: spot.z });
    }
    return this.pickups;
  }

  remove(id) { this.pickups = this.pickups.filter((p) => p.id !== id); }
}
