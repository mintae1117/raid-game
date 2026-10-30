// 테스트용 가짜 타이머·커넥션 (Room 은 timers 를 주입받으므로 실시간 없이 돌릴 수 있다)
export function fakeTimers() {
  let t = 0;
  const intervals = new Map();
  let nextId = 1;
  return {
    now: () => t,
    setInterval(fn, ms) { const id = nextId++; intervals.set(id, { fn, ms, next: t + ms / 1000 }); return id; },
    clearInterval(id) { intervals.delete(id); },
    advance(sec) {
      const end = t + sec;
      for (;;) {
        let soonest = null;
        for (const iv of intervals.values()) if (iv.next <= end && (!soonest || iv.next < soonest.next)) soonest = iv;
        if (!soonest) break;
        t = soonest.next;
        soonest.next += soonest.ms / 1000;
        soonest.fn();
      }
      t = end;
    },
  };
}

export function fake(id) {
  return { id, sent: [], closed: false, send(o) { this.sent.push(o); }, close() { this.closed = true; } };
}
