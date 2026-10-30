// 원격 플레이어·무기 픽업·투사체 렌더. 스냅샷을 보간해서 그린다.
import * as THREE from "three";
import { skinTexture, weaponColor } from "./textures.js";
import { makeLabel } from "./labels.js";

const LERP = 14;

export function weaponMesh(kind, scale = 1) {
  const color = new THREE.Color(weaponColor(kind));
  const mat = new THREE.MeshLambertMaterial({ color, emissive: color.clone().multiplyScalar(0.25) });
  const g = new THREE.Group();
  if (kind === "bow") {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), mat);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.0, 0.03), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    s.position.x = 0.14;
    g.add(m, s);
  } else if (kind === "gun") {
    // 기관총: 몸통 + 총열 + 탄창 + 손잡이
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2b33 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.8), mat); body.position.y = 0.1;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), dark); barrel.position.set(0, 0.16, -0.6);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.16), dark); mag.position.set(0, -0.12, 0.05);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), dark); grip.position.set(0, -0.08, 0.3);
    g.add(body, barrel, mag, grip);
  } else if (kind === "boots") {
    // 신발 한 켤레: 주황 부츠 두 짝 + 흰 밑창
    const sole = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
    for (const x of [-0.18, 0.18]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.42), mat); b.position.set(x, 0.15, 0);
      const toe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.2), mat); toe.position.set(x, 0.08, -0.3);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.64), sole); s.position.set(x, -0.02, -0.1);
      g.add(b, toe, s);
    }
  } else if (kind === "tnt") {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.62), new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }));
    g.add(m, band);
  } else {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.08), mat);
    blade.position.y = 0.3;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.12), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
    guard.position.y = -0.18;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), new THREE.MeshLambertMaterial({ color: 0x4a3220 }));
    grip.position.y = -0.4;
    g.add(blade, guard, grip);
  }
  g.scale.setScalar(scale);
  return g;
}

function makePlayerModel(name, seed) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ map: skinTexture(seed) });
  const shirt = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL((seed * 0.37) % 1, 0.55, 0.5) });
  const pants = new THREE.MeshLambertMaterial({ color: 0x3a4a7a });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin); head.position.y = 1.55;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25), shirt); body.position.y = 0.95;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), shirt); armL.position.set(-0.37, 0.95, 0);
  const armR = armL.clone(); armR.position.x = 0.37;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.6, 0.24), pants); legL.position.set(-0.13, 0.3, 0);
  const legR = legL.clone(); legR.position.x = 0.13;
  [head, body, armL, armR, legL, legR].forEach((m) => { m.castShadow = true; g.add(m); });
  const hand = new THREE.Group(); hand.position.set(0.37, 0.6, -0.25); armR.add(hand); hand.position.set(0, -0.35, -0.2);
  const label = makeLabel(name, { scale: 1.2 }); label.position.y = 2.1; g.add(label);
  return { g, armL, armR, legL, legR, hand, label };
}

export function createWorldView(scene) {
  const players = new Map();     // id → { model, cur, weaponKind, weaponMesh }
  const pickups = new Map();     // id → mesh
  const projectiles = new Map(); // id → { mesh, last }
  let t = 0, lastNow = performance.now();

  function apply(snap, myId) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
    t += dt;
    const k = Math.min(1, LERP * dt);

    // ----- 원격 플레이어 -----
    const seen = new Set();
    snap.players.forEach((p, idx) => {
      if (p.id === myId) return;
      seen.add(p.id);
      let v = players.get(p.id);
      if (!v) {
        const model = makePlayerModel(p.name, idx + 1);
        scene.add(model.g);
        v = { model, cur: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw }, weaponKind: null, weaponMesh: null, moving: 0 };
        players.set(p.id, v);
      }
      const visible = p.alive && p.connected;
      v.model.g.visible = visible;
      if (!visible) { v.cur.x = p.pos.x; v.cur.y = p.pos.y; v.cur.z = p.pos.z; return; }
      const px = v.cur.x, pz = v.cur.z;
      v.cur.x += (p.pos.x - v.cur.x) * k; v.cur.y += (p.pos.y - v.cur.y) * k; v.cur.z += (p.pos.z - v.cur.z) * k;
      let dy = p.yaw - v.cur.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); v.cur.yaw += dy * k;
      const speed = dt > 0 ? Math.hypot(v.cur.x - px, v.cur.z - pz) / dt : 0;
      v.moving += (Math.min(1, speed / 3) - v.moving) * Math.min(1, dt * 10);
      v.model.g.position.set(v.cur.x, v.cur.y, v.cur.z);
      v.model.g.rotation.y = Math.PI - v.cur.yaw;
      const sw = Math.sin(t * 10) * 0.7 * v.moving;
      v.model.legL.rotation.x = sw; v.model.legR.rotation.x = -sw;
      v.model.armL.rotation.x = -sw; v.model.armR.rotation.x = sw * 0.5;
      const kind = p.activeSlot === 2 && p.special ? p.special.kind : p.melee;
      if (kind !== v.weaponKind) {
        if (v.weaponMesh) v.model.hand.remove(v.weaponMesh);
        v.weaponMesh = weaponMesh(kind, 0.8);
        v.weaponMesh.rotation.x = -Math.PI / 2 + 0.6;
        v.model.hand.add(v.weaponMesh);
        v.weaponKind = kind;
      }
    });
    for (const [id, v] of players) if (!seen.has(id)) { scene.remove(v.model.g); players.delete(id); }

    // ----- 픽업 -----
    const seenP = new Set();
    for (const pk of snap.pickups || []) {
      seenP.add(pk.id);
      let m = pickups.get(pk.id);
      if (!m) {
        m = weaponMesh(pk.kind, 1.1);
        const glow = new THREE.PointLight(new THREE.Color(weaponColor(pk.kind)), 6, 6, 2);
        glow.position.y = 0.3;
        m.add(glow);
        scene.add(m);
        pickups.set(pk.id, m);
      }
      m.position.set(pk.x, 1.7 + Math.sin(t * 2.5 + pk.id) * 0.15, pk.z);
      m.rotation.y = t * 1.5;
    }
    for (const [id, m] of pickups) if (!seenP.has(id)) { scene.remove(m); pickups.delete(id); }

    // ----- 투사체 -----
    const seenJ = new Set();
    for (const pr of snap.projectiles || []) {
      seenJ.add(pr.id);
      let v = projectiles.get(pr.id);
      if (!v) {
        const mesh = pr.kind === "tnt"
          ? new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xe23c3c, emissive: 0x550000 }))
          : new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.8), new THREE.MeshLambertMaterial({ color: 0xd9c9a3 }));
        scene.add(mesh);
        v = { mesh, last: { ...pr.pos } };
        projectiles.set(pr.id, v);
        mesh.position.set(pr.pos.x, pr.pos.y, pr.pos.z);
      }
      const prev = v.mesh.position.clone();
      v.mesh.position.set(pr.pos.x, pr.pos.y, pr.pos.z);
      if (pr.kind === "tnt") {
        const blink = Math.sin(t * 16) > 0;
        v.mesh.material.emissive.setHex(blink ? 0xff4040 : 0x330000);
        v.mesh.rotation.y += dt * 4;
      } else if (prev.distanceToSquared(v.mesh.position) > 1e-4) {
        v.mesh.lookAt(v.mesh.position.clone().add(v.mesh.position.clone().sub(prev)));
      }
    }
    for (const [id, v] of projectiles) if (!seenJ.has(id)) { scene.remove(v.mesh); projectiles.delete(id); }
  }

  return { apply, players, pickups, projectiles };
}
