import { test } from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { fakeTimers, fake } from "./helpers/fakes.js";

test("host, difficulty, start, 5th rejected", () => {
  const r = new Room(fakeTimers());
  const cs = [1, 2, 3, 4, 5].map((i) => fake(`c${i}`));
  cs.forEach((c) => { r.connect(c); r.message(c.id, { type: "join", name: "p" + c.id }); });
  assert.ok(cs[4].sent.some((m) => m.type === "error" && m.reason === "full"));
  assert.equal(r.hostId, "c1");
  assert.ok(cs[0].sent.some((m) => m.type === "welcome" && m.id === "c1" && typeof m.token === "string"));
  const lobby = cs[3].sent.findLast((m) => m.type === "lobby");
  assert.equal(lobby.map, "낙성대동굴");
  assert.equal(lobby.players.length, 4);
  assert.equal(lobby.players.find((p) => p.id === "c1").host, true);
  r.message("c2", { type: "difficulty", level: "hard" });
  assert.equal(r.difficulty, "normal");
  r.message("c1", { type: "difficulty", level: "hard" });
  assert.equal(r.difficulty, "hard");
  r.message("c2", { type: "start" });
  assert.equal(r.status, "lobby");
  r.message("c1", { type: "start" });
  assert.equal(r.status, "playing");
  assert.ok(cs[0].sent.some((m) => m.type === "start" && m.map === "낙성대동굴" && m.difficulty === "hard" && typeof m.seed === "number"));
  assert.equal(r.game.players.length, 4);
});

test("name must be 2~12 chars", () => {
  const r = new Room(fakeTimers());
  const c = fake("c1"); r.connect(c);
  r.message("c1", { type: "join", name: "a" });
  assert.ok(c.sent.some((m) => m.type === "error" && m.reason === "name"));
  r.message("c1", { type: "join", name: "호스트" });
  assert.ok(c.sent.some((m) => m.type === "welcome"));
});

test("snapshots and events flow while playing; knock goes only to the target", () => {
  const r = new Room(fakeTimers());
  const c = fake("c1"); r.connect(c); r.message("c1", { type: "join", name: "호스트" });
  r.message("c1", { type: "start" });
  r.timers.advance(0.2);
  assert.ok(c.sent.filter((m) => m.type === "snap").length >= 3);
  const c2 = fake("c2"); r.connect(c2); r.message("c2", { type: "join", name: "늦둥이" });
  assert.ok(c2.sent.some((m) => m.type === "spectate"));
  r.game.applyKnock(r.game.players[0], { x: 1, y: 0, z: 0 });
  r.timers.advance(0.06);
  assert.ok(c.sent.some((m) => m.type === "knock" && m.impulse.x === 1));
  assert.ok(!c2.sent.some((m) => m.type === "knock"));
});

test("reconnect within 60s keeps lives and weapon", () => {
  const r = new Room(fakeTimers());
  const c = fake("c1"); r.connect(c); r.message("c1", { type: "join", name: "호스트" });
  const token = c.sent.find((m) => m.type === "welcome").token;
  r.message("c1", { type: "start" });
  const p = r.game.players[0]; p.melee = "diamond";
  r.message("c1", { type: "fell" });
  r.disconnect("c1");
  r.timers.advance(30);
  const c2 = fake("c9"); r.connect(c2); r.message("c9", { type: "join", name: "호스트", token });
  assert.equal(r.game.players.length, 1);
  assert.equal(r.game.players[0].lives, 2);
  assert.equal(r.game.players[0].melee, "diamond");
  assert.equal(r.game.players[0].disconnectedAt, null);
  assert.ok(c2.sent.some((m) => m.type === "welcome" && m.id === "c1"));
  assert.ok(c2.sent.some((m) => m.type === "start"));
  r.message("c9", { type: "slot", n: 2 });
  r.timers.advance(0.1);
  assert.ok(c2.sent.some((m) => m.type === "snap"));
});

test("reconnect after 60s is dropped; join during game spectates", () => {
  const r = new Room(fakeTimers());
  const c = fake("c1"); r.connect(c); r.message("c1", { type: "join", name: "aa" });
  const token = c.sent.find((m) => m.type === "welcome").token;
  const c2 = fake("c2"); r.connect(c2); r.message("c2", { type: "join", name: "bb" });
  r.message("c1", { type: "start" });
  r.game.player("c2").takeDamage = () => ({ died: false }); // 61초 동안 c2 가 죽어 판이 끝나지 않도록(테스트 전제 유지)
  r.disconnect("c1");
  r.timers.advance(61);
  assert.equal(r.status, "playing");
  assert.ok(!r.game.players.some((p) => p.id === c.id));
  assert.equal(r.hostId, "c2");
  const c3 = fake("c3"); r.connect(c3); r.message("c3", { type: "join", name: "late" });
  assert.ok(c3.sent.some((m) => m.type === "spectate"));
  const c4 = fake("c4"); r.connect(c4); r.message("c4", { type: "join", name: "aa", token });
  assert.ok(!c4.sent.some((m) => m.type === "welcome" && m.id === "c1"));
});

