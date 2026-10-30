// 근접 판정·넉백 벡터·투사체(화살·TNT). 좌표계: yaw=0 이 +z, yaw 는 y축 회전(오른손 좌표계).
import { BOSS, MAP, WEAPONS, GRAVITY, PLAYER } from "./constants.js";
import { add, sub, scale, len, norm, distXZ } from "./vec.js";

export function lookDir(yaw, pitch) {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
}

function closestPointOnAabb(p, box) {
  return {
    x: Math.min(Math.max(p.x, box.min.x), box.max.x),
    y: Math.min(Math.max(p.y, box.min.y), box.max.y),
    z: Math.min(Math.max(p.z, box.min.z), box.max.z),
  };
}

export function meleeHit(player, box, range = 3, halfAngleDeg = 30) {
  return meleeHitPoint(player, box, range, halfAngleDeg) !== null;
}

// 근접 타격 지점: 시선 광선이 사거리 안에서 몸통에 들어가는 점, 아니면 시야각(30°) 안의 최근접점. 빗나가면 null
export function meleeHitPoint(player, box, range = 3, halfAngleDeg = 30) {
  const eye = { x: player.pos.x, y: player.pos.y + PLAYER.eyeHeight, z: player.pos.z };
  const cp = closestPointOnAabb(eye, box);
  const to = sub(cp, eye);
  const d = len(to);
  if (d > range) return null;
  if (d < 1e-6) return { ...eye }; // 박스 안
  const look = lookDir(player.yaw, player.pitch);
  const t = rayAabb(eye, look, box);
  if (t !== null && t <= range) return { x: eye.x + look.x * t, y: eye.y + look.y * t, z: eye.z + look.z * t };
  const cos = (look.x * to.x + look.y * to.y + look.z * to.z) / d;
  return cos >= Math.cos((halfAngleDeg * Math.PI) / 180) ? cp : null;
}

// 광선-AABB 슬랩 교차: 들어가는 거리 t(≥0) 를 돌려주고, 안 닿으면 null
export function rayAabb(origin, dir, box) {
  let tmin = 0, tmax = Infinity;
  for (const k of ["x", "y", "z"]) {
    if (Math.abs(dir[k]) < 1e-9) {
      if (origin[k] < box.min[k] || origin[k] > box.max[k]) return null;
      continue;
    }
    let t1 = (box.min[k] - origin[k]) / dir[k], t2 = (box.max[k] - origin[k]) / dir[k];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export function chargeKnock(dir) {
  const d = norm({ x: dir.x, y: 0, z: dir.z });
  return { x: d.x * BOSS.charge.knock, y: BOSS.knockLift, z: d.z * BOSS.charge.knock };
}

export function stompKnock(bossPos, playerPos) {
  const d = norm({ x: playerPos.x - bossPos.x, y: 0, z: playerPos.z - bossPos.z });
  const dd = len(d) === 0 ? { x: 1, y: 0, z: 0 } : d;
  return { x: dd.x * BOSS.stomp.knock, y: BOSS.knockLift, z: dd.z * BOSS.stomp.knock };
}

// 넉백 임펄스가 0.4초 감쇠로 실제 이동하는 거리 ≈ 임펄스 × 0.4 / 2 … 보수적으로 임펄스 크기만큼 밀린다고 보고 판정
export function isSafeFromFall(pos, knock) {
  const land = { x: pos.x + knock.x, z: pos.z + knock.z };
  return Math.abs(land.x) < MAP.half && Math.abs(land.z) < MAP.half;
}

function pointInAabb(p, box) {
  return p.x >= box.min.x && p.x <= box.max.x && p.y >= box.min.y && p.y <= box.max.y && p.z >= box.min.z && p.z <= box.max.z;
}

export class Projectiles {
  constructor() { this.list = []; this.nextId = 1; }

  fireArrow({ pos, dir, ownerId, now }) {
    const d = norm(dir);
    this.list.push({ id: this.nextId++, kind: "arrow", pos: { ...pos }, vel: scale(d, WEAPONS.bow.speed), ownerId, bornAt: now, dieAt: now + WEAPONS.bow.life });
  }

  throwTnt({ pos, dir, ownerId, now }) {
    const d = norm(dir);
    this.list.push({ id: this.nextId++, kind: "tnt", pos: { ...pos }, vel: scale(d, WEAPONS.tnt.throwSpeed), ownerId, bornAt: now, dieAt: now + WEAPONS.tnt.fuse });
  }

  tick(dt, now, bossBox, players) {
    const events = [];
    const keep = [];
    for (const p of this.list) {
      if (p.kind === "arrow") {
        p.pos = add(p.pos, scale(p.vel, dt));
        if (pointInAabb(p.pos, bossBox)) { events.push({ type: "hit", by: p.ownerId, amount: WEAPONS.bow.dmg, pos: { ...p.pos } }); continue; }
        if (now >= p.dieAt || p.pos.y < MAP.fallY) continue;
        keep.push(p);
      } else {
        p.vel = { x: p.vel.x, y: p.vel.y - GRAVITY * dt, z: p.vel.z };
        p.pos = add(p.pos, scale(p.vel, dt));
        if (p.pos.y <= MAP.groundY && Math.abs(p.pos.x) <= MAP.half && Math.abs(p.pos.z) <= MAP.half) { p.pos.y = MAP.groundY; p.vel = { x: 0, y: 0, z: 0 }; } // 땅에 닿으면 그 자리에서 멈춤
        if (now >= p.dieAt) {
          const r = WEAPONS.tnt.radius;
          const cp = closestPointOnAabb(p.pos, bossBox);
          const bossHit = len(sub(cp, p.pos)) <= r;
          const playerHits = players
            .filter((pl) => distXZ(pl.pos, p.pos) <= r)
            .map((pl) => {
              const d = norm({ x: pl.pos.x - p.pos.x, y: 0, z: pl.pos.z - p.pos.z });
              const dd = len(d) === 0 ? { x: 1, y: 0, z: 0 } : d;
              return { id: pl.id, amount: WEAPONS.tnt.dmgPlayer, knock: { x: dd.x * WEAPONS.tnt.knock, y: BOSS.knockLift, z: dd.z * WEAPONS.tnt.knock } };
            });
          events.push({ type: "explode", by: p.ownerId, pos: { ...p.pos }, bossHit, bossDamage: WEAPONS.tnt.dmgBoss, playerHits });
          continue;
        }
        keep.push(p);
      }
    }
    this.list = keep;
    return events;
  }

  snapshot() { return this.list.map((p) => ({ id: p.id, kind: p.kind, pos: p.pos })); }
}
