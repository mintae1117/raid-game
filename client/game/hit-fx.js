// 타격 이펙트: 떠오르는 피해 숫자(스프라이트) + 튀는 파편 큐브. 매 프레임 update(dt) 로 수명 관리.
import * as THREE from "three";

export function createHitFx(scene) {
  const items = [];
  const box = new THREE.BoxGeometry(0.18, 0.18, 0.18);

  function numberTexture(text, color) {
    const c = document.createElement("canvas");
    c.width = 160; c.height = 80;
    const ctx = c.getContext("2d");
    ctx.font = "900 56px ui-monospace, Menlo, 'Apple SD Gothic Neo', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 8; ctx.strokeStyle = "#000"; ctx.strokeText(text, 80, 42);
    ctx.fillStyle = color; ctx.fillText(text, 80, 42);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function spawnDamage(pos, amount, mine) {
    const tex = numberTexture(String(Math.round(amount)), mine ? "#ffd84a" : "#ffffff");
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const s = mine ? 1.5 : 1.0;
    sp.scale.set(2.0 * s, 1.0 * s, 1);
    sp.position.set(pos.x + (Math.random() - 0.5) * 0.8, pos.y + 0.2, pos.z + (Math.random() - 0.5) * 0.8);
    sp.renderOrder = 20;
    scene.add(sp);
    items.push({ obj: sp, vel: { x: (Math.random() - 0.5) * 0.6, y: 2.4, z: (Math.random() - 0.5) * 0.6 }, life: 0, max: 0.85, kind: "num", base: s });
  }

  function burst(pos, { color = 0xff9ab8, count = 8, speed = 4 } = {}) {
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(box, mat);
      m.position.set(pos.x, pos.y, pos.z);
      const a = Math.random() * Math.PI * 2, u = Math.random();
      const v = speed * (0.5 + Math.random() * 0.8);
      items.push({ obj: m, vel: { x: Math.cos(a) * v * (0.4 + u), y: 2 + Math.random() * 3, z: Math.sin(a) * v * (0.4 + u) }, spin: (Math.random() - 0.5) * 20, life: 0, max: 0.5 + Math.random() * 0.25, kind: "chip" });
      scene.add(m);
    }
  }

  // 기관총 궤적: from→to 를 잇는 가는 막대, 0.08초 뒤 사라짐
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9 });
  function tracer(from, to) {
    const a = new THREE.Vector3(from.x, from.y - 0.25, from.z), b = new THREE.Vector3(to.x, to.y, to.z);
    const len = a.distanceTo(b);
    if (len < 0.1) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, len), tracerMat.clone());
    m.position.copy(a).lerp(b, 0.5);
    m.lookAt(b);
    scene.add(m);
    items.push({ obj: m, vel: { x: 0, y: 0, z: 0 }, life: 0, max: 0.08, kind: "tracer" });
  }

  function update(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.life += dt;
      const o = it.obj;
      o.position.x += it.vel.x * dt; o.position.y += it.vel.y * dt; o.position.z += it.vel.z * dt;
      if (it.kind === "tracer") {
        o.material.opacity = 0.9 * (1 - it.life / it.max);
      } else if (it.kind === "num") {
        it.vel.y -= 1.5 * dt;
        const p = it.life / it.max;
        o.material.opacity = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
        const pop = 1 + Math.sin(Math.min(1, p * 4) * Math.PI) * 0.35;
        o.scale.set(2.0 * it.base * pop, 1.0 * it.base * pop, 1);
      } else {
        it.vel.y -= 14 * dt;
        o.rotation.x += it.spin * dt; o.rotation.z += it.spin * 0.7 * dt;
        const k = 1 - it.life / it.max;
        o.scale.setScalar(Math.max(0.05, k));
      }
      if (it.life >= it.max) {
        scene.remove(o);
        if (it.kind === "num") { o.material.map.dispose(); o.material.dispose(); }
        if (it.kind === "tracer") { o.geometry.dispose(); o.material.dispose(); }
        items.splice(i, 1);
      }
    }
  }

  return { spawnDamage, burst, tracer, update, get count() { return items.length; } };
}
