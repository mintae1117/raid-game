// 픽셀 텍스처: 작은 캔버스에 그려 NearestFilter 로 확대 (마인크래프트 느낌)
import * as THREE from "three";
import { mulberry32 } from "/shared/rng.js";

export function pixelTexture({ size = 16, colors = ["#888888", "#666666"], pattern = "noise", seed = 1, repeat = 1 } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const rng = mulberry32(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let i = 0;
      if (pattern === "checker") i = (x + y) % 2;
      else if (pattern === "noise") i = Math.floor(rng() * colors.length);
      else if (pattern === "stripes") i = Math.floor(x / 2) % colors.length;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return finish(c, repeat);
}

function finish(canvas, repeat = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat !== 1) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat); }
  return tex;
}

export const grassTexture = (repeat = 1) => pixelTexture({ colors: ["#4f8a3a", "#447a32", "#5b9a44", "#3f7030"], pattern: "noise", seed: 7, repeat });
export const stoneTexture = (repeat = 1) => pixelTexture({ colors: ["#6f6a73", "#5e5a63", "#7c7781", "#55515a"], pattern: "noise", seed: 11, repeat });
export const darkStoneTexture = (repeat = 1) => pixelTexture({ colors: ["#3a363f", "#2f2b34", "#45404b"], pattern: "noise", seed: 13, repeat });
export const woodTexture = () => pixelTexture({ colors: ["#6b4a2b", "#5a3d22", "#7a5633"], pattern: "stripes", seed: 3 });
export const leafTexture = () => pixelTexture({ colors: ["#2f6b2a", "#3b7f34", "#27591f"], pattern: "noise", seed: 5 });
export const warnTexture = () => pixelTexture({ colors: ["#b3322e", "#8d2320"], pattern: "checker", seed: 1 });
export const pinkTexture = (seed = 21) => pixelTexture({ colors: ["#f2a1b8", "#e88fa8", "#f7b3c6"], pattern: "noise", seed });

export function pigFaceTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f2a1b8"; ctx.fillRect(0, 0, 16, 16);
  // 눈
  ctx.fillStyle = "#ffffff"; ctx.fillRect(3, 4, 3, 3); ctx.fillRect(10, 4, 3, 3);
  ctx.fillStyle = "#1a0a10"; ctx.fillRect(4, 5, 2, 2); ctx.fillRect(11, 5, 2, 2);
  // 코(주둥이)
  ctx.fillStyle = "#e07a9a"; ctx.fillRect(4, 9, 8, 5);
  ctx.fillStyle = "#7a2a45"; ctx.fillRect(6, 11, 1, 2); ctx.fillRect(9, 11, 1, 2);
  return finish(c);
}

export function skinTexture(seed = 1) {
  return pixelTexture({ colors: ["#e8b894", "#dca987"], pattern: "noise", seed });
}

export function weaponColor(kind) {
  return { wood: "#8a5a2b", stone: "#8f8f94", iron: "#e8e8ec", diamond: "#5fe3e8", bow: "#9b6cff", tnt: "#e23c3c", boots: "#ffb347", gun: "#5a5a66" }[kind] || "#ffffff";
}
