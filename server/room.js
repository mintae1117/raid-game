// 방 하나 = 서버 하나. 로비(호스트·난이도) → 게임(50ms 스냅샷) → 결과 → 재시작. 재접속 토큰 60초.
import crypto from "node:crypto";
import { Game } from "./game/game.js";
import { Player } from "./game/player.js";
import { MAP, DIFFICULTY } from "./game/constants.js";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// 클라이언트 입력 검증: 전부 유한한 숫자여야 하고 범위를 벗어나면 잘라낸다
function validInput(msg) {
  if (!msg.pos || typeof msg.pos !== "object") return null;
  const x = num(msg.pos.x), y = num(msg.pos.y), z = num(msg.pos.z), yaw = num(msg.yaw), pitch = num(msg.pitch);
  if ([x, y, z, yaw, pitch].some((v) => v === null)) return null;
  return {
    pos: { x: clamp(x, -MAP.half * 3, MAP.half * 3), y: clamp(y, MAP.fallY - 20, MAP.groundY + 3), z: clamp(z, -MAP.half * 3, MAP.half * 3) },
    yaw, pitch: clamp(pitch, -1.57, 1.57),
  };
}

const MAX_PLAYERS = 4;
const RECONNECT_GRACE = 60;   // 초
const SNAP_MS = 50;
const NAME_MIN = 2, NAME_MAX = 12;

const realTimers = () => ({
  now: () => performance.now() / 1000,
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
});

export class Room {
  constructor(timers = realTimers()) {
    this.timers = timers;
    this.status = "lobby";          // lobby | playing | ended
    this.difficulty = "normal";
    this.publicUrl = null;
    this.conns = new Map();         // connId → conn
    this.members = [];              // { id, name, token, connId, disconnectedAt, spectator, lastInputAt }
    this.hostId = null;
    this.game = null;
    this.tickHandle = null;
    this.lastTickAt = 0;
  }

  // ----- 접속 관리 -----
  connect(conn) { this.conns.set(conn.id, conn); }

  disconnect(connId) {
    this.conns.delete(connId);
    const m = this.members.find((x) => x.connId === connId);
    if (!m) return;
    m.connId = null;
    if (this.status === "playing" && !m.spectator) {
      m.disconnectedAt = this.timers.now();
      this.game.disconnect(m.id, m.disconnectedAt);
      this.broadcast({ type: "event", event: { type: "disconnected", id: m.id } });
    } else {
      this.removeMember(m);
    }
  }

  removeMember(m) {
    this.members = this.members.filter((x) => x !== m);
    if (this.game) this.game.drop(m.id);
    if (this.hostId === m.id) this.hostId = this.members.find((x) => x.connId !== null)?.id ?? this.members[0]?.id ?? null;
    if (this.status === "lobby") this.broadcastLobby();
    else this.broadcast({ type: "event", event: { type: "left", id: m.id, hostId: this.hostId } });
    if (this.status === "ended" && this.members.length === 0) this.toLobby();
  }

  memberByConn(connId) { return this.members.find((m) => m.connId === connId) ?? null; }

  sendTo(m, msg) { const c = m.connId !== null ? this.conns.get(m.connId) : null; if (c) c.send(msg); }
  broadcast(msg) { for (const m of this.members) this.sendTo(m, msg); }

  lobbyMsg() {
    return {
      type: "lobby",
      players: this.members.map((m) => ({ id: m.id, name: m.name, host: m.id === this.hostId })),
      hostId: this.hostId,
      difficulty: this.difficulty,
      map: MAP.name,
      publicUrl: this.publicUrl,
    };
  }
  broadcastLobby() { this.broadcast(this.lobbyMsg()); }

  setPublicUrl(url) { this.publicUrl = url; if (this.status === "lobby") this.broadcastLobby(); }

  startMsg() { return { type: "start", seed: this.game.seed, difficulty: this.difficulty, map: MAP.name }; }

  // ----- 메시지 -----
  message(connId, msg) {
    if (!msg || typeof msg !== "object") return;
    const conn = this.conns.get(connId);
    if (!conn) return;
    if (msg.type === "join") return this.join(conn, msg);
    const m = this.memberByConn(connId);
    if (!m) return;
    const isHost = m.id === this.hostId;
    const now = this.timers.now();
    switch (msg.type) {
      case "difficulty":
        if (isHost && this.status === "lobby" && typeof msg.level === "string" && Object.hasOwn(DIFFICULTY, msg.level)) { this.difficulty = msg.level; this.broadcastLobby(); }
        break;
      case "start":
        if (isHost && this.status === "lobby") this.startGame();
        break;
      case "restart":
        if (isHost && this.status === "ended") this.toLobby();
        break;
      case "input": {
        const inp = this.status === "playing" && !m.spectator ? validInput(msg) : null;
        if (inp) {
          const dt = m.lastInputAt ? Math.min(0.25, Math.max(0.016, now - m.lastInputAt)) : 0.05;
          m.lastInputAt = now;
          this.game.applyInput(m.id, inp, dt);
        }
        break;
      }
      case "attack":
        if (this.status === "playing" && !m.spectator) this.game.attack(m.id, now);
        break;
      case "slot":
        if (this.status === "playing" && !m.spectator) this.game.setSlot(m.id, msg.n === 2 ? 2 : 1);
        break;
      case "fell":
        if (this.status === "playing" && !m.spectator) this.game.fell(m.id, now);
        break;
      default:
        break;
    }
  }

