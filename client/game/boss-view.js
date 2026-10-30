// 누나(거대 돼지) 모델과 상태별 애니메이션. 서버 스냅샷을 100ms 쯤 늦게 따라가며 보간한다.
import * as THREE from "three";
import { BOSS } from "/shared/constants.js";
import { pinkTexture, pigFaceTexture } from "./textures.js";
import { makeLabel } from "./labels.js";

const LERP = 14; // 보간 속도(1/s) — 20Hz 스냅샷을 약 100ms 늦게 따라감

export function createBossView(scene) {
  const group = new THREE.Group();
  const model = new THREE.Group();   // 상태 애니메이션(기울기·낮춤)은 model 에, 위치·yaw 는 group 에
  group.add(model);
  scene.add(group);

  const pink = new THREE.MeshLambertMaterial({ map: pinkTexture(21) });
  const pinkDark = new THREE.MeshLambertMaterial({ color: 0xd97a97 });
  const hoof = new THREE.MeshLambertMaterial({ color: 0x5a2a3a });
  const face = pigFaceTexture();
  const faceMats = [pink, pink, pink, pink, pink, new THREE.MeshLambertMaterial({ map: face })];

  const { w, h, d } = BOSS.size;
  const legH = 0.9;
  const bodyH = h - legH;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), pink);
  body.position.y = legH + bodyH / 2;
  body.castShadow = true;
  model.add(body);

  const head = new THREE.Group();
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.5, 2.3), faceMats);
  headMesh.castShadow = true;
  headMesh.position.set(0, 0, -1.15);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.5), pinkDark);
  snout.position.set(0, -0.45, -2.45);
  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.3), pinkDark);
  const earR = earL.clone();
  earL.position.set(-1.0, 1.5, -0.8); earR.position.set(1.0, 1.5, -0.8);
  head.add(headMesh, snout, earL, earR);
  head.position.set(0, legH + bodyH * 0.65, -d / 2);
  model.add(head);

  const legs = [];
  for (const [x, z] of [[-w / 2 + 0.7, -d / 2 + 0.7], [w / 2 - 0.7, -d / 2 + 0.7], [-w / 2 + 0.7, d / 2 - 0.7], [w / 2 - 0.7, d / 2 - 0.7]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, legH, z);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, legH, 1.1), hoof);
    leg.position.y = -legH / 2;
    leg.castShadow = true;
    pivot.add(leg);
    model.add(pivot);
    legs.push(pivot);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.2), pinkDark);
  tail.position.set(0, legH + bodyH * 0.8, d / 2 + 0.5);
  tail.rotation.x = 0.6;
  model.add(tail);

  // 누나 얼굴 사진(있을 때만): 분홍 픽셀 얼굴 위에 누끼 딴 사진을 얼굴면 전체에 꽉 채워 합성한다. 없으면(1×1 투명) 픽셀 얼굴 그대로.
  const faceMat = faceMats[5];
  new THREE.TextureLoader().load("/assets/nuna-face.png", (tex) => {
    if (!tex.image || tex.image.width <= 4) return;
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(face.image, 0, 0, c.width, c.height);           // 바탕: 분홍 픽셀 얼굴
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tex.image, 0, 0, c.width, c.height);            // 위: 사진(머리 앞면 비율 2.8:2.5 에 맞춰 크롭됨)
    const composed = new THREE.CanvasTexture(c);
    composed.colorSpace = THREE.SRGBColorSpace;
    faceMat.map = composed;
    faceMat.needsUpdate = true;
    snout.visible = false; // 사진이 얼굴을 대신하므로 코 박스는 숨김
  });
  const flashMats = [pink, pinkDark, hoof, faceMat];
  let flashT = 1, recoil = 0;

  const label = makeLabel(BOSS.name, { color: "#ff8fb3", scale: 2.4 });
  label.position.y = h + 2.2;
  group.add(label);

  let meshCount = 0;
  group.traverse((o) => { if (o.isMesh) meshCount++; });

  const cur = { x: 0, y: 1, z: 0, yaw: 0 };
  let t = 0, moving = 0, deadT = 0, prevState = "chase";
  let lungeT = 1; // 물기 돌출 애니메이션 진행(초), 1 이상이면 끝
  let initialized = false;

  function lerpAngle(a, b, k) {
    let dlt = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + dlt * k;
  }

  function apply(snap, dt) {
    if (!snap) return;
    t += dt;
    const k = Math.min(1, LERP * dt);
    if (!initialized) { Object.assign(cur, { x: snap.pos.x, y: snap.pos.y, z: snap.pos.z, yaw: snap.yaw }); initialized = true; }
    const px = cur.x, pz = cur.z;
    cur.x += (snap.pos.x - cur.x) * k;
    cur.y += (snap.pos.y - cur.y) * k;
    cur.z += (snap.pos.z - cur.z) * k;
    cur.yaw = lerpAngle(cur.yaw, snap.yaw, k);
    const speed = dt > 0 ? Math.hypot(cur.x - px, cur.z - pz) / dt : 0;
    moving += (Math.min(1, speed / 2) - moving) * Math.min(1, dt * 8);
    group.position.set(cur.x, cur.y, cur.z);
    group.rotation.y = Math.PI - cur.yaw;

    // 기본 자세로 되돌린 뒤 상태별 변형
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    head.rotation.x = 0;
    const s = snap.state;
    const swing = Math.sin(t * 9) * 0.55 * moving;
    legs.forEach((l, i) => { l.rotation.x = (i % 2 === 0 ? swing : -swing); });
    // 피격 번쩍임(붉게)·움찔(뒤로 밀렸다 돌아옴)
    flashT += dt;
    const fl = flashT < 0.12 ? 1 : 0;
    for (const m of flashMats) m.emissive.setHex(fl ? 0x8a1020 : 0x000000);
    recoil = Math.max(0, recoil - dt * 6);
    model.position.z += recoil * 0.45;
    model.scale.x *= 1 + recoil * 0.06; model.scale.z *= 1 + recoil * 0.06;
    // 물기 돌출(이벤트로 시작): 머리를 앞으로 확 내밀었다가 되돌림
    lungeT += dt;
    if (lungeT < 0.3) {
      const f = Math.sin((lungeT / 0.3) * Math.PI);
      head.position.z = -d / 2 - f * 1.2;
      head.rotation.x = -0.5 * f;
    } else {
      head.position.z = -d / 2;
    }
    if (s === "bite_tele") {
      // 머리를 치켜들고 몸을 뒤로 — "문다" 예고
      head.rotation.x = 0.6;
      model.position.z = 0.4;
      model.rotation.x = 0.12;
    } else if (s === "roar_tele") {
      head.rotation.x = 0.35 + Math.sin(t * 20) * 0.05;
      model.scale.set(1.04, 1.06, 1.04);
    } else if (s === "charge_tele") {
      model.position.y = -0.35;
      model.position.x = Math.sin(t * 60) * 0.08;
      head.rotation.x = -0.35;
    } else if (s === "charging") {
      model.rotation.x = -0.14;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 18 + (i % 2) * Math.PI) * 0.8; });
    } else if (s === "stomp_tele") {
      model.rotation.x = 0.3;
      legs[0].rotation.x = legs[1].rotation.x = -1.3;
      head.rotation.x = 0.3;
    } else if (s === "stomping") {
      model.rotation.x = -0.08;
      model.scale.y = 0.9;
      legs[0].rotation.x = legs[1].rotation.x = 0.2;
    } else if (s === "stunned") {
      // 장애물에 부딪혀 비틀거림: 머리 흔들, 몸 좌우로 기우뚱
      head.rotation.y = Math.sin(t * 9) * 0.35;
      head.rotation.x = -0.2;
      model.rotation.z = Math.sin(t * 5) * 0.08;
      model.position.y = -0.15;
    } else if (s === "roar") {
      head.rotation.x = 0.55;
      model.position.y = Math.abs(Math.sin(t * 30)) * 0.08;
    } else if (s === "dead") {
      if (prevState !== "dead") deadT = 0;
      deadT += dt;
      const f = Math.min(1, deadT / 1.2);
      model.rotation.z = (Math.PI / 2) * f;
      model.position.y = -0.2 * f;
      model.position.x = 1.5 * f;
      legs.forEach((l, i) => { l.rotation.x = (i < 2 ? -0.4 : 0.4) * f; });
      label.visible = f < 0.5;
    }
    prevState = s;
  }

  function bite() { lungeT = 0; }
  function flash() { flashT = 0; recoil = Math.min(1, recoil + 0.7); }

  return { group, apply, meshCount, head, bite, flash };
}
