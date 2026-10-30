// 낙성대동굴: 48×48 단일 섬. 중앙 원점, 지면 y=1, 밖은 허공.
import { MAP, PICKUP } from "./constants.js";
import { mulberry32 } from "./rng.js";

export function createMap(seed = 1) {
  const rng = mulberry32(seed);
  const half = MAP.half;

  // 장식(통과 불가) 블록: 중심 거리 14~21m에 8~12개
  const count = 8 + Math.floor(rng() * 5);
  const decorations = [];
  while (decorations.length < count) {
    const ang = rng() * Math.PI * 2, r = 14 + rng() * 7;
    const x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
    if (Math.hypot(x, z) < 14 || Math.hypot(x, z) > 21) continue; // 반올림으로 범위를 벗어나면 다시
    if (decorations.some((d) => Math.hypot(d.x - x, d.z - z) < 4)) continue;
    const w = 1 + Math.floor(rng() * 2), d = 1 + Math.floor(rng() * 2), h = 2 + Math.floor(rng() * 3);
    decorations.push({ x, z, w, h, d, kind: rng() < 0.5 ? "tree" : "rock" });
  }

  const spawnPoints = [0, 1, 2, 3].map((i) => {
    const ang = (Math.PI / 2) * i + Math.PI / 4, r = 4 + rng() * 2;
    return { x: Math.cos(ang) * r, y: MAP.groundY, z: Math.sin(ang) * r };
  });

  const isOnIsland = (x, z) => Math.abs(x) <= half && Math.abs(z) <= half;
  const isBlocked = (x, z) => decorations.some((d) => Math.abs(x - d.x) <= d.w / 2 + 0.5 && Math.abs(z - d.z) <= d.d / 2 + 0.5);

  // 무기 스폰 자리: 중심 8m 밖, 가장자리 3m 안쪽, 장식과 안 겹치게 24곳
  const pickupSpots = [];
  const limit = half - PICKUP.edgeInset;
  let guard = 0;
  while (pickupSpots.length < 24 && guard++ < 2000) {
    const x = Math.round((rng() * 2 - 1) * limit * 10) / 10, z = Math.round((rng() * 2 - 1) * limit * 10) / 10;
    if (Math.hypot(x, z) < PICKUP.minCenter || isBlocked(x, z)) continue; // 반올림한 좌표로 검사
    if (pickupSpots.some((s) => Math.hypot(s.x - x, s.z - z) < 4)) continue;
    pickupSpots.push({ x, z });
  }

  return { name: MAP.name, size: MAP.size, half, spawnPoints, decorations, pickupSpots, isOnIsland, isBlocked };
}
