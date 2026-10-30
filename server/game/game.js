// 한 판의 오케스트레이션: 틱 순서 = 부활 → 보스 → 투사체 → 피격·넉백 → 줍기 → 스포너 → 승패
import { PLAYER, WEAPONS, PICKUP, BOSS, MAP } from "./constants.js";
import { createMap } from "./map.js";
import { mulberry32 } from "./rng.js";
import { Boss } from "./boss.js";
import { PickupSpawner, tryPickup, useAmmo, weaponDef } from "./weapons.js";
import { Projectiles, meleeHitPoint, lookDir, rayAabb } from "./combat.js";
import { norm } from "./vec.js";
import { distXZ } from "./vec.js";

export class Game {
  constructor({ players, difficulty = "normal", seed = 1, now = 0 }) {
    this.players = players;
    this.difficulty = difficulty;
    this.seed = seed;
    this.map = createMap(seed);
    this.rng = mulberry32(seed + 1000);
    players.forEach((p, i) => { p.pos = { ...this.map.spawnPoints[i % 4] }; });
    const ang = this.rng() * Math.PI * 2;
    this.boss = new Boss({ difficulty, playerCount: players.length, rng: this.rng, spawnPos: { x: Math.cos(ang) * 15, y: MAP.groundY, z: Math.sin(ang) * 15 }, map: this.map });
    this.spawner = new PickupSpawner({ rng: this.rng, spots: this.map.pickupSpots });
    this.projectiles = new Projectiles();
    this.status = "playing";
    this.startedAt = now;
    this.endedAt = null;
    this.now = now;
    this.events = [];
  }

  emit(e) { this.events.push(e); }
  drainEvents() { const ev = this.events; this.events = []; return ev; }
  player(id) { return this.players.find((p) => p.id === id); }

  // ----- 입력 -----
  // 이동 검증: 걷기 속도만큼 "예산" 이 쌓이고(최대 0.6초치 = 3m 순간 여유) 이동 거리만큼 쓴다.
  // 메시지 하나가 아니라 시간 창 기준이라 50ms 마다 0.99m 씩 보내는 식의 가속이 막힌다. 넉백 직후엔 임펄스만큼 추가 허용.
  applyInput(id, { pos, yaw, pitch }, dt = 0.05) {
    const p = this.player(id);
    if (!p || !p.alive) return;
    if (pos.y > PLAYER.airborneY) p.lastAirborneAt = this.now;
    const rate = PLAYER.speed * (p.bootsUntil > this.now ? WEAPONS.boots.sprintMul : 1); // 신발이 있으면 질주 속도까지 허용
    const cap = rate * 0.6;
    if (p.moveBudget === undefined) p.moveBudget = cap;
    p.moveBudget = Math.min(cap, p.moveBudget + rate * dt);
    let allowance = p.moveBudget + 0.2;
    if (p.knockAllowanceUntil > this.now) allowance += p.knockAllowance || 8;
    const d = distXZ(p.pos, pos);
    if (d <= allowance) {
      p.moveBudget = Math.max(0, p.moveBudget - d);
      p.pos = { x: pos.x, y: pos.y, z: pos.z };
    }
    p.yaw = yaw; p.pitch = pitch;
  }

  setSlot(id, n) {
    const p = this.player(id);
    if (!p) return;
    p.activeSlot = n === 2 && p.special ? 2 : 1;
  }

  recordDamage(id, amount, now) {
    const p = this.player(id);
    if (!p) return;
    p.damageLog.push({ t: now, amount });
    if (p.damageLog.length > 200) p.damageLog.splice(0, 100);
    p.totalDamage += amount;
  }

  damageBoss(amount, byId, now, kind, pos = null) {
    if (this.boss.state === "dead") return;
    const { phaseChanged } = this.boss.takeDamage(amount, byId, now);
    this.recordDamage(byId, amount, now);
    this.emit({ type: "hit", by: byId, amount, kind, bossHp: this.boss.hp, pos });
    if (phaseChanged) this.emit({ type: "phase", phase: this.boss.phase });
  }

