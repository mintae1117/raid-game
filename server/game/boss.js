// 누나(보스) 상태 기계: chase → bite_tele / charge_tele → charging / stomp_tele → stomping / roar_tele → roar / dead
// 물기·땅찍기·포효는 예고 뒤에 들어가며 공중(점프)인 플레이어는 면제. 돌진만 옆으로 피해야 한다.
import { BOSS, DIFFICULTY, PLAYER_COUNT_MUL, PLAYER } from "./constants.js";
import { chargeKnock, stompKnock } from "./combat.js";
import { norm, distXZ } from "./vec.js";

export class Boss {
  constructor({ difficulty = "normal", playerCount = 1, rng = Math.random, spawnPos = { x: 15, y: 1, z: 0 }, map = null }) {
    this.map = map; // 장식 블록과 충돌(통과 불가)
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.difficulty = difficulty;
    const mul = PLAYER_COUNT_MUL[Math.min(Math.max(playerCount, 1), 4) - 1];
    this.maxHp = Math.round(BOSS.baseHp * mul * this.diff.hp);
    this.hp = this.maxHp;
    this.rng = rng;
    this.pos = { ...spawnPos };
    this.yaw = 0;
    this.state = "chase";
    this.phase = 1;
    this.targetId = null;
    this.telegraph = null;     // { kind, until }
    this.nextAbilityAt = 4;    // 첫 특수기까지 잠깐 유예
    this.nextBiteAt = 0;
    this.nextRetargetAt = 0;
    this.chargeDir = null;
    this.chargeLeft = 0;
    this.chargeHitIds = new Set();
    this.chargesQueued = 0;
    this.stateUntil = 0;
    this.diedAt = null;
  }

  // ----- 파생 수치 -----
  phaseDef() { return BOSS.phases[this.phase - 1]; }
  phaseCooldown() { return this.phaseDef().cool * this.diff.cool; }
  speed() { return BOSS.speed * this.phaseDef().speedMul; }
  scaledDamage(base) { return Math.round(base * this.diff.dmg); }
  chargeRepeat() { return this.phase === 3 ? this.diff.chargeRepeat3 : this.phaseDef().chargeRepeat; }

  aabb() {
    const { w, h, d } = BOSS.size;
    return { min: { x: this.pos.x - w / 2, y: this.pos.y, z: this.pos.z - d / 2 }, max: { x: this.pos.x + w / 2, y: this.pos.y + h, z: this.pos.z + d / 2 } };
  }

  // 돌진 복도: 진행축 기준 가로 반폭 = 몸 반폭(3m), 세로는 몸 길이 ± 폭 여유. 축 정렬 AABB 스윕보다 좁고 예측 가능하다.
  inChargeCorridor(p) {
    const rx = p.x - this.pos.x, rz = p.z - this.pos.z;
    const along = rx * this.chargeDir.x + rz * this.chargeDir.z;
    const lateral = Math.abs(rx * this.chargeDir.z - rz * this.chargeDir.x);
    const halfLen = BOSS.size.d / 2 + BOSS.charge.width / 2;
    return lateral <= BOSS.size.w / 2 && along >= -halfLen && along <= halfLen;
  }

  // 장식 블록(나무·바위)과 겹치면 밀어낸다. 겹쳤으면 true — 누나는 장애물을 통과하지 못하고, 플레이어는 뒤에 숨을 수 있다
  resolveObstacles() {
    if (!this.map) return false;
    const hw = BOSS.size.w / 2, hd = BOSS.size.d / 2;
    let hit = false;
    for (const d of this.map.decorations) {
      const ox = hw + d.w / 2 - Math.abs(this.pos.x - d.x);
      const oz = hd + d.d / 2 - Math.abs(this.pos.z - d.z);
      if (ox <= 0 || oz <= 0) continue;
      hit = true;
      if (ox < oz) this.pos.x += (Math.sign(this.pos.x - d.x) || 1) * ox;
      else this.pos.z += (Math.sign(this.pos.z - d.z) || 1) * oz;
    }
    return hit;
  }

