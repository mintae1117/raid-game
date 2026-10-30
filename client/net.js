// 웹소켓 연결: 토큰(localStorage.nunaToken) 보관, 끊기면 1·2·4초 백오프로 재접속하고 join 을 다시 보낸다.
const BACKOFF = [1000, 2000, 4000];

export function connect({ onMessage, onOpen, onClose } = {}) {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  let ws = null;
  let attempt = 0;
  let lastJoin = null;     // { name } — 재접속 때 토큰과 함께 다시 보냄
  let closedByUser = false;
  let reconnectTimer = null;

  const token = () => { try { return localStorage.getItem("nunaToken"); } catch { return null; } };
  const saveToken = (t) => { try { localStorage.setItem("nunaToken", t); } catch { /* 저장 불가 환경 */ } };

  function open() {
    ws = new WebSocket(url);
    ws.addEventListener("open", () => {
      const first = attempt === 0;
      attempt = 0;
      if (lastJoin) api.send({ type: "join", name: lastJoin.name, token: token() ?? undefined });
      onOpen?.({ reconnected: !first });
    });
    ws.addEventListener("message", (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === "welcome" && typeof msg.token === "string") saveToken(msg.token);
      onMessage?.(msg);
    });
    ws.addEventListener("close", () => {
      onClose?.({ willRetry: !closedByUser });
      if (closedByUser) return;
      const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
      attempt += 1;
      reconnectTimer = setTimeout(open, delay);
    });
    ws.addEventListener("error", () => { /* close 가 뒤따른다 */ });
  }

  const api = {
    send(obj) {
      if (obj && obj.type === "join") lastJoin = { name: obj.name };
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    },
    close() { closedByUser = true; clearTimeout(reconnectTimer); ws?.close(); },
    get connected() { return !!ws && ws.readyState === WebSocket.OPEN; },
    token,
  };
  open();
  return api;
}