  attack(id, now) {
    const p = this.player(id);
    if (!p || !p.alive || this.status !== "playing") return;
    const special = p.activeSlot === 2 && p.special ? weaponDef(p.special.kind) : null;
    const def = special || weaponDef(p.melee);
    if (now - p.lastAttackAt < def.cool) return;
    p.lastAttackAt = now;
    const dir = lookDir(p.yaw, p.pitch);
    const eye = { x: p.pos.x, y: p.pos.y + PLAYER.eyeHeight, z: p.pos.z };
    if (def.slot === "melee") {
      this.emit({ type: "swing", id });
      const pt = meleeHitPoint(p, this.boss.aabb(), def.range);
      if (pt) this.damageBoss(def.dmg, id, now, "melee", pt);
    } else if (def.kind === "bow") {
      this.projectiles.fireArrow({ pos: eye, dir, ownerId: id, now });
      useAmmo(p);
      this.emit({ type: "shoot", id, kind: "bow" });
    } else if (def.kind === "gun") {
      // 히트스캔: 약간의 탄퍼짐을 준 시선 광선이 사거리 안에서 몸통에 닿으면 즉시 피해
      const sx = (this.rng() - 0.5) * 2 * def.spread, sy = (this.rng() - 0.5) * 2 * def.spread;
      const d = norm({ x: dir.x + sx, y: dir.y + sy, z: dir.z });
      const t = rayAabb(eye, d, this.boss.aabb());
      const hitT = t !== null && t <= def.range ? t : null;
      const reach = hitT ?? def.range;
      const to = { x: eye.x + d.x * reach, y: eye.y + d.y * reach, z: eye.z + d.z * reach };
      useAmmo(p);
      this.emit({ type: "shoot", id, kind: "gun", from: eye, to });
      if (hitT !== null) this.damageBoss(def.dmg, id, now, "gun", to);
    } else if (def.kind === "tnt") {
      this.projectiles.throwTnt({ pos: eye, dir: { x: dir.x, y: dir.y + 0.35, z: dir.z }, ownerId: id, now });
      useAmmo(p);
      this.emit({ type: "shoot", id, kind: "tnt" });
    }
  }

  // ----- 사망·접속 -----
  killPlayer(p, cause, now) {
    if (!p.alive) return;
    p.kill(now);
    this.emit({ type: "death", id: p.id, cause, lives: p.lives });
  }

  fell(id, now) { const p = this.player(id); if (p) this.killPlayer(p, "fall", now); }
  disconnect(id, now) { const p = this.player(id); if (p) p.disconnectedAt = now; }
  reconnect(id) { const p = this.player(id); if (p) p.disconnectedAt = null; }
  drop(id) { this.players = this.players.filter((p) => p.id !== id); }

  applyKnock(p, impulse) {
    p.knockAllowanceUntil = this.now + 2; // 느린 터널(RTT 1초+)에서도 넉백 이동 보고가 창 안에 들어오게
    p.knockAllowance = Math.hypot(impulse.x || 0, impulse.z || 0) + 2;
    this.emit({ type: "knock", id: p.id, impulse });
  }

