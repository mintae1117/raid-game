// 봇 시뮬레이션: 서버 Game 에 단순 봇을 붙여 난이도를 측정한다. (npm run sim [players] [difficulty] [seeds])
// 봇 규칙: 누나 표면 2.85~3.0m 를 유지(궤도 스트레이프)하며 근접 공격, 돌진 예고엔 축에서 옆으로 6m, 땅찍기·물기·포효 예고엔 점프,
//          가장자리 6m 안이면 중앙으로, 업그레이드 픽업이 가까우면 주우러 감, 넉백은 즉시 위치에 반영.
import { Game } from "../game/game.js";
import { Player } from "../game/player.js";
import { BOSS, MAP, PLAYER, WEAPONS, TICK } from "../game/constants.js";
import { MELEE_TIER } from "../game/weapons.js";
import { mulberry32 } from "../game/rng.js";
import { distXZ } from "../game/vec.js";

const HOLD_MIN = 2.85, HOLD_MAX = 3.0;  // 물기(2.5m) + 누나 한 틱 이동(≤0.18m) 밖, 근접(3m) 안
const DODGE_CHANCE = 0.7;               // 예고를 보고 피하는 확률(사람 수준)
const PICKUP_RANGE = 22;

export function runSim({ players = 4, difficulty = "normal", seed = 1, maxSec = 900, dodgeChance = DODGE_CHANCE, trace = null } = {}) {
  const rng = mulberry32(seed * 7919 + 17);
  const ps = Array.from({ length: players }, (_, i) => new Player({ id: `b${i}`, name: `bot${i}`, spawn: { x: 0, y: MAP.groundY, z: 0 } }));
  const game = new Game({ players: ps, difficulty, seed, now: 0 });
  const bots = new Map(ps.map((p) => [p.id, { knock: null, dodge: null, jumpFrom: 0, jumpUntil: 0 }]));
  let now = 0;

  const edgeDist = (pos) => MAP.half - Math.max(Math.abs(pos.x), Math.abs(pos.z));
  const towards = (from, to, step) => {
    const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz);
    if (l <= step || l === 0) return { x: to.x, z: to.z };
    return { x: from.x + (dx / l) * step, z: from.z + (dz / l) * step };
  };

  while (game.status === "playing" && now < maxSec) {
    now += TICK;
    const boss = game.boss;
    for (const p of ps) {
      if (!p.alive) continue;
      const b = bots.get(p.id);
      let pos = { x: p.pos.x, y: MAP.groundY, z: p.pos.z };
      if (b.knock) { pos.x += b.knock.x; pos.z += b.knock.z; b.knock = null; }
      const speed = PLAYER.speed * (p.slowUntil > now ? BOSS.roar.slow : 1);
      const step = speed * TICK;

      let goal = null, kind = "hold";
      const sd0 = boss.surfaceDistance(pos);
      const isTarget = boss.targetId === p.id;
      // 업그레이드 픽업: 누나가 멀거나 내가 표적이 아닐 때만, 가장자리 띠 안의 픽업은 누나가 8m 밖일 때만
      const want = (sd0 > 6 || !isTarget)
        ? game.spawner.pickups
          .filter((pk) => (WEAPONS[pk.kind].slot === "melee" ? MELEE_TIER[pk.kind] > MELEE_TIER[p.melee] : WEAPONS[pk.kind].slot === "special" && !p.special))
          .map((pk) => ({ pk, d: distXZ(pos, pk) }))
          .filter((o) => o.d <= PICKUP_RANGE && (edgeDist(o.pk) >= MAP.edgeDangerBand || sd0 > 8))
          .sort((a, b2) => a.d - b2.d)[0]
        : null;
      if (b.dodge && now < b.dodge.until) { goal = b.dodge; kind = "dodge"; }
      else if (want) { goal = { x: want.pk.x, z: want.pk.z }; kind = "pickup"; }
      else if (edgeDist(pos) < MAP.edgeDangerBand) {
        // 중앙으로, 단 누나가 길목에 있으면 75° 틀어서 돌아간다
        kind = "edge";
        const cl = Math.hypot(pos.x, pos.z) || 1;
        let dir = { x: -pos.x / cl, z: -pos.z / cl };
        const bl = Math.hypot(boss.pos.x - pos.x, boss.pos.z - pos.z) || 1;
        const tb = { x: (boss.pos.x - pos.x) / bl, z: (boss.pos.z - pos.z) / bl };
        if (dir.x * tb.x + dir.z * tb.z > 0.5 && bl < 10) {
          const side = Math.sign(dir.x * tb.z - dir.z * tb.x) || 1;
          const a = -side * (75 * Math.PI / 180);
          dir = { x: dir.x * Math.cos(a) - dir.z * Math.sin(a), z: dir.x * Math.sin(a) + dir.z * Math.cos(a) };
        }
        goal = { x: pos.x + dir.x * 3, z: pos.z + dir.z * 3 };
      } else if (sd0 > HOLD_MAX) { goal = { x: boss.pos.x, z: boss.pos.z }; kind = "approach"; }
      else {
        // 거리 유지: 누나가 다가오는 속도만큼 바깥으로 빠지면서 남는 속도로 옆으로 돈다(서로 제자리에서 도는 궤도가 됨).
        // 물기 범위에 들어오기 직전이면 전속력으로 뒤로.
        kind = sd0 < HOLD_MIN ? "retreat" : "hold";
        const dx = pos.x - boss.pos.x, dz = pos.z - boss.pos.z, l = Math.hypot(dx, dz) || 1;
        const away = { x: dx / l, z: dz / l };
        let tan = { x: -away.z, z: away.x };
        if (tan.x * -pos.x + tan.z * -pos.z < 0) tan = { x: -tan.x, z: -tan.z };
        const vr = sd0 < HOLD_MIN ? speed : Math.min(speed, boss.speed() * 1.1);
        const vt = Math.sqrt(Math.max(0, speed * speed - vr * vr));
        goal = { x: pos.x + (away.x * vr + tan.x * vt) * 10, z: pos.z + (away.z * vr + tan.z * vt) * 10 };
      }
      if (goal) { const n = towards(pos, goal, step); pos.x = n.x; pos.z = n.z; }
      trace?.(p.id, kind, pos, boss.targetId === p.id);
      if (now >= b.jumpFrom && now < b.jumpUntil) pos.y = 2.5;

      const yaw = Math.atan2(-(boss.pos.x - pos.x), boss.pos.z - pos.z);
      if (Math.abs(pos.x) > MAP.half || Math.abs(pos.z) > MAP.half) {
        game.applyInput(p.id, { pos, yaw, pitch: 0 }, TICK);
        game.fell(p.id, now);
        continue;
      }
      game.applyInput(p.id, { pos, yaw, pitch: 0 }, TICK);

      // 공격: 근접 범위면 근접, 멀고 활이 있으면 활, 3~5m 에 TNT 가 있으면 투척
      const sd = boss.surfaceDistance(p.pos);
      if (sd <= WEAPONS[p.melee].range) { game.setSlot(p.id, 1); game.attack(p.id, now); }
      else if (p.special?.kind === "gun" && sd < 30) {
        const dy = boss.pos.y + 2 - (p.pos.y + PLAYER.eyeHeight);
        p.pitch = Math.atan2(dy, distXZ(p.pos, boss.pos));
        game.setSlot(p.id, 2); game.attack(p.id, now); p.pitch = 0;
      } else if (p.special?.kind === "bow" && sd < 16) {
        const dy = boss.pos.y + 2 - (p.pos.y + PLAYER.eyeHeight);
        p.pitch = Math.atan2(dy, distXZ(p.pos, boss.pos));
        game.setSlot(p.id, 2); game.attack(p.id, now); p.pitch = 0;
      } else if (p.special?.kind === "tnt" && sd >= 3 && sd <= 5) { game.setSlot(p.id, 2); game.attack(p.id, now); }
    }

    game.tick(TICK, now);
    for (const e of game.drainEvents()) {
      if (e.type === "knock") { const b = bots.get(e.id); if (b) b.knock = { x: e.impulse.x, z: e.impulse.z }; }
      else if (e.type === "telegraph") {
        for (const p of ps) {
          if (!p.alive || rng() > dodgeChance) continue;
          const b = bots.get(p.id);
          if (e.kind === "charge") {
            const perp = { x: Math.cos(boss.yaw), z: Math.sin(boss.yaw) };
            const rel = { x: p.pos.x - boss.pos.x, z: p.pos.z - boss.pos.z };
            let side = Math.sign(rel.x * perp.x + rel.z * perp.z) || 1;
            // 복도(반폭 3m) 밖 + 멈춘 누나의 물기(2.5m) 밖까지: 축에서 6m
            const D = 6;
            let goal = { x: p.pos.x + perp.x * D * side, z: p.pos.z + perp.z * D * side };
            if (edgeDist(goal) < MAP.edgeDangerBand) { side = -side; goal = { x: p.pos.x + perp.x * D * side, z: p.pos.z + perp.z * D * side }; }
            b.dodge = { ...goal, until: e.until + BOSS.charge.dist / BOSS.charge.speed + 0.2 };
          } else if ((e.kind === "stomp" && distXZ(p.pos, boss.pos) < BOSS.stomp.radius + 3) || (e.kind === "roar" && distXZ(p.pos, boss.pos) < BOSS.roar.radius + 2) || (e.kind === "bite" && boss.targetId === p.id)) {
            b.jumpFrom = e.until - 0.2; b.jumpUntil = e.until + 0.35;
          }
        }
      }
    }
  }
  const result = game.status === "won" ? "won" : "lost";
  return { result, durationSec: (game.endedAt ?? now) - game.startedAt, deaths: ps.reduce((s, p) => s + p.deaths, 0), bossHpLeft: game.boss.hp, timedOut: game.status === "playing" };
}

export function summarize(runs) {
  const n = runs.length;
  const wins = runs.filter((r) => r.result === "won");
  return {
    n,
    lossRate: +((n - wins.length) / n).toFixed(2),
    avgDuration: +(runs.reduce((s, r) => s + r.durationSec, 0) / n).toFixed(1),
    avgWinDuration: wins.length ? +(wins.reduce((s, r) => s + r.durationSec, 0) / wins.length).toFixed(1) : null,
    avgDeaths: +(runs.reduce((s, r) => s + r.deaths, 0) / n).toFixed(2),
    timedOut: runs.filter((r) => r.timedOut).length,
  };
}

if (process.argv[1] && process.argv[1].endsWith("bots.js")) {
  const players = Number(process.argv[2]) || 4;
  const difficulty = process.argv[3] || "normal";
  const seeds = Number(process.argv[4]) || 100;
  const runs = Array.from({ length: seeds }, (_, i) => runSim({ players, difficulty, seed: i + 1 }));
  console.log(`${players}인 ${difficulty} × ${seeds}시드:`, summarize(runs));
}
