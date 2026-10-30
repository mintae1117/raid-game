// Cloudflare quick tunnel 을 띄워 공개 URL 을 얻고, 서버에 알려 로비에 표시한다. (사용: npm run tunnel)
import { spawn } from "node:child_process";
import fs from "node:fs";
import { bin, install } from "cloudflared";
import { ADMIN_TOKEN_FILE } from "../server/index.js";

const PORT = Number(process.env.PORT) || 3000;
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

async function ensureBinary() {
  if (!fs.existsSync(bin)) {
    console.log("cloudflared 바이너리를 내려받는 중...");
    await install(bin);
  }
}

async function announce(url) {
  const line = "═".repeat(url.length + 4);
  console.log(`\n${line}\n  ${url}\n${line}\n이 주소를 친구들에게 보내세요. (서버: http://localhost:${PORT})\n`);
  try {
    let token = "";
    try { token = fs.readFileSync(ADMIN_TOKEN_FILE, "utf8").trim(); } catch { console.warn("관리 토큰 파일이 없습니다. 서버(npm start)가 켜져 있어야 로비에 주소가 표시됩니다."); }
    const res = await fetch(`http://localhost:${PORT}/public-url`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ url }) });
    if (!res.ok) console.warn(`서버에 공개 URL 을 전달하지 못했습니다 (${res.status}). 서버가 켜져 있는지 확인하세요.`);
  } catch (err) {
    console.warn(`서버(localhost:${PORT})에 연결할 수 없습니다: ${err.message}. 먼저 npm start 를 실행하세요.`);
  }
}

async function main() {
  await ensureBinary();
  const child = spawn(bin, ["tunnel", "--url", `http://localhost:${PORT}`, "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"] });
  let announced = false;
  const onData = (chunk) => {
    const text = chunk.toString();
    if (!announced) {
      const m = text.match(URL_RE);
      if (m) { announced = true; announce(m[0]); }
    }
    if (process.env.TUNNEL_VERBOSE) process.stderr.write(text);
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("exit", (code) => { console.log(`터널 종료 (code ${code})`); process.exit(code ?? 0); });
  const stop = () => child.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => { console.error(err); process.exit(1); });
