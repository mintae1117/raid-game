// {x,y,z} 벡터 유틸 (불변)
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const norm = (a) => { const l = len(a); return l === 0 ? { x: 0, y: 0, z: 0 } : scale(a, 1 / l); };
export const dist = (a, b) => len(sub(a, b));
export const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
