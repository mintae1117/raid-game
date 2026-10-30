// 컨트롤러 e2e: 넉백으로 가장자리에서 낙사(1회), 중앙에선 안 떨어짐, 포인터 락 없으면 키 입력 무시
import assert from "node:assert/strict";
import { createServer } from "../../server/index.js";
import { launch, newPage } from "./_browser.mjs";

const s = createServer({ port: 0 });
const port = await s.ready;
const browser = await launch();
try {
  const p = await newPage(browser);
  await p.goto(`http://127.0.0.1:${port}/?scene=1`);
  await p.waitForFunction(() => window.__nuna && window.__nuna.sceneReady === true && window.__nuna.ctrl, null, { timeout: 15000 });

  // 1) 가장자리 6m 안(x=20)에서 스펙의 돌진 넉백(6m) → 섬 밖으로 밀려 낙사
  await p.evaluate(() => { window.__nuna.ctrl.reset({ x: 20, y: 1, z: 0 }); window.__nuna.ctrl.applyKnock({ x: 6, y: 1.5, z: 0 }); });
  await p.waitForTimeout(2000);
  assert.equal(await p.evaluate(() => window.__nuna.fellCount), 1, "가장자리 넉백은 낙사");
  await p.waitForTimeout(500);
  assert.equal(await p.evaluate(() => window.__nuna.fellCount), 1, "fell 은 한 번만");

  // 2) 중앙(안전 반경 12m 안)에서 같은 넉백 → 약 6m 밀리고 안 떨어짐
  await p.evaluate(() => { window.__nuna.ctrl.reset({ x: 0, y: 1, z: 0 }); window.__nuna.ctrl.applyKnock({ x: 6, y: 1.5, z: 0 }); });
  await p.waitForTimeout(1500);
  const after = await p.evaluate(() => ({ fell: window.__nuna.fellCount, pos: { ...window.__nuna.ctrl.pos }, onGround: window.__nuna.ctrl.onGround }));
  assert.equal(after.fell, 1);
  assert.ok(after.pos.x > 4.5 && after.pos.x < 7.5, `밀린 거리 ${after.pos.x}`);
  assert.equal(after.pos.y, 1);
  assert.equal(after.onGround, true);

  // 3) 포인터 락 없이 W 를 눌러도 움직이지 않음
  await p.evaluate(() => window.__nuna.ctrl.reset({ x: 0, y: 1, z: 0 }));
  await p.keyboard.down("w");
  await p.waitForTimeout(500);
  await p.keyboard.up("w");
  const pos = await p.evaluate(() => ({ ...window.__nuna.ctrl.pos }));
  assert.deepEqual(pos, { x: 0, y: 1, z: 0 });
  assert.equal(await p.evaluate(() => window.__nuna.ctrl.locked), false);

  // 4) 락 상태에서는 한글 입력 모드(key="ㅈ", code="KeyW")로 눌러도 앞으로 움직인다 — 물리 키 위치로 판단
  await p.evaluate(() => { window.__nuna.ctrl.reset({ x: 0, y: 1, z: 0, yaw: 0 }); window.__nuna.ctrl.locked = true; window.dispatchEvent(new KeyboardEvent("keydown", { key: "ㅈ", code: "KeyW", bubbles: true })); });
  await p.waitForTimeout(400);
  await p.evaluate(() => { window.dispatchEvent(new KeyboardEvent("keyup", { key: "ㅈ", code: "KeyW", bubbles: true })); window.__nuna.ctrl.locked = false; });
  const moved = await p.evaluate(() => ({ ...window.__nuna.ctrl.pos }));
  assert.ok(moved.z > 1, `한글 모드 W 로 전진해야 함 (z=${moved.z})`);
  assert.ok(Math.abs(moved.x) < 0.01);

  // 5) 부츠(질주 허용) + Shift: 같은 0.4초 동안 1.4배 이상 더 멀리 간다
  const runFor = async (sprint) => {
    await p.evaluate((sprint) => { const c = window.__nuna.ctrl; c.reset({ x: 0, y: 1, z: 0, yaw: 0 }); c.locked = true; c.sprintAllowed = sprint; window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft", key: "Shift", bubbles: true })); window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "w", bubbles: true })); }, sprint);
    await p.waitForTimeout(400);
    return p.evaluate(() => { window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", key: "w", bubbles: true })); window.dispatchEvent(new KeyboardEvent("keyup", { code: "ShiftLeft", key: "Shift", bubbles: true })); window.__nuna.ctrl.locked = false; return window.__nuna.ctrl.pos.z; });
  };
  const walk = await runFor(false), sprint = await runFor(true);
  assert.ok(sprint > walk * 1.4, `질주 ${sprint.toFixed(2)} vs 걷기 ${walk.toFixed(2)}`);

  const errs = p.errors.filter((e) => !e.includes("__debug_scene__"));
  assert.deepEqual(errs, []);
  console.log("controller e2e OK");
} finally {
  await browser.close();
  await s.close();
}
