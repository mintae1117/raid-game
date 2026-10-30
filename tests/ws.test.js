import { test, after } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createServer } from "../server/index.js";

function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const msgs = [];
  const waiters = [];
  ws.on("message", (d) => {
    const m = JSON.parse(d.toString());
    msgs.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  return {
    ws, msgs,
    open: () => new Promise((r) => ws.once("open", r)),
    send: (o) => ws.send(JSON.stringify(o)),
    waitFor: (pred, ms = 2000) => {
      const found = msgs.find(pred);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout waiting for message")), ms);
        waiters.push({ pred, resolve: (m) => { clearTimeout(timer); resolve(m); } });
      });
    },
    close: () => ws.close(),
  };
}

async function post(port, path, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const s = createServer({ port: 0, debug: true });
const port = await s.ready;
after(() => s.close());

test("join → welcome+lobby; second join updates first; public-url reaches lobby", async () => {
  const a = client(port); await a.open();
  a.send({ type: "join", name: "호스트" });
  const welcome = await a.waitFor((m) => m.type === "welcome");
  assert.equal(typeof welcome.token, "string");
  const lobby1 = await a.waitFor((m) => m.type === "lobby");
  assert.equal(lobby1.players.length, 1);
  assert.equal(lobby1.map, "낙성대동굴");

  const b = client(port); await b.open();
  b.send({ type: "join", name: "친구" });
  const lobby2 = await a.waitFor((m) => m.type === "lobby" && m.players.length === 2);
  assert.equal(lobby2.hostId, welcome.id);

  assert.equal((await post(port, "/public-url", { url: "https://evil.example" })).status, 403, "토큰 없으면 거부(터널 트래픽도 localhost 발신이라 주소로는 못 가름)");
  assert.equal((await post(port, "/public-url", { url: "https://evil.example" }, "wrong")).status, 403);
  const r = await post(port, "/public-url", { url: "https://abc-def.trycloudflare.com" }, s.adminToken);
  assert.equal(r.status, 200);
  const lobby3 = await a.waitFor((m) => m.type === "lobby" && m.publicUrl === "https://abc-def.trycloudflare.com");
  assert.ok(lobby3);

  const bad = await fetch(`http://127.0.0.1:${port}/public-url`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.adminToken}` }, body: "{not json" });
  assert.equal(bad.status, 400);

  a.send("garbage"); // 잘못된 JSON 은 무시
  a.ws.send("{\"type\":\"nope\"}");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(a.ws.readyState, WebSocket.OPEN);

  // 호스트가 시작 → start 수신, 디버그 엔드포인트로 누나 HP 조정
  a.send({ type: "start" });
  const start = await b.waitFor((m) => m.type === "start");
  assert.equal(start.map, "낙성대동굴");
  await a.waitFor((m) => m.type === "snap");
  assert.equal((await post(port, "/debug/boss-hp", { hp: 1 })).status, 403, "디버그도 토큰 필수");
  const dbg = await post(port, "/debug/boss-hp", { hp: 1, inFrontOf: welcome.id }, s.adminToken);
  assert.equal(dbg.status, 200);
  assert.equal(s.room.game.boss.hp, 1);
  const me = s.room.game.player(welcome.id);
  assert.ok(Math.hypot(s.room.game.boss.pos.x - me.pos.x, s.room.game.boss.pos.z - me.pos.z) < 5, "누나가 플레이어 앞에 섬");

  b.close();
  const left = await a.waitFor((m) => m.type === "event" && m.event.type === "disconnected");
  assert.ok(left);
  a.close();
});

test("debug endpoint is off unless opted in", async () => {
  const plain = createServer({ port: 0 });
  const port2 = await plain.ready;
  assert.equal((await post(port2, "/debug/boss-hp", { hp: 1 }, plain.adminToken)).status, 404);
  await plain.close();
});
