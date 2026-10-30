// 머리 위 이름표: 캔버스 글자 → 스프라이트
import * as THREE from "three";

export function makeLabel(text, { color = "#ffffff", bg = "rgba(0,0,0,0.55)", size = 64, scale = 1 } = {}) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = `bold ${size}px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  c.width = w; c.height = size + 28;
  ctx.font = `bold ${size}px "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  sprite.scale.set((c.width / c.height) * 0.5 * scale, 0.5 * scale, 1);
  return sprite;
}
