// 장면 스모크: ?scene=1 로 열어 WebGL 장면이 두 프레임 이상 그려지고 콘솔 에러가 없는지 확인 + 스크린샷
import assert from "node:assert/strict";
import { createServer } from "../../server/index.js";
import { launch, newPage } from "./_browser.mjs";

const s = createServer({ port: 0 });
const port = await s.ready;
const browser = await launch();
try {
  const p = await newPage(browser);
  await p.goto(`http://127.0.0.1:${port}/?scene=1`);
  await p.waitForFunction(() => window.__nuna && window.__nuna.sceneReady === true, null, { timeout: 15000 });
  const errs = p.errors.filter((e) => !e.includes("__debug_scene__"));
  assert.deepEqual(errs, []);
  const out = process.env.SHOT || "tmp/scene.png";
  await p.screenshot({ path: out });
  console.log("scene e2e OK", out);
} finally {
  await browser.close();
  await s.close();
}
