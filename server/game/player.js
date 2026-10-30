// 플레이어 상태: HP·목숨·무기 슬롯·부활·접속. 수치는 constants 에서.
import { PLAYER, BOSS } from "./constants.js";

export class Player {
  constructor({ id, name, spawn }) {
    this.id = id;
    this.name = name;
    this.pos = { ...spawn };
    this.yaw = 0;
    this.pitch = 0;
    this.hp = PLAYER.hp;
    this.lives = PLAYER.lives;
    this.alive = true;
    this.melee = "wood";
    this.special = null;       // null | { kind: 'bow'|'tnt', ammo }
    this.activeSlot = 1;       // 1 근접, 2 특수
    this.respawnAt = null;
    this.disconnectedAt = null;
    this.damageLog = [];       // [{ t, amount }] 내가 누나에게 준 피해(어그로용)
    this.totalDamage = 0;
    this.deaths = 0;
    this.lastAttackAt = -Infinity;
    this.slowUntil = 0;
    this.lastAirborneAt = -Infinity; // 마지막으로 공중에 있었던 시각(입력 기준)
    this.bootsUntil = 0;             // 신발 버프 만료 시각(Shift 질주 허용)
  }

  takeDamage(amount, now) {
    if (!this.alive) return { died: false };
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) { this.kill(now); return { died: true }; }
    return { died: false };
  }

  kill(now) {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.lives = Math.max(0, this.lives - 1);
    this.deaths += 1;
    this.respawnAt = this.lives > 0 ? now + PLAYER.respawnDelay : null;
  }

  respawn(spawn) {
    this.pos = { ...spawn };
    this.hp = PLAYER.hp;
    this.alive = true;
    this.melee = "wood";
    this.special = null;
    this.activeSlot = 1;
    this.respawnAt = null;
    this.slowUntil = 0;
    this.lastAirborneAt = -Infinity;
    this.bootsUntil = 0;
  }

  isOut() { return this.lives === 0; }
  isActive(now) { return this.alive && this.disconnectedAt === null; }
  // 지금 공중이거나 최근 0.3초 안에 공중이었으면 광역·물기·포효 면제(터널 지연 보정)
  isAirborne(now) { return this.pos.y > PLAYER.airborneY || now - this.lastAirborneAt <= PLAYER.airborneGrace; }

  recentDamage(now) {
    return this.damageLog.filter((d) => now - d.t <= BOSS.aggroWindow).reduce((s, d) => s + d.amount, 0);
  }
}
