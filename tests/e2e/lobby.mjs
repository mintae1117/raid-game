// 로비 e2e: 두 페이지 입장 → 목록 2명, 비호스트 난이도 비활성, 호스트 시작 → 둘 다 로비 숨김
import assert from "node:assert/strict";
import { createServer } from "../../server/index.js";
import { launch, newPage } from "./_browser.mjs";

const s = createServer({ port: 0 });
const port = await s.ready;
const browser = await launch();
try {
  const p1 = await newPage(browser);
  const p2 = await newPage(browser);
  await p1.goto(`http://127.0.0.1:${port}/`);
  await p1.fill("#name", "호스트");
  await p1.click("#join");
  await p1.waitForSelector("#players li");

  await p2.goto(`http://127.0.0.1:${port}/`);
  await p2.fill("#name", "친구");
  await p2.click("#join");
  await p1.waitForFunction(() => document.querySelectorAll("#players li").length === 2);
  await p2.waitForFunction(() => document.querySelectorAll("#players li").length === 2);

  assert.equal(await p2.$eval('input[name="difficulty"]', (el) => el.disabled), true, "비호스트 난이도 비활성");
  assert.equal(await p1.$eval('input[name="difficulty"]', (el) => el.disabled), false, "호스트 난이도 활성");
  assert.equal(await p2.$eval("#start", (el) => getComputedStyle(el).display), "none", "비호스트 시작 버튼 숨김");
  assert.ok((await p1.textContent("#lobby")).includes("낙성대동굴"));

  await p1.click("#start");
  const hidden = (sel) => () => getComputedStyle(document.querySelector("#lobby")).display === "none";
  await p1.waitForFunction(hidden());
  await p2.waitForFunction(hidden());
  assert.deepEqual(p1.errors, []);
  assert.deepEqual(p2.errors, []);
  console.log("lobby e2e OK");
} finally {
  await browser.close();
  await s.close();
}