  surfaceDistance(p) {
    const b = this.aabb();
    const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x);
    const dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
    return Math.hypot(dx, dz);
  }

  takeDamage(amount, byId, now) {
    if (this.state === "dead") return { phaseChanged: false };
    this.hp = Math.max(0, this.hp - amount);
    const before = this.phase;
    const ratio = this.hp / this.maxHp;
    this.phase = ratio > BOSS.phases[0].hp ? 1 : ratio > BOSS.phases[1].hp ? 2 : 3;
    if (this.hp === 0) { this.state = "dead"; this.telegraph = null; this.diedAt = now; }
    return { phaseChanged: this.phase !== before };
  }

  // ----- 어그로 -----
  pickTarget(now, players) {
    const active = players.filter((p) => p.isActive(now));
    if (active.length === 0) return null;
    const byDamage = [...active].sort((a, b) => b.recentDamage(now) - a.recentDamage(now));
    const byDist = [...active].sort((a, b) => distXZ(a.pos, this.pos) - distXZ(b.pos, this.pos));
    const useDamage = byDamage[0].recentDamage(now) > 0 && this.rng() < 0.6;
    return (useDamage ? byDamage[0] : byDist[0]).id;
  }

  // ----- 틱 -----
  tick(dt, now, players) {
    const events = [];
    if (this.state === "dead") return events;

    if (now >= this.nextRetargetAt || !players.some((p) => p.id === this.targetId && p.isActive(now))) {
      this.targetId = this.pickTarget(now, players);
      this.nextRetargetAt = now + BOSS.aggroRetarget;
    }
    const target = players.find((p) => p.id === this.targetId) || null;

    switch (this.state) {
      case "chase": {
        if (target) {
          const dx = target.pos.x - this.pos.x, dz = target.pos.z - this.pos.z;
          const dist = this.surfaceDistance(target.pos);
          this.yaw = Math.atan2(-dx, dz);
          if (dist > BOSS.bite.range * 0.6) {
            const d = norm({ x: dx, y: 0, z: dz });
            const step = Math.min(this.speed() * dt, Math.hypot(dx, dz));
            this.pos.x += d.x * step; this.pos.z += d.z * step;
            this.resolveObstacles();
          }
          if (dist <= BOSS.bite.range && now >= this.nextBiteAt) {
            this.state = "bite_tele";
            this.telegraph = { kind: "bite", until: now + BOSS.bite.telegraph };
            events.push({ type: "telegraph", kind: "bite", until: this.telegraph.until });
            break;
          }
        }
        if (now >= this.nextAbilityAt && target) {
          const roll = this.rng();
          if (this.phase >= 2 && roll < 0.2) this.startRoar(now, events);
          else if (roll < 0.6) this.startCharge(now, target, events);
          else this.startStomp(now, events);
        }
        break;
      }
      case "bite_tele":
        if (now >= this.telegraph.until) {
          this.telegraph = null;
          this.nextBiteAt = now + BOSS.bite.cool;
          this.state = "chase";
          events.push({ type: "bite", id: target ? target.id : null });
          if (target && target.isActive(now) && !target.isAirborne(now) && this.surfaceDistance(target.pos) <= BOSS.bite.range * 1.3) {
            events.push({ type: "bossHit", id: target.id, amount: this.scaledDamage(BOSS.bite.dmg), knock: null, kind: "bite" });
          }
        }
        break;
      case "charge_tele":
        if (now >= this.telegraph.until) { this.state = "charging"; this.telegraph = null; this.chargeHitIds = new Set(); if (!this.chargeLeft) this.chargeLeft = BOSS.charge.dist; }
        break;
      case "charging": {
        const step = Math.min(BOSS.charge.speed * dt, this.chargeLeft);
        this.pos.x += this.chargeDir.x * step; this.pos.z += this.chargeDir.z * step;
        this.chargeLeft -= step;
        if (this.resolveObstacles()) { // 장애물에 정면 충돌 → 돌진 취소, 비틀거림(반격 창)
          this.state = "stunned"; this.stateUntil = now + BOSS.charge.stun;
          this.telegraph = null; this.chargeLeft = 0; this.chargesQueued = 0;
          events.push({ type: "stun", pos: { ...this.pos }, until: this.stateUntil });
          break;
        }
        for (const p of players) {
          if (!p.isActive(now) || this.chargeHitIds.has(p.id)) continue;
          if (this.inChargeCorridor(p.pos)) {
            this.chargeHitIds.add(p.id);
            events.push({ type: "bossHit", id: p.id, amount: this.scaledDamage(BOSS.charge.dmg), knock: chargeKnock(this.chargeDir), kind: "charge" });
          }
        }
        if (this.chargeLeft <= 1e-6) {
          this.chargesQueued -= 1;
          if (this.chargesQueued > 0 && target) { this.beginChargeTelegraph(now, target, events, 0.5); }
          else this.finishAbility(now);
        }
        break;
      }
      case "stomp_tele":
        if (now >= this.telegraph.until) {
          this.telegraph = null;
          for (const p of players) {
            if (!p.isActive(now)) continue;
            if (p.isAirborne(now)) continue;
            if (this.surfaceDistance(p.pos) <= BOSS.stomp.radius) {
              events.push({ type: "bossHit", id: p.id, amount: this.scaledDamage(BOSS.stomp.dmg), knock: stompKnock(this.pos, p.pos), kind: "stomp" });
            }
          }
          events.push({ type: "stomp", pos: { ...this.pos } });
          this.state = "stomping"; this.stateUntil = now + 0.6;
        }
        break;
      case "stomping":
        if (now >= this.stateUntil) this.finishAbility(now);
        break;
      case "stunned":
        if (now >= this.stateUntil) this.finishAbility(now);
        break;
      case "roar_tele":
        if (now >= this.telegraph.until) {
          this.telegraph = null;
          this.state = "roar"; this.stateUntil = now + 0.8;
          const slowIds = players.filter((p) => p.isActive(now) && !p.isAirborne(now) && distXZ(p.pos, this.pos) <= BOSS.roar.radius).map((p) => p.id);
          events.push({ type: "roar", pos: { ...this.pos }, radius: BOSS.roar.radius, slow: BOSS.roar.slow, dur: BOSS.roar.dur, slowIds });
        }
        break;
      case "roar":
        if (now >= this.stateUntil) this.finishAbility(now);
        break;
    }
    return events;
  }

  beginChargeTelegraph(now, target, events, duration = BOSS.charge.telegraph) {
    const d = norm({ x: target.pos.x - this.pos.x, y: 0, z: target.pos.z - this.pos.z });
    this.chargeDir = d.x === 0 && d.z === 0 ? { x: 1, y: 0, z: 0 } : d;
    this.yaw = Math.atan2(-this.chargeDir.x, this.chargeDir.z);
    this.chargeLeft = BOSS.charge.dist;
    this.state = "charge_tele";
    this.telegraph = { kind: "charge", until: now + duration };
    events.push({ type: "telegraph", kind: "charge", until: this.telegraph.until });
  }

  startCharge(now, target, events) {
    this.chargesQueued = this.chargeRepeat();
    this.beginChargeTelegraph(now, target, events);
  }

  startStomp(now, events) {
    this.state = "stomp_tele";
    this.telegraph = { kind: "stomp", until: now + BOSS.stomp.telegraph };
    events.push({ type: "telegraph", kind: "stomp", until: this.telegraph.until });
  }

  startRoar(now, events) {
    this.state = "roar_tele";
    this.telegraph = { kind: "roar", until: now + BOSS.roar.telegraph };
    events.push({ type: "telegraph", kind: "roar", until: this.telegraph.until });
  }

  finishAbility(now) {
    this.nextBiteAt = Math.max(this.nextBiteAt, now + BOSS.bite.recover);
    this.state = "chase";
    this.telegraph = null;
    this.chargeLeft = 0;
    this.nextAbilityAt = now + this.phaseCooldown();
  }

  snapshot() {
    return { pos: this.pos, yaw: this.yaw, hp: this.hp, maxHp: this.maxHp, state: this.state, phase: this.phase, telegraph: this.telegraph };
  }
}
