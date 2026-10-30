// 1인칭 무기: 카메라에 붙는 우하단 모델. 휘두르기/활 당김/TNT 던지기 애니메이션.
import * as THREE from "three";
import { weaponMesh } from "./world-view.js";

export function createWeaponView(camera) {
  const holder = new THREE.Group();
  holder.position.set(0.38, -0.36, -0.85);
  camera.add(holder);
  let mesh = null, kind = null;
  let anim = null;   // { kind, t, dur }
  let bob = 0;

  function setWeapon(k) {
    if (k === kind) return;
    if (mesh) holder.remove(mesh);
    kind = k;
    mesh = weaponMesh(k, 0.42);
    if (k === "bow") { mesh.rotation.set(0.2, -0.9, 0.3); mesh.position.set(-0.1, 0.05, 0); }
    else if (k === "tnt") { mesh.rotation.set(0.3, 0.4, 0); mesh.position.set(0, -0.05, 0); }
    else if (k === "gun") { mesh.rotation.set(0, -0.12, 0); mesh.position.set(-0.05, 0.02, 0.1); }
    else { mesh.rotation.set(-0.9, 0.5, 0.6); mesh.position.set(0, 0, 0); }
    holder.add(mesh);
  }

  function swing() {
    anim = { kind, t: 0, dur: kind === "bow" ? 0.35 : kind === "tnt" ? 0.45 : kind === "gun" ? 0.07 : 0.28 };
  }

  function update(dt, moving = 0) {
    bob += dt * (moving > 0.1 ? 9 : 2);
    holder.position.y = -0.36 + Math.sin(bob) * 0.015 * (0.4 + moving);
    holder.position.x = 0.38 + Math.cos(bob * 0.5) * 0.008;
    holder.rotation.set(0, 0, 0);
    if (!anim || !mesh) return;
    anim.t += dt;
    const p = Math.min(1, anim.t / anim.dur);
    const s = Math.sin(p * Math.PI);
    if (anim.kind === "gun") { holder.position.z = -0.85 + s * 0.07; holder.rotation.x = s * 0.06; }
    else if (anim.kind === "bow") { holder.position.z = -0.85 + s * 0.12; holder.rotation.x = s * 0.15; }
    else if (anim.kind === "tnt") { holder.position.z = -0.85 - s * 0.35; holder.position.y += s * 0.25; holder.rotation.x = -s * 1.1; }
    else { holder.rotation.x = -s * 1.3; holder.rotation.y = s * 0.6; holder.position.x = 0.38 - s * 0.25; holder.position.z = -0.85 - s * 0.15; }
    if (p >= 1) { anim = null; holder.position.z = -0.85; }
  }

  return { holder, setWeapon, swing, update, get kind() { return kind; } };
}
