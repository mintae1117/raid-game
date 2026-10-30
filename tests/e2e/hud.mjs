// HUD 스모크: ?scene=1&mock=1 에서 HUD 요소가 가짜 데이터로 채워지고 결과 화면이 뜨는지 확인 + 스크린샷
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
  await p.waitForFunction(() => document.querySelector("#hp .num")?.textContent === "100");
  assert.equal(await p.textContent("#lives"), "♥♥♥ ");
  assert.ok((await p.textContent("#bossbar")).includes("누나"));
  assert.ok((await p.textContent("#bossbar")).includes("1단계"));
  assert.ok((await p.textContent("#team")).includes("친구"));
  assert.ok((await p.textContent("#slots")).includes("나무 검"));
  await p.waitForFunction(() => (document.querySelector("#telegraph")?.textContent || "").includes("돌진 준비"), null, { timeout: 8000 });
  const out = process.env.SHOT || "tmp/hud.png";
  await p.screenshot({ path: out });

  await p.evaluate(() => window.__nuna.hud.showResult({ won: true, isHost: true, stats: { durationSec: 321, contributions: { a: { name: "호스트", damage: 4000, pct: 57.1, deaths: 1 }, b: { name: "친구", damage: 3000, pct: 42.9, deaths: 0 } }, mvpId: "a", bossHpLeft: 0, bossMaxHp: 7000 } }));
  const result = await p.textContent("#result");
  assert.ok(result.includes("승리") && result.includes("MVP") && result.includes("5분 21초") && result.includes("낙성대동굴"));
  assert.equal(await p.$eval("#restart", (el) => el.hidden), false);
  const out2 = out.replace("hud.png", "result.png");
  await p.screenshot({ path: out2 });

  const errs = p.errors.filter((e) => !e.includes("__debug_scene__"));
  assert.deepEqual(errs, []);
  console.log("hud e2e OK", out, out2);
} finally {
  await browser.close();
  await s.close();
}
