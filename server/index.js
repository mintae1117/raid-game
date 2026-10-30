// 누나 레이드 서버 진입점: 정적 파일(client/) + three 모듈 + WebSocket(Room) + 공개 URL 등록
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";
import { Room } from "./room.js";
import { lookDir } from "./game/combat.js";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

const THREE_PATH = fileURLToPath(new URL("../node_modules/three/build/three.module.js", import.meta.url));
// 클라이언트와 공유하는 순수 모듈(맵 생성·상수·난수·벡터·시선 계산). 서버 전용 파일은 내놓지 않는다.
const SHARED_DIR = fileURLToPath(new URL("./game/", import.meta.url));
const SHARED_ALLOW = new Set(["constants.js", "map.js", "rng.js", "vec.js", "combat.js", "weapons.js"]);
// 누나 얼굴 사진(선택, git 에 안 올라감): client/assets/private/nuna-face.png 가 있으면 서빙, 없으면 1×1 투명 PNG
const FACE_PATH = fileURLToPath(new URL("../client/assets/private/nuna-face.png", import.meta.url));
const BLANK_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const MAX_BODY = 4096;

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > MAX_BODY) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

// 관리 토큰: /public-url 과 /debug/* 는 이 토큰을 아는 쪽(같은 PC 의 tunnel.js, 테스트)만 부를 수 있다.
// 터널 트래픽도 localhost 발신으로 보이므로 주소로는 구분할 수 없다.
export const ADMIN_TOKEN_FILE = fileURLToPath(new URL("../.nuna-admin-token", import.meta.url));

function authorized(req, token) {
  const h = req.headers.authorization || "";
  const given = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (given.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
}

export function createServer({
  port = 3000,
  root = new URL("../client/", import.meta.url),
  room = new Room(),
  debug = process.env.NUNA_DEBUG === "1",
  adminToken = crypto.randomBytes(16).toString("hex"),
  tokenFile = null,
} = {}) {
  const rootDir = root instanceof URL ? fileURLToPath(root) : root;
  if (tokenFile) fs.writeFileSync(tokenFile, adminToken, { mode: 0o600 });

  const httpServer = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) send(res, err instanceof URIError || err?.code === "ERR_INVALID_URL" ? 400 : 500, "bad request");
      else res.destroy();
    });
  });

  async function handle(req, res) {
    let url;
    try { url = new URL(req.url, "http://localhost"); } catch { return send(res, 400, "bad request"); }
    if (url.pathname === "/health") return send(res, 200, JSON.stringify({ ok: true }), TYPES[".json"]);

    if (req.method === "POST" && url.pathname === "/public-url") {
      if (!authorized(req, adminToken)) return send(res, 403, "forbidden");
      try {
        const body = await readJson(req);
        if (typeof body.url !== "string" || !/^https?:\/\//.test(body.url)) return send(res, 400, "bad url");
        room.setPublicUrl(body.url);
        return send(res, 200, JSON.stringify({ ok: true, publicUrl: room.publicUrl }), TYPES[".json"]);
      } catch { return send(res, 400, "bad json"); }
    }

    if (debug && req.method === "POST" && url.pathname === "/debug/boss-hp") {
      if (!authorized(req, adminToken)) return send(res, 403, "forbidden");
      try {
        const body = await readJson(req);
        if (!room.game || typeof body.hp !== "number") return send(res, 409, "no game");
        room.game.boss.hp = Math.max(1, Math.min(room.game.boss.maxHp, body.hp));
        const target = typeof body.inFrontOf === "string" ? room.game.player(body.inFrontOf) : null;
        if (target) { // 플레이어 시선 4m 앞에 세워 근접 공격이 닿게 한다(e2e 전용)
          const d = lookDir(target.yaw, 0);
          room.game.boss.pos = { x: target.pos.x + d.x * 4, y: room.game.boss.pos.y, z: target.pos.z + d.z * 4 };
          room.game.boss.state = "chase";
          room.game.boss.telegraph = null;
        }
        return send(res, 200, JSON.stringify({ ok: true, hp: room.game.boss.hp }), TYPES[".json"]);
      } catch { return send(res, 400, "bad json"); }
    }

    if (url.pathname.startsWith("/shared/")) {
      const name = url.pathname.slice("/shared/".length);
      if (!SHARED_ALLOW.has(name)) return send(res, 404, "not found");
      return fs.readFile(path.join(SHARED_DIR, name), (err, data) => (err ? send(res, 404, "not found") : send(res, 200, data, TYPES[".js"])));
    }
    if (url.pathname === "/assets/nuna-face.png") {
      return fs.readFile(FACE_PATH, (err, data) => (err ? send(res, 200, BLANK_PNG, TYPES[".png"]) : send(res, 200, data, TYPES[".png"])));
    }
    if (url.pathname === "/vendor/three.module.js") {
      return fs.readFile(THREE_PATH, (err, data) => (err ? send(res, 404, "not found") : send(res, 200, data, TYPES[".js"])));
    }
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, "bad request"); }
    if (rel === "/") rel = "/index.html";
    const file = path.resolve(rootDir, "." + rel);
    if (!file.startsWith(path.resolve(rootDir) + path.sep) && file !== path.resolve(rootDir)) return send(res, 404, "not found");
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, "not found");
      send(res, 200, data, TYPES[path.extname(file)] || "application/octet-stream");
    });
  }

  // ----- WebSocket -----
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });
  let nextId = 1;
  wss.on("connection", (ws) => {
    const id = String(nextId++);
    const conn = {
      id,
      send(obj) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); },
      close() { try { ws.close(); } catch { /* 이미 닫힘 */ } },
    };
    room.connect(conn);
    ws.on("message", (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      try { room.message(id, msg); } catch (err) { console.error("message error", err); }
    });
    ws.on("close", () => room.disconnect(id));
    ws.on("error", () => { /* close 가 뒤따른다 */ });
  });
  const ping = setInterval(() => { for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.ping(); }, 25000);

  const ready = new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port)));
  return {
    httpServer,
    wss,
    room,
    adminToken,
    ready,
    close: () => new Promise((resolve) => {
      clearInterval(ping);
      room.close();
      for (const ws of wss.clients) ws.terminate();
      wss.close(() => httpServer.close(resolve));
    }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const s = createServer({ port, tokenFile: ADMIN_TOKEN_FILE });
  s.ready.then((p) => console.log(`누나 레이드 서버: http://localhost:${p}  (공개 URL 은 npm run tunnel)`));
  const bye = () => s.close().then(() => process.exit(0));
  process.on("SIGINT", bye); process.on("SIGTERM", bye);
}
