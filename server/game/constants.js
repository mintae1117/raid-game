// 모든 게임 수치는 여기서만 정의한다 (튜닝 시 이 파일만 수정)
export const TICK = 0.05; // 20Hz

export const MAP = {
  name: "낙성대동굴",
  size: 48,
  half: 24,
  groundY: 1,
  fallY: -10,
  centerSafeRadius: 12, // 이 안에서 맞으면 넉백으로 절대 안 떨어짐
  edgeDangerBand: 9,    // 가장자리 9m 안쪽은 떨어질 수 있음(돌진 넉백 9m)
};

export const PLAYER = {
  hp: 100,
  lives: 3,
  speed: 5,
  jumpHeight: 1.2,
  respawnDelay: 3,
  reconnectGrace: 60,
  eyeHeight: 1.6,     // 카메라·근접 판정 눈높이 = 발 + 1.6m (원격 캐릭터 머리 높이와 동일)
  airborneY: 1.4,     // 발이 이 높이보다 위면 공중 → 땅찍기·물기·포효 면제
  airborneGrace: 0.3, // 최근 0.3초 안에 공중이었으면 면제(터널 지연 보정)
};

export const BOSS = {
  name: "누나",
  size: { w: 6, h: 4, d: 5 },
  baseHp: 12000, // 봇 시뮬 튜닝(4인 보통 110~220초 — 사람은 봇보다 덜 맞혀 약 2배) — 변경 시 npm run sim 으로 재확인
  speed: 3.5, // 3차 피드백: 더 빠르게
  bite: { range: 2.5, dmg: 12, cool: 1.3, recover: 0.6, telegraph: 0.4 }, // telegraph: 물기 예고(머리 들기) — 점프로 회피 // recover: 돌진·땅찍기·포효가 끝난 뒤 물기까지의 틈(반격 창)
  charge: { telegraph: 0.7, speed: 18, dist: 10, dmg: 25, knock: 9, width: 3, stun: 1.2 }, // stun: 장애물에 부딪히면 비틀거리는 시간
  stomp: { telegraph: 0.7, radius: 7, dmg: 30, knock: 7 },
  roar: { telegraph: 0.5, radius: 10, slow: 0.5, dur: 2.5 }, // 예고 뒤 포효 — 공중이면 면제
  knockLift: 1.5,
  phases: [
    { hp: 0.6, cool: 5, speedMul: 1.0, chargeRepeat: 1 },
    { hp: 0.3, cool: 4, speedMul: 1.25, chargeRepeat: 2 },
    { hp: 0.0, cool: 3, speedMul: 1.5, chargeRepeat: 3 },
  ],
  aggroWindow: 5,
  aggroRetarget: 3,
  deathAnim: 3,
};

export const PLAYER_COUNT_MUL = [0.75, 1.5, 2.2, 2.8]; // 봇 시뮬 튜닝(스펙 초기값 1/1.7/2.3/2.8). 1인은 모든 공격이 한 명에게 몰려 HP 를 더 낮춤

export const DIFFICULTY = {
  easy: { hp: 0.7, dmg: 0.7, cool: 1.3, chargeRepeat3: 2 },
  normal: { hp: 1, dmg: 1, cool: 1, chargeRepeat3: 3 },
  hard: { hp: 1.4, dmg: 1.3, cool: 0.8, chargeRepeat3: 4 },
};

export const WEAPONS = {
  wood: { kind: "wood", slot: "melee", tier: 0, dmg: 56, range: 3, cool: 0.5, label: "나무 검" },
  iron: { kind: "iron", slot: "melee", tier: 1, dmg: 112, range: 3, cool: 0.5, label: "철검" },
  diamond: { kind: "diamond", slot: "melee", tier: 2, dmg: 160, range: 3, cool: 0.5, label: "다이아 검" },
  bow: { kind: "bow", slot: "special", dmg: 90, speed: 30, cool: 0.8, ammo: 30, life: 2, label: "활" },
  gun: { kind: "gun", slot: "special", dmg: 22, cool: 0.09, ammo: 80, range: 40, spread: 0.02, label: "기관총" }, // 히트스캔 연사, 누르고 있으면 자동 발사
  boots: { kind: "boots", slot: "buff", duration: 25, sprintMul: 1.7, label: "신발" }, // 주우면 25초 동안 Shift 질주(1.7배)
  tnt: { kind: "tnt", slot: "special", dmgBoss: 260, dmgPlayer: 25, knock: 5, radius: 4, fuse: 2, throwSpeed: 12, cool: 1, ammo: 3, label: "TNT" },
};

export const PICKUP = {
  max: 8,
  interval: 6,
  radius: 1.5,
  weights: { iron: 30, bow: 15, gun: 20, diamond: 20, tnt: 10, boots: 15 }, // 2차 피드백: 좋은 무기가 더 자주
  minCenter: 8,
  edgeInset: 3,
};

export const GRAVITY = 20;
