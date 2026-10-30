// 장면: 동굴 하늘·안개·조명·48×48 섬(InstancedMesh)·측면 벽·장식 블록·가장자리 경고 테두리
import * as THREE from "three";
import { MAP } from "/shared/constants.js";
import { grassTexture, stoneTexture, darkStoneTexture, woodTexture, leafTexture, warnTexture } from "./textures.js";

function caveSky() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, "#07060a");
  g.addColorStop(0.55, "#17131e");
  g.addColorStop(1, "#2a1f24");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createScene(renderer, map) {
  const scene = new THREE.Scene();
  scene.background = caveSky();
  scene.fog = new THREE.Fog(0x0f0c13, 28, 95);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 220);
  camera.position.set(0, MAP.groundY + 1.6, 0);

  // 조명: 동굴 속 횃불 느낌 — 따뜻한 직사광(그림자) + 푸른 환경광 + 깜빡이는 점광
  const sun = new THREE.DirectionalLight(0xffd9b0, 1.6);
  sun.position.set(18, 40, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 100;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  scene.add(new THREE.AmbientLight(0x6a6aa8, 0.55));
  const torch = new THREE.PointLight(0xff9a3c, 40, 40, 1.6);
  torch.position.set(0, MAP.groundY + 4, 0);
  scene.add(torch);

  const islandGroup = new THREE.Group();
  scene.add(islandGroup);

  // 섬 윗면: 잔디/바위 섞은 블록 + 가장자리 한 줄은 붉은 경고 블록
  const half = map.half;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mats = {
    grass: new THREE.MeshLambertMaterial({ map: grassTexture() }),
    stone: new THREE.MeshLambertMaterial({ map: stoneTexture() }),
    warn: new THREE.MeshLambertMaterial({ map: warnTexture(), emissive: 0x3a0a08 }),
  };
  const cells = { grass: [], stone: [], warn: [] };
  let n = 0;
  for (let x = -half; x < half; x++) {
    for (let z = -half; z < half; z++) {
      const edge = x === -half || z === -half || x === half - 1 || z === half - 1;
      const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      const kind = edge ? "warn" : (h - Math.floor(h)) < 0.72 ? "grass" : "stone";
      cells[kind].push([x + 0.5, MAP.groundY - 0.5, z + 0.5]);
      n++;
    }
  }
  const dummy = new THREE.Object3D();
  for (const kind of Object.keys(cells)) {
    const list = cells[kind];
    if (!list.length) continue;
    const inst = new THREE.InstancedMesh(box, mats[kind], list.length);
    list.forEach(([x, y, z], i) => { dummy.position.set(x, y, z); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); });
    inst.instanceMatrix.needsUpdate = true;
    inst.receiveShadow = true;
    islandGroup.add(inst);
  }

  // 측면 벽(높이 8, 어두운 바위) — 섬 아래는 허공
  const wallTex = darkStoneTexture(8);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(map.size, 8, map.size), new THREE.MeshLambertMaterial({ map: wallTex }));
  wall.position.set(0, MAP.groundY - 1 - 4, 0);
  islandGroup.add(wall);

  // 장식 블록: 나무(기둥 + 잎), 바위
  const wood = new THREE.MeshLambertMaterial({ map: woodTexture() });
  const leaf = new THREE.MeshLambertMaterial({ map: leafTexture() });
  const rock = new THREE.MeshLambertMaterial({ map: stoneTexture() });
  const decoMeshes = [];
  for (const d of map.decorations) {
    const g = new THREE.Group();
    if (d.kind === "tree") {
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, d.d), wood);
      trunk.position.y = d.h / 2;
      const crown = new THREE.Mesh(new THREE.BoxGeometry(d.w + 2, 2, d.d + 2), leaf);
      crown.position.y = d.h + 1;
      trunk.castShadow = crown.castShadow = true;
      g.add(trunk, crown);
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, d.d), rock);
      m.position.y = d.h / 2;
      m.castShadow = true;
      g.add(m);
    }
    g.position.set(d.x, MAP.groundY, d.z);
    islandGroup.add(g);
    decoMeshes.push(g);
  }

  // 동굴 분위기: 섬 바깥 멀리 떠 있는 어두운 바위 덩어리 몇 개
  const far = new THREE.MeshLambertMaterial({ map: darkStoneTexture(2) });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, r = 55 + (i % 3) * 10;
    const m = new THREE.Mesh(new THREE.BoxGeometry(6 + (i % 4) * 2, 8 + (i % 3) * 4, 6), far);
    m.position.set(Math.cos(a) * r, -6 + (i % 2) * 10, Math.sin(a) * r);
    scene.add(m);
  }

  let t = 0;
  function update(dt) {
    t += dt;
    torch.intensity = 40 + Math.sin(t * 9) * 4 + Math.sin(t * 23) * 2;
  }

  function resize() {
    const w = renderer.domElement.clientWidth || window.innerWidth;
    const h = renderer.domElement.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  return { scene, camera, islandGroup, update, resize, sun };
}

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);
  return renderer;
}
