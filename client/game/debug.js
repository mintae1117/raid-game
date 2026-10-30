// ?scene=1 — 로비 없이 장면만 띄우는 디버그/스모크 경로 (Task 12 에서 컨트롤러를 붙인다)
import { createMap } from "/shared/map.js";
import { createScene, createRenderer } from "./scene.js";
import { createController } from "./controller.js";
import { createBossView } from "./boss-view.js";
import { createWorldView } from "./world-view.js";
import { createWeaponView } from "./weapon-view.js";
import { createHud } from "./hud.js";
import { sfx } from "./audio.js";
import { createHitFx } from "./hit-fx.js";

export async function startDebugScene() {
  const map = createMap(1);
  const renderer = createRenderer(document.querySelector("#canvas-wrap"));
  const world = createScene(renderer, map);
  const ctrl = createController({ camera: world.camera, dom: renderer.domElement, map, sensitivity: 1 });
  ctrl.reset({ x: 0, y: 1, z: 6, yaw: Math.PI });
  renderer.domElement.addEventListener("click", () => ctrl.lock());
  window.__nuna.ctrl = ctrl;
  window.__nuna.fellCount = 0;
  window.addEventListener("resize", world.resize);

  // &mock=1 : 가짜 스냅샷으로 누나·플레이어·픽업·투사체 렌더 확인
  const mock = new URLSearchParams(location.search).has("mock");
  const bossView = createBossView(world.scene);
  const worldView = createWorldView(world.scene);
  window.__nuna.bossMeshCount = bossView.meshCount;
  const weaponView = createWeaponView(world.camera);
  const hitFx = createHitFx(world.scene);
  let nextHitAt = 1;
  world.scene.add(world.camera);
  weaponView.setWeapon("wood");
  const hudEl = document.querySelector("#hud");
  const hud = createHud(hudEl);
  window.__nuna.hud = hud;
  if (mock) {
    hudEl.hidden = false;
    hud.setMap(map.name);
    renderer.domElement.addEventListener("mousedown", () => { weaponView.swing(); sfx("swing"); });
    window.addEventListener("keydown", (e) => { if (e.key === "1") weaponView.setWeapon("diamond"); if (e.key === "2") weaponView.setWeapon("bow"); if (e.key === "3") weaponView.setWeapon("tnt"); });
  }
  const TELE = { charge_tele: "누나가 돌진 준비! 옆으로!", stomp_tele: "누나가 땅을 찍으려 한다! 점프!", bite_tele: "누나가 문다! 점프!", roar_tele: "누나의 포효! 점프!", roar: "누나의 포효!" };
  const STATES = ["chase", "bite_tele", "charge_tele", "charging", "stunned", "stomp_tele", "stomping", "roar_tele", "roar", "dead"];
  let mockT = 0;
  function mockSnap(dt) {
    mockT += dt;
    const a = mockT * 0.4;
    const state = STATES[Math.floor(mockT / 2) % STATES.length];
    return {
      players: [
        { id: "me", name: "나", pos: { x: 0, y: 1, z: 6 }, yaw: Math.PI, hp: 100, lives: 3, alive: true, connected: true, melee: "wood", special: null, activeSlot: 1, bootsUntil: 20 },
        { id: "p2", name: "친구", pos: { x: Math.cos(a) * 6, y: 1, z: Math.sin(a) * 6 }, yaw: a, hp: 80, lives: 3, alive: true, connected: true, melee: "iron", special: null, activeSlot: 1 },
        { id: "p3", name: "동생", pos: { x: -5, y: 1, z: -2 }, yaw: 0, hp: 50, lives: 2, alive: true, connected: true, melee: "iron", special: { kind: "gun", ammo: 40 }, activeSlot: 2 },
      ],
      boss: { pos: { x: Math.cos(-a) * 8, y: 1, z: Math.sin(-a) * 8 }, yaw: -a + Math.PI / 2, hp: 5000, maxHp: 7000, state, phase: 1, telegraph: null },
      pickups: [{ id: 1, kind: "diamond", x: 3, z: 3 }, { id: 2, kind: "bow", x: -4, z: 4 }, { id: 3, kind: "tnt", x: 5, z: -5 }, { id: 4, kind: "gun", x: -7, z: -7 }, { id: 5, kind: "boots", x: 1.5, z: 2.5 }],
      projectiles: [{ id: 1, kind: "arrow", pos: { x: -3 + (mockT % 2) * 6, y: 2, z: 0 } }, { id: 2, kind: "tnt", pos: { x: 2, y: 1.3, z: -3 } }],
    };
  }
  let last = performance.now();
  let frames = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (ctrl.update(dt).fell) window.__nuna.fellCount++;
    if (mock) {
      const snap = mockSnap(dt); bossView.apply(snap.boss, dt); worldView.apply(snap, "me");
      const me = snap.players[0];
      hud.setSelf({ hp: me.hp, lives: me.lives, melee: me.melee, special: me.special, activeSlot: me.activeSlot, bootsLeft: Math.max(0, me.bootsUntil - mockT) });
      hud.setBoss(snap.boss);
      hud.setTeam(snap.players.map((p) => ({ name: p.name, hp: p.hp, lives: p.lives, alive: p.alive, connected: p.connected, isMe: p.id === "me" })));
      hud.telegraph(TELE[snap.boss.state] || null);
      if (mockT >= nextHitAt) {
        nextHitAt = mockT + 0.5;
        const b = snap.boss.pos, pos = { x: b.x, y: b.y + 2.4, z: b.z + 3 };
        hitFx.spawnDamage(pos, 56, true); hitFx.burst(pos, { count: 10, speed: 5 }); bossView.flash(); hud.hitMarker();
        hitFx.tracer({ x: 0.4, y: 2.4, z: 5 }, pos);
      }
      hitFx.update(dt);
    }
    weaponView.update(dt, Math.hypot(ctrl.vel.x, ctrl.vel.z) / 5);
    world.update(dt);
    renderer.render(world.scene, world.camera);
    frames++;
    if (frames === 2) window.__nuna.sceneReady = true;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.__nuna.world = world;
  window.__nuna.map = map;
  window.__nuna.renderer = renderer;
}