test("host leaves lobby → next member hosts; restart after end returns to lobby keeping difficulty", () => {
  const r = new Room(fakeTimers());
  const c1 = fake("c1"); r.connect(c1); r.message("c1", { type: "join", name: "aa" });
  const c2 = fake("c2"); r.connect(c2); r.message("c2", { type: "join", name: "bb" });
  r.message("c1", { type: "difficulty", level: "easy" });
  r.disconnect("c1");
  assert.equal(r.hostId, "c2");
  r.message("c2", { type: "start" });
  r.game.boss.hp = 1;
  r.game.boss.takeDamage(5, "c2", r.timers.now());
  r.timers.advance(0.1);
  assert.equal(r.status, "ended");
  assert.ok(c2.sent.some((m) => m.type === "event" && m.type === "event" && m.event.type === "win"));
  r.message("c2", { type: "restart" });
  assert.equal(r.status, "lobby");
  assert.equal(r.difficulty, "easy");
  assert.equal(r.game, null);
});

test("everyone gone for 60s during play ends the game and returns to lobby; a newcomer can host and start", () => {
  const r = new Room(fakeTimers());
  const c1 = fake("c1"), c2 = fake("c2");
  r.connect(c1); r.message("c1", { type: "join", name: "aa" });
  r.connect(c2); r.message("c2", { type: "join", name: "bb" });
  r.message("c1", { type: "start" });
  r.disconnect("c1"); r.disconnect("c2");
  r.timers.advance(61);
  assert.equal(r.status, "lobby");
  assert.equal(r.game, null);
  assert.equal(r.tickHandle, null);
  const c3 = fake("c3"); r.connect(c3); r.message("c3", { type: "join", name: "cc" });
  assert.equal(r.hostId, "c3");
  assert.ok(c3.sent.some((m) => m.type === "lobby"));
  r.message("c3", { type: "start" });
  assert.equal(r.status, "playing");
});

test("host leaving on the result screen hands host over (event carries hostId); joining while ended enters the lobby privately", () => {
  const r = new Room(fakeTimers());
  const c1 = fake("c1"), c2 = fake("c2");
  r.connect(c1); r.message("c1", { type: "join", name: "aa" });
  r.connect(c2); r.message("c2", { type: "join", name: "bb" });
  r.message("c1", { type: "start" });
  r.game.boss.hp = 1; r.game.boss.takeDamage(5, "c1", r.timers.now());
  r.timers.advance(0.1);
  assert.equal(r.status, "ended");
  r.disconnect("c1");
  assert.equal(r.hostId, "c2");
  assert.ok(c2.sent.some((m) => m.type === "event" && m.event.type === "left" && m.event.hostId === "c2"));
  const before = c2.sent.length;
  const c3 = fake("c3"); r.connect(c3); r.message("c3", { type: "join", name: "cc" });
  assert.ok(c3.sent.some((m) => m.type === "lobby"), "ended 중 입장은 로비");
  assert.ok(!c3.sent.some((m) => m.type === "spectate"));
  assert.ok(!c2.sent.slice(before).some((m) => m.type === "lobby"), "결과 화면을 보는 사람에게 lobby 를 쏘지 않음");
  r.message("c2", { type: "restart" });
  assert.equal(r.status, "lobby");
  assert.ok(c3.sent.filter((m) => m.type === "lobby").length >= 2);
});

test("last member leaving on the result screen returns the room to lobby", () => {
  const r = new Room(fakeTimers());
  const c1 = fake("c1"); r.connect(c1); r.message("c1", { type: "join", name: "aa" });
  r.message("c1", { type: "start" });
  r.game.boss.hp = 1; r.game.boss.takeDamage(5, "c1", r.timers.now());
  r.timers.advance(0.1);
  r.disconnect("c1");
  assert.equal(r.status, "lobby");
  const c9 = fake("c9"); r.connect(c9); r.message("c9", { type: "join", name: "zz" });
  assert.equal(r.hostId, "c9");
  r.message("c9", { type: "start" });
  assert.equal(r.status, "playing");
});

test("input with non-finite fields is ignored; difficulty rejects prototype keys", () => {
  const r = new Room(fakeTimers());
  const c1 = fake("c1"); r.connect(c1); r.message("c1", { type: "join", name: "aa" });
  r.message("c1", { type: "difficulty", level: "constructor" });
  assert.equal(r.difficulty, "normal");
  r.message("c1", { type: "start" });
  const p = r.game.players[0]; const pos = { ...p.pos };
  r.message("c1", { type: "input", pos: { x: pos.x + 0.1, y: "abc", z: pos.z }, yaw: 0, pitch: 0 });
  r.message("c1", { type: "input", pos: { x: pos.x + 0.1, y: 1, z: pos.z }, yaw: Infinity, pitch: 0 });
  r.message("c1", { type: "input", pos: { x: pos.x + 0.1, y: NaN, z: pos.z }, yaw: 0, pitch: 0 });
  assert.deepEqual(p.pos, pos);
  assert.equal(p.yaw, 0);
  r.message("c1", { type: "input", pos: { x: pos.x + 0.1, y: 500, z: pos.z }, yaw: 0, pitch: 9 });
  assert.ok(p.pos.y <= 4, `y 는 클램프됨: ${p.pos.y}`);
  assert.ok(Math.abs(p.pitch) <= 1.6);
});
