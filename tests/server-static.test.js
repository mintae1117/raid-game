import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/index.js";

test("serves index, three module, health", async () => {
  const s = createServer({ port: 0, root: new URL("../client/", import.meta.url) });
  await s.ready;
  const port = s.httpServer.address().port;
  const index = await fetch(`http://localhost:${port}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get("content-type"), /text\/html/);
  const three = await fetch(`http://localhost:${port}/vendor/three.module.js`);
  assert.equal(three.status, 200);
  assert.match(three.headers.get("content-type"), /text\/javascript/);
  assert.deepEqual(await (await fetch(`http://localhost:${port}/health`)).json(), { ok: true });
  assert.equal((await fetch(`http://localhost:${port}/../package.json`)).status, 404);
  await s.close();
});

test("serves shared pure game modules under /shared/ (allowlist only)", async () => {
  const s = createServer({ port: 0 });
  const port = await s.ready;
  const map = await fetch(`http://localhost:${port}/shared/map.js`);
  assert.equal(map.status, 200);
  assert.match(map.headers.get("content-type"), /text\/javascript/);
  assert.match(await map.text(), /createMap/);
  assert.equal((await fetch(`http://localhost:${port}/shared/room.js`)).status, 404);
  assert.equal((await fetch(`http://localhost:${port}/shared/../index.js`)).status, 404);
  await s.close();
});

test("malformed URL gets 400 and the server keeps serving (no crash)", async () => {
  const s = createServer({ port: 0 });
  const port = await s.ready;
  const bad = await fetch(`http://localhost:${port}/%zz`);
  assert.equal(bad.status, 400);
  const bad2 = await fetch(`http://localhost:${port}/%`);
  assert.equal(bad2.status, 400);
  assert.deepEqual(await (await fetch(`http://localhost:${port}/health`)).json(), { ok: true });
  await s.close();
});
