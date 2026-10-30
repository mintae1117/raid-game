// 게임 장면 조립: 장면·컨트롤러·누나·월드·무기·HUD·효과음을 묶고 서버 메시지를 처리한다.
import * as THREE from "three";
import { createMap } from "/shared/map.js";
import { BOSS, WEAPONS } from "/shared/constants.js";

const bootsLeftOf = (me, snapT) => (me && me.bootsUntil > snapT ? me.bootsUntil - snapT : 0);
import { createScene, createRenderer } from "./scene.js";
import { createController } from "./controller.js";
import { createBossView } from "./boss-view.js";
import { createWorldView } from "./world-view.js";
import { createWeaponView } from "./weapon-view.js";
import { createHud } from "./hud.js";
import { sfx } from "./audio.js";
import { createHitFx } from "./hit-fx.js";

const TELE_TEXT = { charge: "누나가 돌진 준비! 옆으로!", stomp: "누나가 땅을 찍으려 한다! 점프!", bite: "누나가 문다! 점프!", roar: "누나의 포효! 점프!" };
const INPUT_MS = 50;

export function startGame(startMsg, net, { myId, name, sensitivity = 1, spectator = false, isHost = () => false }) {
  const map = createMap(startMsg.seed);
  const wrap = document.querySelector("#canvas-wrap");
  wrap.innerHTML = "";
  const renderer = createRenderer(wrap);
  const world = createScene(renderer, map);
  world.scene.add(world.camera);
  const bossView = createBossView(world.scene);
  const worldView = createWorldView(world.scene);
  const weaponView = createWeaponView(world.camera);
  const hitFx = createHitFx(world.scene);
  const hudEl = document.querySelector("#hud");
  hudEl.hidden = false;
  const hud = createHud(hudEl);
  hud.setMap(startMsg.map);

  const g = {
    snap: null, me: null, snapCount: 0, boss: null,
    initialized: false, dead: false, deathAt: 0, deathLives: 0,
    spectator, out: false, ended: false, won: null, running: true,
    lastInputAt: 0, lastAttackAt: -Infinity, shake: 0, orbit: 0, names: new Map(),
  };
  const ctrl = createController({ camera: world.camera, dom: renderer.domElement, map, getBossAabb: bossAabb, sensitivity });
  ctrl.enabled = !spectator;

  window.__nuna = window.__nuna || {};
  window.__nuna.ctrl = ctrl;
  window.__nuna.game = g;
  Object.defineProperty(window.__nuna, "snapCount", { configurable: true, get: () => g.snapCount });
  if (window.__nuna.state) window.__nuna.state.game = g;

  hud.note(`${startMsg.map}에 입장`);
  const noteTimer = setTimeout(() => hud.note(spectator ? "관전 중 — 다음 판에 참여합니다" : null), 2500);

  function bossAabb() {
    if (!g.boss) return null;
    const { w, h, d } = BOSS.size, p = g.boss.pos;
    return { min: { x: p.x - w / 2, y: p.y, z: p.z - d / 2 }, max: { x: p.x + w / 2, y: p.y + h, z: p.z + d / 2 } };
  }
  const canPlay = () => g.running && !g.ended && !g.spectator && !g.dead && !g.out && g.initialized;
  const nameOf = (id) => g.names.get(id) || "누군가";
  const weaponDef = () => (g.me?.activeSlot === 2 && g.me.special ? WEAPONS[g.me.special.kind] : WEAPONS[g.me?.melee || "wood"]);

  // ----- 입력 -----
  function onClick() { if (canPlay() && !ctrl.locked) ctrl.lock(); }
  let mouseHeld = false;
  function onMouseDown(e) { if (e.button === 0) { mouseHeld = true; if (ctrl.locked && canPlay()) attack(); } }
  function onMouseUp(e) { if (e.button === 0) mouseHeld = false; }
  function onKey(e) {
    if (!canPlay()) return;
    if (e.code === "Digit1" || e.code === "Numpad1") net.send({ type: "slot", n: 1 });
    else if (e.code === "Digit2" || e.code === "Numpad2") net.send({ type: "slot", n: 2 });
  }
  function onWheel() { if (canPlay() && g.me) net.send({ type: "slot", n: g.me.activeSlot === 2 ? 1 : 2 }); }
  function attack() {
    const now = performance.now() / 1000;
    const def = weaponDef();
    if (now - g.lastAttackAt < def.cool) return;
    g.lastAttackAt = now;
    net.send({ type: "attack", dir: ctrl.lookDir() });
    weaponView.swing();
    sfx(def.slot === "melee" ? "swing" : def.kind === "gun" ? "gun" : "shoot");
  }
  renderer.domElement.addEventListener("click", onClick);
  renderer.domElement.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("keydown", onKey);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("resize", world.resize);

  // ----- 루프 -----
  let last = performance.now();
  let raf = 0;
  function loop(now) {
    if (!g.running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (canPlay()) {
      if (mouseHeld && ctrl.locked && weaponDef().kind === "gun") attack(); // 기관총: 누르고 있으면 연사
      const r = ctrl.update(dt);
      if (r.fell) net.send({ type: "fell" });
      if (now - g.lastInputAt >= INPUT_MS) {
        g.lastInputAt = now;
        net.send({ type: "input", pos: { x: ctrl.pos.x, y: ctrl.pos.y, z: ctrl.pos.z }, yaw: ctrl.yaw, pitch: ctrl.pitch, t: now });
      }
    } else if (g.boss) {
      // 사망·탈락·관전·종료: 누나 주위를 도는 카메라
      g.orbit += dt * 0.25;
      const b = g.boss.pos;
      world.camera.position.set(b.x + Math.cos(g.orbit) * 14, b.y + 7, b.z + Math.sin(g.orbit) * 14);
      world.camera.lookAt(b.x, b.y + 2, b.z);
    }
    if (g.shake > 0) {
      world.camera.position.x += (Math.random() - 0.5) * g.shake;
      world.camera.position.y += (Math.random() - 0.5) * g.shake;
      g.shake = Math.max(0, g.shake - dt * 1.2);
    }
    if (g.dead && !g.out) {
      const left = 3 - (now - g.deathAt) / 1000;
      hud.setDeath(Math.max(0, left), g.deathLives);
    }
    weaponView.holder.visible = canPlay();
    hud.lockHint(canPlay() && !ctrl.locked);
    if (g.boss) bossView.apply(g.boss, dt);
    if (g.snap) worldView.apply(g.snap, myId);
    weaponView.update(dt, Math.hypot(ctrl.vel.x, ctrl.vel.z) / 5);
    world.camera.fov += ((ctrl.sprinting ? 84 : 75) - world.camera.fov) * Math.min(1, dt * 8); // 질주 시 시야 살짝 넓힘
    world.camera.updateProjectionMatrix();
    hitFx.update(dt);
    world.update(dt);
    renderer.render(world.scene, world.camera);
  }
  raf = requestAnimationFrame(loop);

  // ----- 메시지 -----
  function onSnap(msg) {
    g.snap = msg;
    g.snapCount++;
    g.boss = msg.boss;
    for (const p of msg.players) g.names.set(p.id, p.name);
    const me = msg.players.find((p) => p.id === myId) || null;
    g.me = me;
    if (me) {
      if (!g.initialized) {
        const yaw = Math.atan2(-(msg.boss.pos.x - me.pos.x), msg.boss.pos.z - me.pos.z);
        ctrl.reset({ ...me.pos, yaw });
        g.initialized = true;
      }
      if (me.alive && g.dead) {           // 서버가 부활시킴
        g.dead = false;
        ctrl.enabled = true;
        ctrl.reset({ ...me.pos });
        hud.setDeath(null);
        hud.toast("부활!", "good");
      } else if (!me.alive && !g.dead) {  // 이벤트를 놓쳤을 때의 보정
        markDead(me.lives);
      }
      if (me.lives === 0 && !g.out) { g.out = true; g.dead = true; hud.setDeath(null); hud.note("목숨을 모두 잃었어요 — 관전 중"); ctrl.unlock(); }
      // 서버가 내 이동을 거부해 크게 어긋나면 서버 위치로 맞춘다
      if (me.alive && Math.hypot(ctrl.pos.x - me.pos.x, ctrl.pos.z - me.pos.z) > 4) ctrl.reset({ ...me.pos, yaw: ctrl.yaw });
      const bootsLeft = bootsLeftOf(me, msg.t);
      ctrl.sprintAllowed = bootsLeft > 0;
      ctrl.sprintMul = WEAPONS.boots.sprintMul;
      hud.setSelf({ hp: me.hp, lives: me.lives, melee: me.melee, special: me.special, activeSlot: me.activeSlot, bootsLeft });
      weaponView.setWeapon(me.activeSlot === 2 && me.special ? me.special.kind : me.melee);
    }
    hud.setBoss(msg.boss);
    hud.setTeam(msg.players.map((p) => ({ name: p.name, hp: p.hp, lives: p.lives, alive: p.alive, connected: p.connected, isMe: p.id === myId })));
    if (!g.ended) {
      if (msg.boss.telegraph) hud.telegraph(TELE_TEXT[msg.boss.telegraph.kind] || null);
      else if (msg.boss.state === "roar") hud.telegraph(TELE_TEXT.roar);
      else if (msg.boss.state === "stunned") hud.telegraph("누나가 비틀거린다! 때려!");
      else hud.telegraph(null);
    }
  }

  // 타격 지점을 모를 때(원격 근접 등): 누나 중심에서 내 쪽으로 3m 당긴 지점
  function hitPointNearBoss() {
    const b = g.boss?.pos || { x: 0, y: 1, z: 0 };
    const dx = ctrl.pos.x - b.x, dz = ctrl.pos.z - b.z, l = Math.hypot(dx, dz) || 1;
    return { x: b.x + (dx / l) * 3, y: b.y + 2.4, z: b.z + (dz / l) * 3 };
  }

  function markDead(lives) {
    g.dead = true;
    g.deathAt = performance.now();
    g.deathLives = lives;
    ctrl.enabled = false;
    g.orbit = Math.random() * Math.PI * 2;
    sfx("death");
  }

  function onEvent(e) {
    switch (e.type) {
      case "hit": {
        const mine = e.by === myId;
        const pos = e.pos || hitPointNearBoss();
        hitFx.spawnDamage(pos, e.amount, mine);
        hitFx.burst(pos, { count: mine ? 10 : 5, speed: mine ? 5 : 3 });
        bossView.flash();
        if (mine) { sfx("hit"); g.shake = Math.max(g.shake, 0.14); hud.hitMarker(); }
        break;
      }
      case "playerHit": if (e.id === myId) { sfx("hurt"); g.shake = Math.max(g.shake, e.kind === "stomp" ? 0.35 : 0.2); } break;
      case "death":
        hud.toast(e.id === myId ? `쓰러졌다… (남은 목숨 ${e.lives})` : `${nameOf(e.id)} 쓰러짐 (남은 목숨 ${e.lives})`, "bad");
        if (e.id === myId && !g.dead) markDead(e.lives);
        break;
      case "pickup":
        hud.toast(e.kind === "boots" ? `${e.id === myId ? "나" : nameOf(e.id)}: 신발 획득 — Shift 로 ${WEAPONS.boots.duration}초간 질주` : `${e.id === myId ? "나" : nameOf(e.id)}: ${WEAPONS[e.kind]?.label ?? e.kind} 획득`, "good");
        if (e.id === myId) sfx("pickup");
        break;
      case "phase": hud.toast(`누나가 ${e.phase}단계로! 더 빨라진다`, "bad"); sfx("phase"); break;
      case "telegraph": sfx("telegraph"); hud.telegraph(TELE_TEXT[e.kind] || null); break;
      case "stomp": sfx("stomp"); g.shake = Math.max(g.shake, 0.25); break;
      case "bite": sfx("bite"); bossView.bite(); break;
      case "shoot":
        if (e.kind === "gun" && e.from && e.to) { hitFx.tracer(e.from, e.to); if (e.id !== myId) sfx("gun"); }
        break;
      case "stun": sfx("stun"); g.shake = Math.max(g.shake, 0.25); hud.toast("누나가 장애물에 부딪혔다! 지금이 기회!", "good"); break;
      case "roar":
        sfx("roar"); g.shake = Math.max(g.shake, 0.15);
        if (e.slowIds?.includes(myId)) { ctrl.setSlow(BOSS.roar.slow, BOSS.roar.dur); hud.toast("포효에 느려졌다!", "bad"); }
        break;
      case "explode": sfx("explode"); g.shake = Math.max(g.shake, 0.3); if (e.pos) hitFx.burst(e.pos, { color: 0xff8a2a, count: 18, speed: 7 }); break;
      case "win": case "lose": finish(e.type === "win", e.stats); break;
      case "disconnected": hud.toast(`${nameOf(e.id)} 연결 끊김 (60초 안에 복귀 가능)`); break;
      case "reconnected": hud.toast(`${nameOf(e.id)} 돌아옴`, "good"); break;
      case "left": hud.toast(`${nameOf(e.id)} 탈락 (연결 끊김)`, "bad"); break;
      default: break;
    }
  }

  function finish(won, stats) {
    g.ended = true;
    g.won = won;
    ctrl.enabled = false;
    ctrl.unlock();
    hud.telegraph(null);
    hud.setDeath(null);
    hud.note(won ? "누나를 쓰러뜨렸다!" : "전멸…");
    sfx(won ? "win" : "lose");
    setTimeout(() => {
      if (!g.running) return;
      hud.note(null);
      hud.showResult({ won, stats, isHost: isHost(), onRestart: () => net.send({ type: "restart" }) });
    }, won ? 2500 : 800);
  }

  function onMessage(msg) {
    if (msg.type === "snap") onSnap(msg);
    else if (msg.type === "event") onEvent(msg.event);
    else if (msg.type === "knock") { ctrl.applyKnock(msg.impulse); g.shake = Math.max(g.shake, 0.2); }
  }

  function stop() {
    g.running = false;
    cancelAnimationFrame(raf);
    clearTimeout(noteTimer);
    renderer.domElement.removeEventListener("click", onClick);
    renderer.domElement.removeEventListener("mousedown", onMouseDown);
  window.removeEventListener("mouseup", onMouseUp);
    renderer.domElement.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", world.resize);
    ctrl.unlock();
    hud.hideResult();
    hudEl.hidden = true;
    renderer.dispose();
    wrap.innerHTML = "";
  }

  function setHost(isHostNow) { hud.setResultHost(isHostNow); }

  return { stop, onMessage, setHost, get won() { return g.won; }, ctrl, hud };
}
