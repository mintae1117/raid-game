// 로비 화면과 서버 메시지 분배. 게임 장면은 game/game.js(Task 15) 가 맡는다.
import { connect } from "./net.js";

window.__nuna = window.__nuna || {};
// ?scene=1 : 서버 접속 없이 장면만 띄우는 디버그 경로
if (new URLSearchParams(location.search).has("scene")) {
  document.querySelector("#lobby").style.display = "none";
  import("./game/debug.js").then((m) => m.startDebugScene());
  throw new Error("__debug_scene__"); // 아래 로비 초기화를 건너뛴다 (모듈 평가 중단)
}

const $ = (sel) => document.querySelector(sel);
const lobby = $("#lobby"), joinForm = $("#join-form"), nameInput = $("#name"), statusEl = $("#status");
const roomEl = $("#room"), playersEl = $("#players"), countEl = $("#count");
const diffInputs = [...document.querySelectorAll('input[name="difficulty"]')];
const startBtn = $("#start"), waitHint = $("#wait-hint"), copyBtn = $("#copy-url"), urlEl = $("#public-url"), urlHint = $("#url-hint");
const sensInput = $("#sensitivity"), sensValue = $("#sensitivity-value");
const spectateBanner = $("#spectate-banner");

const state = { myId: null, hostId: null, name: null, lobby: null, game: null, lastStart: null };
window.__nuna = window.__nuna || {};
window.__nuna.state = state;

// ----- 감도 -----
const savedSens = Number(localStorage.getItem("nunaSensitivity")) || 1;
sensInput.value = String(savedSens);
sensValue.textContent = savedSens.toFixed(1);
sensInput.addEventListener("input", () => { sensValue.textContent = Number(sensInput.value).toFixed(1); localStorage.setItem("nunaSensitivity", sensInput.value); });
const sensitivity = () => Number(sensInput.value) || 1;

// ----- 네트워크 -----
const net = connect({
  onMessage: handle,
  onOpen: ({ reconnected }) => {
    if (reconnected) { setStatus("다시 연결됐어요.", "ok"); state.game?.hud.connection(null); }
    else autoJoin();
  },
  onClose: ({ willRetry }) => {
    if (!willRetry) return;
    setStatus("연결이 끊겼어요. 다시 연결 중…");
    state.game?.hud.connection("연결 끊김 — 다시 연결 중… (60초 안에 돌아오면 이어서 합니다)");
  },
});
window.__nuna.net = net;

function setStatus(text, kind) {
  statusEl.hidden = !text;
  statusEl.textContent = text || "";
  statusEl.style.color = kind === "ok" ? "var(--ok)" : "var(--danger)";
}

// 새로고침·재접속: 저장된 이름과 토큰으로 자동 입장
function autoJoin() {
  const name = localStorage.getItem("nunaName");
  if (name) nameInput.value = name;
  if (name && localStorage.getItem("nunaToken")) join(name);
}

function join(name) {
  state.name = name;
  localStorage.setItem("nunaName", name);
  net.send({ type: "join", name, token: localStorage.getItem("nunaToken") ?? undefined });
}

joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (name.length < 2 || name.length > 12) return setStatus("닉네임은 2~12자로 적어주세요.");
  setStatus("");
  join(name);
});

diffInputs.forEach((el) => el.addEventListener("change", () => { if (el.checked) net.send({ type: "difficulty", level: el.value }); }));
startBtn.addEventListener("click", () => net.send({ type: "start" }));
copyBtn.addEventListener("click", async () => {
  const url = urlEl.textContent;
  try { await navigator.clipboard.writeText(url); urlHint.textContent = "복사했어요! 친구에게 보내세요."; }
  catch { urlHint.textContent = "복사가 막혔어요. 주소를 직접 드래그해 복사하세요."; }
});

// ----- 메시지 처리 -----
function handle(msg) {
  switch (msg.type) {
    case "welcome":
      state.myId = msg.id;
      joinForm.hidden = true;
      roomEl.hidden = false;
      setStatus("");
      break;
    case "error":
      if (msg.reason === "full") setStatus("방이 가득 찼어요 (최대 4명). 다음 판을 기다려 주세요.");
      else if (msg.reason === "name") setStatus("닉네임은 2~12자로 적어주세요.");
      else setStatus("오류: " + msg.reason);
      break;
    case "lobby":
      state.lobby = msg;
      state.hostId = msg.hostId;
      renderLobby(msg);
      showLobby();
      break;
    case "start":
      state.lastStart = msg;
      hideLobby();
      startGame(msg, false);
      break;
    case "spectate":
      state.lastStart = msg;
      hideLobby();
      spectateBanner.hidden = false;
      startGame(msg, true);
      break;
    case "event":
      // 게임 중·결과 화면에서 호스트가 바뀌면(left) 로비 메시지 없이도 호스트 상태를 갱신한다
      if (msg.event && typeof msg.event.hostId === "string") {
        state.hostId = msg.event.hostId;
        state.game?.setHost?.(state.hostId === state.myId);
      }
      state.game?.onMessage?.(msg);
      break;
    default:
      state.game?.onMessage?.(msg);
  }
}

function renderLobby(l) {
  const isHost = l.hostId === state.myId;
  countEl.textContent = `${l.players.length}/4`;
  playersEl.innerHTML = "";
  for (const p of l.players) {
    const li = document.createElement("li");
    if (p.id === state.myId) li.classList.add("me");
    li.innerHTML = `<span></span><span class="tag"></span>`;
    li.firstChild.textContent = p.name + (p.id === state.myId ? " (나)" : "");
    li.lastChild.textContent = p.host ? "호스트" : "";
    playersEl.appendChild(li);
  }
  diffInputs.forEach((el) => { el.disabled = !isHost; el.checked = el.value === l.difficulty; });
  $("#difficulty-hint").hidden = isHost;
  startBtn.style.display = isHost ? "" : "none";
  waitHint.hidden = isHost;
  const url = l.publicUrl || location.origin;
  urlEl.textContent = url;
  urlHint.textContent = l.publicUrl ? "" : "아직 공개 주소가 없어요. 호스트 PC 에서 npm run tunnel 을 실행하면 여기에 나타나요.";
  document.title = `누나 레이드 — ${l.map}`;
}

function showLobby() {
  spectateBanner.hidden = true;
  if (state.game) { state.game.stop(); state.game = null; }
  lobby.style.display = "";
}
function hideLobby() { lobby.style.display = "none"; }

async function startGame(startMsg, spectator) {
  if (state.game) { state.game.stop(); state.game = null; }
  try {
    const mod = await import("./game/game.js");
    state.game = mod.startGame(startMsg, net, { myId: state.myId, name: state.name, sensitivity: sensitivity(), spectator, isHost: () => state.hostId === state.myId });
  } catch (err) {
    console.log("게임 장면은 아직 준비 중:", err.message);
  }
}
