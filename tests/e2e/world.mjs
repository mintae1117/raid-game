// 렌더 스모크: ?scene=1&mock=1 로 가짜 스냅샷을 돌려 콘솔 에러 0, 누나 메시 5개 초과 + 스크린샷
import assert from "node:assert/strict";
import { createServer } from "../../server/index.js";
import { launch, newPage } from "./_browser.mjs";

const s = createServer({ port: 0 });
const port = await s.ready;
const browser = await launch();
try {
  const p = await newPage(browser);
  await p.goto(`http://127.0.0.1:${port}/?scene=1&mock=1`);
  await p.waitForFunction(() => window.__nuna && window.__nuna.sceneReady === true, null, { timeout: 15000 });
  await p.waitForTimeout(1500);
  assert.ok((await p.evaluate(() => window.__nuna.bossMeshCount)) > 5);
  const errs = p.errors.filter((e) => !e.includes("__debug_scene__"));
  assert.deepEqual(errs, []);
  const out = process.env.SHOT || "tmp/world.png";
  await p.screenshot({ path: out });
  console.log("world e2e OK", out);
} finally {
  await browser.close();
  await s.close();
}
