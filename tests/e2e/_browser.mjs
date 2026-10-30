// e2e 공용: 로컬 npx 캐시의 playwright-core 로 헤드리스 크로미움을 띄운다 (WebGL 은 SwiftShader)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// playwright-core 는 devDependency 가 아니다: PW_PATH 환경변수(절대 경로) 또는 설치된 playwright-core 를 쓴다
const CANDIDATES = [process.env.PW_PATH, "playwright-core"].filter(Boolean);
let chromium = null;
for (const c of CANDIDATES) { try { ({ chromium } = require(c)); break; } catch { /* 다음 후보 */ } }
if (!chromium) throw new Error("playwright-core 를 찾지 못했습니다. `npm i -D playwright-core` 후 `npx playwright install chromium` 하거나 PW_PATH 를 지정하세요.");

export async function launch() {
  return chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
}

export async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });
  return page;
}
