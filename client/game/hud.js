// HUD: 십자선·내 HP/목숨/무기 슬롯·누나 체력 바·팀 목록·예고·토스트·사망 카운트다운·결과 화면
import { WEAPONS } from "/shared/constants.js";

const HEART = "♥";

export function createHud(root, resultRoot = document.querySelector("#result")) {
  root.innerHTML = `
    <div id="crosshair"></div>
    <div id="hitmarker"></div>
    <div id="damage-flash"></div>
    <div id="bossbar"><div class="label"><span class="name">누나</span><span id="boss-phase"></span></div><div class="bar"><div class="fill"></div></div><div id="boss-hp-num"></div></div>
    <div id="team"></div>
    <div id="telegraph"></div>
    <div id="toasts"></div>
    <div id="self">
      <div id="lives"></div>
      <div id="hp"><div class="fill"></div><span class="num"></span></div>
      <div id="slots"><div class="slot" data-slot="1"><b>1</b><span></span></div><div class="slot" data-slot="2"><b>2</b><span></span></div></div>
      <div id="boots" hidden></div>
    </div>
    <div id="death-overlay" hidden></div>
    <div id="center-note" hidden></div>
    <div id="conn-note" hidden></div>
    <div id="lock-hint" hidden>화면을 클릭하면 조작이 시작됩니다 · WASD 이동 · Space 점프 · 좌클릭 공격 · Esc 로 마우스 해제</div>
  `;
  const $ = (s) => root.querySelector(s);
  const hpFill = $("#hp .fill"), hpNum = $("#hp .num"), livesEl = $("#lives");
  const slots = [$('.slot[data-slot="1"]'), $('.slot[data-slot="2"]')];
  const bossFill = $("#bossbar .fill"), bossPhase = $("#boss-phase"), bossNum = $("#boss-hp-num");
  const teamEl = $("#team"), teleEl = $("#telegraph"), toastsEl = $("#toasts");
  const deathEl = $("#death-overlay"), noteEl = $("#center-note"), connEl = $("#conn-note"), flashEl = $("#damage-flash");
  let mapName = "낙성대동굴";
  let lastHp = null;

  const bootsEl = $("#boots");
  function setSelf({ hp, lives, melee, special, activeSlot, bootsLeft = 0 }) {
    bootsEl.hidden = !(bootsLeft > 0);
    if (bootsLeft > 0) bootsEl.textContent = `👟 신발 ${Math.ceil(bootsLeft)}초 — Shift 를 누르면 질주`;
    hpFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    hpFill.classList.toggle("low", hp <= 30);
    hpNum.textContent = String(Math.round(hp));
    livesEl.textContent = HEART.repeat(Math.max(0, lives)) + " " + "♡".repeat(Math.max(0, 3 - lives));
    slots[0].querySelector("span").textContent = WEAPONS[melee]?.label ?? melee;
    slots[1].querySelector("span").textContent = special ? `${WEAPONS[special.kind]?.label ?? special.kind} ×${special.ammo}` : "비어 있음";
    slots[0].classList.toggle("active", activeSlot !== 2);
    slots[1].classList.toggle("active", activeSlot === 2);
    slots[1].classList.toggle("empty", !special);
    if (lastHp !== null && hp < lastHp) flash();
    lastHp = hp;
  }

  function setBoss({ hp, maxHp, phase, state }) {
    const pct = maxHp > 0 ? (hp / maxHp) * 100 : 0;
    bossFill.style.width = `${pct}%`;
    bossFill.classList.toggle("enraged", phase >= 3);
    bossPhase.textContent = state === "dead" ? "쓰러짐" : `${phase}단계`;
    bossNum.textContent = `${Math.ceil(hp)} / ${maxHp}`;
  }

  function setTeam(list) {
    teamEl.innerHTML = "";
    for (const p of list) {
      const li = document.createElement("div");
      li.className = "member" + (p.isMe ? " me" : "") + (!p.alive ? " dead" : "") + (!p.connected ? " off" : "");
      const status = !p.connected ? "끊김" : !p.alive ? (p.lives > 0 ? "부활 대기" : "탈락") : "";
      li.innerHTML = `<span class="n"></span><span class="l"></span><div class="bar"><div class="fill"></div></div><span class="s"></span>`;
      li.querySelector(".n").textContent = p.name;
      li.querySelector(".l").textContent = HEART.repeat(Math.max(0, p.lives));
      li.querySelector(".fill").style.width = `${Math.max(0, Math.min(100, p.hp))}%`;
      li.querySelector(".s").textContent = status;
      teamEl.appendChild(li);
    }
  }

  function telegraph(text) {
    teleEl.textContent = text || "";
    teleEl.classList.toggle("on", !!text);
  }

  function toast(text, kind = "") {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.textContent = text;
    toastsEl.appendChild(el);
    while (toastsEl.children.length > 5) toastsEl.firstChild.remove();
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, 2600);
  }

  const hitEl = $("#hitmarker");
  let hitTimer = null;
  function hitMarker() {
    hitEl.classList.add("on");
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => hitEl.classList.remove("on"), 130);
  }

  function flash() {
    flashEl.classList.remove("on");
    void flashEl.offsetWidth;
    flashEl.classList.add("on");
  }

  function setDeath(secondsLeft, livesLeft) {
    if (secondsLeft === null || secondsLeft === undefined) { deathEl.hidden = true; return; }
    deathEl.hidden = false;
    deathEl.innerHTML = `<div class="big">쓰러졌다…</div><div class="count"></div><div class="small"></div>`;
    deathEl.querySelector(".count").textContent = `${Math.ceil(secondsLeft)}초 뒤 부활`;
    deathEl.querySelector(".small").textContent = `남은 목숨 ${HEART.repeat(Math.max(0, livesLeft))}`;
  }

  function note(text) { noteEl.hidden = !text; noteEl.textContent = text || ""; }
  const lockEl = $("#lock-hint");
  function lockHint(show) { if (lockEl.hidden === !show) return; lockEl.hidden = !show; }
  function connection(text) { connEl.hidden = !text; connEl.textContent = text || ""; }

  function fmtTime(sec) { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, "0")}초`; }

  function showResult({ won, stats, isHost, onRestart }) {
    resultRoot.hidden = false;
    resultRoot.innerHTML = `
      <div class="panel">
        <h1 class="${won ? "won" : "lost"}">${won ? "승리!" : "패배…"}</h1>
        <p class="sub"></p>
        <table><thead><tr><th>플레이어</th><th>피해</th><th>기여</th><th>사망</th></tr></thead><tbody></tbody></table>
        <p class="boss-left" hidden></p>
        <button id="restart" type="button">다시 하기</button>
        <p class="wait" hidden>호스트가 다시 하기를 누르길 기다리는 중…</p>
      </div>`;
    const sub = resultRoot.querySelector(".sub");
    sub.textContent = `${mapName} · ${fmtTime(stats.durationSec)}`;
    const tbody = resultRoot.querySelector("tbody");
    const rows = Object.entries(stats.contributions || {}).sort((a, b) => b[1].damage - a[1].damage);
    for (const [id, c] of rows) {
      const tr = document.createElement("tr");
      if (id === stats.mvpId) tr.classList.add("mvp");
      tr.innerHTML = `<td></td><td></td><td></td><td></td>`;
      tr.children[0].textContent = c.name + (id === stats.mvpId ? " 👑 MVP" : "");
      tr.children[1].textContent = String(Math.round(c.damage));
      tr.children[2].textContent = `${c.pct.toFixed(0)}%`;
      tr.children[3].textContent = String(c.deaths);
      tbody.appendChild(tr);
    }
    if (!won) { const bl = resultRoot.querySelector(".boss-left"); bl.hidden = false; bl.textContent = `누나 남은 체력 ${Math.ceil(stats.bossHpLeft)} / ${stats.bossMaxHp}`; }
    const btn = resultRoot.querySelector("#restart");
    btn.hidden = !isHost;
    resultRoot.querySelector(".wait").hidden = isHost;
    btn.addEventListener("click", () => onRestart?.());
  }
  function setResultHost(isHost) {
    const btn = resultRoot.querySelector("#restart"), wait = resultRoot.querySelector(".wait");
    if (!btn) return;
    btn.hidden = !isHost;
    wait.hidden = isHost;
  }
  function hideResult() { resultRoot.hidden = true; resultRoot.innerHTML = ""; }
  function setMap(name) { mapName = name; }

  return { setSelf, setBoss, setTeam, telegraph, toast, flash, hitMarker, setDeath, note, lockHint, connection, showResult, setResultHost, hideResult, setMap };
}