  // ----- 틱 -----
  tick(dt, now) {
    this.now = now;
    if (this.status !== "playing") return;

    for (const p of this.players) {
      // 끊긴 플레이어는 돌아올 때까지 부활을 보류한다(무기·위치를 그대로 들고 복귀)
      if (!p.alive && p.disconnectedAt === null && p.respawnAt !== null && now >= p.respawnAt) {
        const i = this.players.indexOf(p);
        p.respawn(this.map.spawnPoints[i % 4]);
        this.emit({ type: "respawn", id: p.id });
      }
    }

    for (const e of this.boss.tick(dt, now, this.players)) {
      if (e.type === "bossHit") {
        const p = this.player(e.id);
        if (!p || !p.isActive(now)) continue;
        if (e.knock) this.applyKnock(p, e.knock);
        const { died } = p.takeDamage(e.amount, now);
        this.emit({ type: "playerHit", id: p.id, amount: e.amount, kind: e.kind, hp: p.hp });
        if (died) this.emit({ type: "death", id: p.id, cause: "boss", lives: p.lives });
      } else {
        this.emit(e);
      }
    }

    // 누나 몸은 단단하다: 몸 안에 들어온 플레이어는 가장 가까운 면 밖으로 밀어낸다(가장자리면 떨어질 수 있음)
    if (this.boss.state !== "dead") {
      const box = this.boss.aabb(), R = 0.35;
      for (const p of this.players) {
        if (!p.isActive(now) || p.pos.y >= box.max.y) continue;
        const ox = (box.max.x - box.min.x) / 2 + R - Math.abs(p.pos.x - this.boss.pos.x);
        const oz = (box.max.z - box.min.z) / 2 + R - Math.abs(p.pos.z - this.boss.pos.z);
        if (ox <= 0 || oz <= 0) continue;
        if (ox < oz) p.pos.x += (Math.sign(p.pos.x - this.boss.pos.x) || 1) * ox;
        else p.pos.z += (Math.sign(p.pos.z - this.boss.pos.z) || 1) * oz;
        p.knockAllowanceUntil = now + 0.5; p.knockAllowance = Math.max(p.knockAllowance || 0, 4);
      }
    }

    const alivePlayers = this.players.filter((p) => p.isActive(now));
    for (const e of this.projectiles.tick(dt, now, this.boss.aabb(), alivePlayers)) {
      if (e.type === "hit") this.damageBoss(e.amount, e.by, now, "arrow", e.pos);
      else if (e.type === "explode") {
        this.emit({ type: "explode", pos: e.pos });
        if (e.bossHit) this.damageBoss(e.bossDamage, e.by, now, "tnt", e.pos);
        for (const h of e.playerHits) {
          const p = this.player(h.id);
          if (!p || !p.isActive(now)) continue;
          this.applyKnock(p, h.knock);
          const { died } = p.takeDamage(h.amount, now);
          this.emit({ type: "playerHit", id: p.id, amount: h.amount, kind: "tnt", hp: p.hp });
          if (died) this.emit({ type: "death", id: p.id, cause: "tnt", lives: p.lives });
        }
      }
    }

    for (const p of this.players) {
      if (!p.isActive(now)) continue;
      for (const pk of [...this.spawner.pickups]) {
        if (distXZ(p.pos, { x: pk.x, z: pk.z }) <= PICKUP.radius && tryPickup(p, pk, now)) {
          this.spawner.remove(pk.id);
          this.emit({ type: "pickup", id: p.id, kind: pk.kind });
        }
      }
    }
    this.spawner.tick(now - this.startedAt);

    if (this.boss.state === "dead") this.end("won", now);
    else if (this.players.every((p) => p.isOut())) this.end("lost", now); // 전원 탈락(0명 포함) → 패배
  }

  end(status, now) {
    this.status = status;
    this.endedAt = now;
    this.emit({ type: status === "won" ? "win" : "lose", stats: this.stats() });
  }

  stats() {
    const total = this.players.reduce((s, p) => s + p.totalDamage, 0);
    const contributions = {};
    let mvpId = null, best = -1;
    for (const p of this.players) {
      contributions[p.id] = { name: p.name, damage: p.totalDamage, pct: total > 0 ? (p.totalDamage / total) * 100 : 0, deaths: p.deaths };
      if (p.totalDamage > best) { best = p.totalDamage; mvpId = p.id; }
    }
    return { durationSec: (this.endedAt ?? this.now) - this.startedAt, contributions, mvpId, bossHpLeft: this.boss.hp, bossMaxHp: this.boss.maxHp };
  }

  snapshot() {
    return {
      t: this.now,
      status: this.status,
      players: this.players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, yaw: p.yaw, hp: p.hp, lives: p.lives, alive: p.alive, melee: p.melee, special: p.special, activeSlot: p.activeSlot, bootsUntil: p.bootsUntil, connected: p.disconnectedAt === null })),
      boss: this.boss.snapshot(),
      projectiles: this.projectiles.snapshot(),
      pickups: this.spawner.pickups,
    };
  }
}