  join(conn, msg) {
    if (this.memberByConn(conn.id)) return;
    // 토큰 복귀
    if (typeof msg.token === "string") {
      const m = this.members.find((x) => x.token === msg.token && x.connId === null);
      if (m) {
        m.connId = conn.id;
        m.disconnectedAt = null;
        m.lastInputAt = 0;
        if (this.game && !m.spectator) this.game.reconnect(m.id);
        conn.send({ type: "welcome", id: m.id, token: m.token });
        if (this.status === "lobby") this.broadcastLobby();
        else if (this.status === "ended") conn.send(this.lobbyMsg());
        else { conn.send(this.startMsg()); conn.send({ type: "event", event: { type: "reconnected", id: m.id } }); }
        return;
      }
    }
    const name = typeof msg.name === "string" ? msg.name.trim() : "";
    if (name.length < NAME_MIN || name.length > NAME_MAX) return conn.send({ type: "error", reason: "name" });
    if (this.members.length >= MAX_PLAYERS) { conn.send({ type: "error", reason: "full" }); conn.close(); return; }
    const m = { id: conn.id, name, token: crypto.randomUUID(), connId: conn.id, disconnectedAt: null, spectator: this.status !== "lobby", lastInputAt: 0 };
    this.members.push(m);
    if (this.hostId === null) this.hostId = m.id;
    conn.send({ type: "welcome", id: m.id, token: m.token });
    if (this.status === "lobby") this.broadcastLobby();
    else if (this.status === "ended") { m.spectator = false; conn.send(this.lobbyMsg()); } // 결과 화면 중인 사람들은 건드리지 않는다
    else conn.send({ type: "spectate", seed: this.game.seed, difficulty: this.difficulty, map: MAP.name, status: this.status });
  }

  // ----- 게임 수명 -----
  startGame() {
    const now = this.timers.now();
    const players = this.members.map((m) => { m.spectator = false; m.lastInputAt = 0; return new Player({ id: m.id, name: m.name, spawn: { x: 0, y: MAP.groundY, z: 0 } }); });
    const seed = crypto.randomInt(1, 2 ** 31);
    this.game = new Game({ players, difficulty: this.difficulty, seed, now });
    this.status = "playing";
    this.lastTickAt = now;
    this.broadcast(this.startMsg());
    this.tickHandle = this.timers.setInterval(() => this.tick(), SNAP_MS);
  }

  tick() {
    if (!this.game) return;
    const now = this.timers.now();
    const dt = Math.min(0.1, Math.max(0.001, now - this.lastTickAt));
    this.lastTickAt = now;
    // 60초 넘게 끊긴 플레이어 탈락
    for (const m of [...this.members]) {
      if (m.connId === null && m.disconnectedAt !== null && now - m.disconnectedAt >= RECONNECT_GRACE) this.removeMember(m);
    }
    this.game.tick(dt, now);
    for (const e of this.game.drainEvents()) {
      if (e.type === "knock") { const m = this.members.find((x) => x.id === e.id); if (m) this.sendTo(m, { type: "knock", impulse: e.impulse }); }
      else this.broadcast({ type: "event", event: e });
    }
    this.broadcast({ type: "snap", ...this.game.snapshot() });
    if (this.game.status !== "playing") this.endGame();
  }

  endGame() {
    this.status = "ended";
    if (this.tickHandle !== null) { this.timers.clearInterval(this.tickHandle); this.tickHandle = null; }
    for (const m of [...this.members]) if (m.connId === null) this.removeMember(m);
    if (this.members.length === 0) this.toLobby(); // 결과 화면을 볼 사람이 없으면 바로 로비
  }

  toLobby() {
    this.game = null;
    this.status = "lobby";
    for (const m of this.members) { m.spectator = false; m.disconnectedAt = null; }
    this.broadcastLobby();
  }

  close() {
    if (this.tickHandle !== null) { this.timers.clearInterval(this.tickHandle); this.tickHandle = null; }
  }
}
