// 플레이 e2e: 두 페이지 입장·시작 → HUD·스냅샷 수신, 낙사 → 상대 팀 목록에 목숨 2, 누나 HP 1 + 공격 → 둘 다 "승리", 호스트 다시 하기 → 로비
import assert from "node:assert/strict";
import { createServer } from "../../server/index.js";
import { launch, newPage } from "./_browser.mjs";

const s = createServer({ port: 0, debug: true });
const port = await s.ready;
const browser = await launch();
const base = `http://127.0.0.1:${port}`;
try {
  const p1 = await newPage(browser), p2 = await newPage(browser);
  for (const [p, name] of [[p1, "호스트"], [p2, "친구"]]) {
    await p.goto(`${base}/`);
    await p.fill("#name", name);
    await p.click("#join");
    await p.waitForSelector("#players li");
  }
  await p1.waitForFunction(() => document.querySelectorAll("#players li").length === 2);
  await p1.click("#start");
  for (const p of [p1, p2]) {
    await p.waitForFunction(() => !document.querySelector("#hud").hidden, null, { timeout: 15000 });
    await p.waitForFunction(() => window.__nuna.snapCount > 10, null, { timeout: 15000 });
  }
  assert.ok((await p1.textContent("#team")).includes("친구"));
  assert.ok((await p2.textContent("#bossbar")).includes("누나"));

  // 게임 중 페이지2 소켓이 끊기면(터널 흔들림) HUD 에 표시되고, 자동 재접속 뒤 같은 플레이어로 이어진다
  const myId2 = await p2.evaluate(() => window.__nuna.state.myId);
  s.room.conns.get(s.room.members.find((m) => m.id === myId2).connId).close();
  await p2.waitForFunction(() => !document.querySelector("#conn-note").hidden, null, { timeout: 3000 });
  await p2.waitForFunction(() => document.querySelector("#conn-note").hidden && !document.querySelector("#hud").hidden, null, { timeout: 8000 });
  assert.equal(await p2.evaluate(() => window.__nuna.state.myId), myId2, "재접속 뒤 같은 플레이어 id");
  const snapBefore = await p2.evaluate(() => window.__nuna.snapCount);
  await p2.waitForFunction((n) => window.__nuna.snapCount > n + 5, snapBefore, { timeout: 5000 });

  // 페이지1 낙사 → 페이지2 팀 목록에 호스트 목숨 2
  await p1.evaluate(() => window.__nuna.net.send({ type: "fell" }));
  await p2.waitForFunction(() => [...document.querySelectorAll("#team .member")].some((m) => m.querySelector(".n").textContent === "호스트" && m.querySelector(".l").textContent === "♥♥"), null, { timeout: 5000 });
  await p1.waitForFunction(() => !document.querySelector("#death-overlay").hidden, null, { timeout: 3000 });

  // 누나 HP 1 로 내리고 페이지2 앞에 세운 뒤 공격 → 승리
  let won = false;
  for (let i = 0; i < 10 && !won; i++) {
    const r = await fetch(`${base}/debug/boss-hp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.adminToken}` }, body: JSON.stringify({ hp: 1, inFrontOf: myId2 }) });
    assert.equal(r.status, 200);
    await p2.evaluate(() => window.__nuna.net.send({ type: "attack", dir: window.__nuna.ctrl.lookDir() }));
    await p2.waitForTimeout(600);
    won = await p2.evaluate(() => window.__nuna.state.game?.won === true);
  }
  assert.ok(won, "공격으로 승리");
  for (const p of [p1, p2]) {
    await p.waitForFunction(() => !document.querySelector("#result").hidden && document.querySelector("#result").textContent.includes("승리"), null, { timeout: 10000 });
  }
  assert.equal(await p2.$eval("#restart", (el) => el.hidden), true, "비호스트는 다시 하기 숨김");
  const out = process.env.SHOT || "tmp/play.png";
  await p1.screenshot({ path: out });

  // 결과 화면에서 호스트(페이지1)가 나가면 페이지2 가 호스트가 되어 다시 하기 버튼이 나타난다
  await p1.close();
  await p2.waitForFunction(() => !document.querySelector("#restart").hidden, null, { timeout: 5000 });
  await p2.click("#restart");
  await p2.waitForFunction(() => getComputedStyle(document.querySelector("#lobby")).display !== "none" && document.querySelector("#result").hidden, null, { timeout: 5000 });
  assert.equal(await p2.$eval('input[name="difficulty"]:checked', (el) => el.value), "normal");
  assert.equal(await p2.$eval('input[name="difficulty"]', (el) => el.disabled), false, "새 호스트는 난이도 변경 가능");
  assert.deepEqual(p2.errors, []);
  console.log("play e2e OK", out);
} finally {
  await browser.close();
  await s.close();
}
