// Web Audio 로 합성한 짧은 효과음. 브라우저 정책상 첫 클릭/키 입력 뒤에 켜진다.
let ctx = null;
let master = null;

function ensure() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return true; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return true;
}
["click", "keydown", "pointerdown"].forEach((ev) => window.addEventListener(ev, () => ensure(), { passive: true }));

function tone({ freq = 440, to = null, type = "square", dur = 0.15, gain = 0.5, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.1, gain = 0.4, freq = 1200, q = 0.8, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(master); src.start(t0);
}

const SFX = {
  swing: () => noise({ dur: 0.12, gain: 0.35, freq: 900 }),
  shoot: () => { noise({ dur: 0.08, gain: 0.3, freq: 2500 }); tone({ freq: 900, to: 300, type: "triangle", dur: 0.12, gain: 0.3 }); },
  hit: () => { tone({ freq: 320, to: 80, type: "square", dur: 0.16, gain: 0.7 }); noise({ dur: 0.07, gain: 0.55, freq: 2400, q: 0.5 }); tone({ freq: 70, to: 40, type: "sine", dur: 0.18, gain: 0.5 }); },
  bite: () => { tone({ freq: 520, to: 180, type: "square", dur: 0.12, gain: 0.45 }); noise({ dur: 0.08, gain: 0.3, freq: 1800 }); },
  gun: () => { noise({ dur: 0.05, gain: 0.45, freq: 3200, q: 0.7 }); tone({ freq: 200, to: 70, type: "square", dur: 0.06, gain: 0.35 }); },
  stun: () => { tone({ freq: 420, to: 140, type: "sawtooth", dur: 0.5, gain: 0.5 }); [660, 880, 660].forEach((f, i) => tone({ freq: f, type: "square", dur: 0.08, gain: 0.25, delay: 0.1 + i * 0.1 })); },
  hurt: () => { tone({ freq: 180, to: 90, type: "sawtooth", dur: 0.2, gain: 0.5 }); noise({ dur: 0.15, gain: 0.3, freq: 400 }); },
  telegraph: () => { tone({ freq: 660, type: "square", dur: 0.12, gain: 0.35 }); tone({ freq: 880, type: "square", dur: 0.14, gain: 0.35, delay: 0.14 }); },
  stomp: () => { tone({ freq: 90, to: 40, type: "sine", dur: 0.45, gain: 0.8 }); noise({ dur: 0.35, gain: 0.5, freq: 200, q: 0.5 }); },
  roar: () => { tone({ freq: 110, to: 70, type: "sawtooth", dur: 0.8, gain: 0.5 }); tone({ freq: 165, to: 95, type: "sawtooth", dur: 0.8, gain: 0.3, delay: 0.05 }); },
  death: () => tone({ freq: 420, to: 60, type: "sawtooth", dur: 0.7, gain: 0.5 }),
  pickup: () => { tone({ freq: 523, type: "square", dur: 0.08, gain: 0.3 }); tone({ freq: 1046, type: "square", dur: 0.14, gain: 0.3, delay: 0.08 }); },
  explode: () => { tone({ freq: 120, to: 30, type: "sine", dur: 0.6, gain: 0.9 }); noise({ dur: 0.5, gain: 0.6, freq: 500, q: 0.3 }); },
  phase: () => { tone({ freq: 196, type: "square", dur: 0.2, gain: 0.4 }); tone({ freq: 147, type: "square", dur: 0.35, gain: 0.4, delay: 0.2 }); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: "square", dur: 0.25, gain: 0.35, delay: i * 0.16 })),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone({ freq: f, type: "sawtooth", dur: 0.4, gain: 0.35, delay: i * 0.28 })),
};

export function sfx(name) {
  if (!ensure() || ctx.state !== "running") return;
  SFX[name]?.();
}
