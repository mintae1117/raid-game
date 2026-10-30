// 1인칭 컨트롤러: 포인터 락·WASD·점프·중력·섬 가장자리 낙하·장식/보스 충돌·넉백·슬로우
// 시선 규약은 서버 combat.lookDir 와 같다: yaw=0 → +z, yaw=+π/2 → −x, pitch>0 → 위
import { MAP, PLAYER, GRAVITY } from "/shared/constants.js";

const EYE = PLAYER.eyeHeight; // 카메라 높이 = 발(pos.y) + 1.6 (서버 근접 판정·원격 캐릭터 머리 높이와 동일)
const RADIUS = 0.35;          // 플레이어 수평 반지름
const KNOCK_DECAY = 0.4;      // 넉백 감쇠 시간(초)
const KNOCK_SCALE = 2 / KNOCK_DECAY; // 서버 임펄스는 "밀리는 거리(m)" — 선형 감쇠 속도로 바꾸면 거리 = v0·0.4/2
const LOOK_SPEED = 0.0022;    // 라디안/픽셀 × 감도
const JUMP_V = Math.sqrt(2 * GRAVITY * PLAYER.jumpHeight);

export function createController({ camera, dom, map, getBossAabb = () => null, sensitivity = 1 }) {
  const ctrl = {
    pos: { x: 0, y: MAP.groundY, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    knock: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    onGround: true,
    locked: false,
    sensitivity,
    enabled: true,            // 사망·관전 중엔 false (입력 무시, 물리 정지)
    sprintAllowed: false,     // 신발 버프 중이면 true (게임이 스냅샷으로 갱신)
    sprintMul: 1.7,
    sprinting: false,
  };
  const keys = new Set();
  let fellReported = false;
  let slow = { factor: 1, until: 0 };
  let clock = 0;
  let knock0 = { x: 0, z: 0 }, knockT = KNOCK_DECAY;

  // ----- 입력 -----
  // 물리 키 위치(e.code)로 판단한다 — 한/영 상태가 한글이면 e.key 가 "ㅈ" 처럼 와서 WASD 가 안 먹기 때문
  const CODE_TO_KEY = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", Space: " ", ArrowUp: "w", ArrowDown: "s", ArrowLeft: "a", ArrowRight: "d", ShiftLeft: "shift", ShiftRight: "shift" };
  const onKey = (down) => (e) => {
    if (e.repeat) return;
    const k = CODE_TO_KEY[e.code];
    if (!k) return;
    if (down) keys.add(k); else keys.delete(k);
    if (ctrl.locked) e.preventDefault();
  };
  const onMouse = (e) => {
    if (!ctrl.locked || !ctrl.enabled) return;
    const s = LOOK_SPEED * ctrl.sensitivity;
    ctrl.yaw += e.movementX * s;
    ctrl.pitch = Math.max(-1.5, Math.min(1.5, ctrl.pitch - e.movementY * s));
  };
  const onLockChange = () => {
    ctrl.locked = document.pointerLockElement === dom;
    if (!ctrl.locked) keys.clear();
  };
  window.addEventListener("keydown", onKey(true));
  window.addEventListener("keyup", onKey(false));
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("mousemove", onMouse);
  document.addEventListener("pointerlockchange", onLockChange);

  // ----- 충돌 -----
  function pushOutOfBox(p, cx, cz, hw, hd) {
    const dx = p.x - cx, dz = p.z - cz;
    const ox = hw + RADIUS - Math.abs(dx), oz = hd + RADIUS - Math.abs(dz);
    if (ox <= 0 || oz <= 0) return null;
    return ox < oz ? { x: Math.sign(dx || 1) * ox, z: 0 } : { x: 0, z: Math.sign(dz || 1) * oz };
  }
  function overlapsBoss(p, box) {
    if (!box) return false;
    return p.x + RADIUS > box.min.x && p.x - RADIUS < box.max.x && p.z + RADIUS > box.min.z && p.z - RADIUS < box.max.z && p.y < box.max.y && p.y + 1.8 > box.min.y;
  }

  function forward() { return { x: -Math.sin(ctrl.yaw), z: Math.cos(ctrl.yaw) }; }
  function right() { return { x: -Math.cos(ctrl.yaw), z: -Math.sin(ctrl.yaw) }; }

  // ----- 틱 -----
  function update(dt) {
    clock += dt;
    let fell = false;
    const p = ctrl.pos;

    // 입력 → 목표 수평 속도 (락 없거나 비활성이면 0)
    let ix = 0, iz = 0;
    if (ctrl.locked && ctrl.enabled) {
      const f = forward(), r = right();
      if (keys.has("w")) { ix += f.x; iz += f.z; }
      if (keys.has("s")) { ix -= f.x; iz -= f.z; }
      if (keys.has("d")) { ix += r.x; iz += r.z; }
      if (keys.has("a")) { ix -= r.x; iz -= r.z; }
      const l = Math.hypot(ix, iz);
      if (l > 0) { ix /= l; iz /= l; }
      if (keys.has(" ") && ctrl.onGround) { ctrl.vel.y = JUMP_V; ctrl.onGround = false; }
    }
    ctrl.sprinting = ctrl.locked && ctrl.enabled && ctrl.sprintAllowed && keys.has("shift") && (ix !== 0 || iz !== 0);
    const speed = PLAYER.speed * (clock < slow.until ? slow.factor : 1) * (ctrl.sprinting ? ctrl.sprintMul : 1);
    ctrl.vel.x = ix * speed + ctrl.knock.x;
    ctrl.vel.z = iz * speed + ctrl.knock.z;

    // 넉백 감쇠: 시작 속도에서 0.4초 동안 선형으로 0 까지 (이동 거리 = v0 × 0.2 = 서버 임펄스 m)
    knockT += dt;
    const f = Math.max(0, 1 - knockT / KNOCK_DECAY);
    ctrl.knock.x = knock0.x * f; ctrl.knock.z = knock0.z * f;

    // 중력
    ctrl.vel.y -= GRAVITY * dt;

    const bossBox = getBossAabb();

    // 수평 이동 + 장식 충돌
    p.x += ctrl.vel.x * dt;
    p.z += ctrl.vel.z * dt;
    for (const d of map.decorations) {
      if (p.y >= MAP.groundY + d.h) continue;
      const push = pushOutOfBox(p, d.x, d.z, d.w / 2, d.d / 2);
      if (push) { p.x += push.x; p.z += push.z; }
    }
    // 보스 몸체는 단단하다: 걸어 들어가도, 보스가 밀고 들어와도 전부 밀려난다(가장자리면 떨어질 수 있음)
    if (bossBox && overlapsBoss(p, bossBox)) {
      const push = pushOutOfBox(p, (bossBox.min.x + bossBox.max.x) / 2, (bossBox.min.z + bossBox.max.z) / 2, (bossBox.max.x - bossBox.min.x) / 2, (bossBox.max.z - bossBox.min.z) / 2);
      if (push) {
        p.x += push.x; p.z += push.z;
      }
    }

    // 수직 이동 + 지면 (섬 안에서만 땅이 있다)
    p.y += ctrl.vel.y * dt;
    const onIsland = Math.abs(p.x) <= map.half && Math.abs(p.z) <= map.half;
    if (onIsland && p.y <= MAP.groundY) {
      p.y = MAP.groundY;
      if (ctrl.vel.y < 0) ctrl.vel.y = 0;
      ctrl.onGround = true;
    } else {
      ctrl.onGround = false;
    }

    if (p.y < MAP.fallY && !fellReported) { fellReported = true; fell = true; }

    camera.rotation.order = "YXZ";
    camera.position.set(p.x, p.y + EYE, p.z);
    camera.rotation.y = Math.PI - ctrl.yaw;
    camera.rotation.x = ctrl.pitch;
    return { fell };
  }

  function applyKnock(impulse) {
    knock0 = { x: ctrl.knock.x + (impulse.x || 0) * KNOCK_SCALE, z: ctrl.knock.z + (impulse.z || 0) * KNOCK_SCALE };
    knockT = 0;
    if (impulse.y) { ctrl.vel.y = Math.max(ctrl.vel.y, 0) + impulse.y * KNOCK_SCALE; ctrl.onGround = false; }
  }
  function setSlow(factor, dur) { slow = { factor, until: clock + dur }; }
  function lock() { if (document.pointerLockElement !== dom) dom.requestPointerLock?.(); }
  function unlock() { if (document.pointerLockElement === dom) document.exitPointerLock?.(); }
  function reset(spawn) {
    ctrl.pos = { x: spawn.x, y: spawn.y ?? MAP.groundY, z: spawn.z };
    ctrl.vel = { x: 0, y: 0, z: 0 };
    ctrl.knock = { x: 0, y: 0, z: 0 };
    knock0 = { x: 0, z: 0 }; knockT = KNOCK_DECAY;
    ctrl.onGround = true;
    fellReported = false;
    slow = { factor: 1, until: 0 };
    if (spawn.yaw !== undefined) ctrl.yaw = spawn.yaw;
  }
  function lookDir() {
    const c = Math.cos(ctrl.pitch);
    return { x: -Math.sin(ctrl.yaw) * c, y: Math.sin(ctrl.pitch), z: Math.cos(ctrl.yaw) * c };
  }

  Object.assign(ctrl, { update, applyKnock, setSlow, lock, unlock, reset, lookDir });
  return ctrl;
}
