// node --experimental-websocket overflow.js <url> <width> <height> [waitMs] [scale]
// Lists elements whose content is bigger than their box (scrollbars or clipping) on a Perspective page.
const { spawn } = require("child_process");
const [url, w, h, waitMs = "20000", scale = "1"] = process.argv.slice(2);
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9300 + Math.floor(Math.random() * 500);
const prof = require("path").join(require("os").tmpdir(), "cal1615-ovf-" + port);
const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${w},${h}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 120 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = {};
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) pending[d.id](d.result); };
  await new Promise((r) => (ws.onopen = r));
  await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: +scale, mobile: false });
  await send("Page.navigate", { url });
  await sleep(+waitMs);
  const expr = process.env.EVAL ? require('fs').readFileSync(process.env.EVAL,'utf8') : `(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const oy = el.scrollHeight - el.clientHeight, ox = el.scrollWidth - el.clientWidth;
      if ((oy > 1 || ox > 1) && el.clientHeight > 0 && el.clientHeight < 400 && /auto|scroll|hidden/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
        const comp = el.closest('[data-component]');
        const view = el.closest('[data-component-path]');
        out.push({ tag: el.tagName, cls: (el.className && el.className.baseVal === undefined ? el.className : '').toString().slice(0, 60),
          comp: comp ? comp.getAttribute('data-component') : '', box: el.clientWidth + 'x' + el.clientHeight,
          content: el.scrollWidth + 'x' + el.scrollHeight, overflow: cs.overflow, text: (el.innerText || '').trim().slice(0, 30) });
      }
    }
    return JSON.stringify(out);
  })()`;
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  if (process.env.EVAL) { console.log(r.result.value); ws.close(); proc.kill(); process.exit(0); }
  const list = JSON.parse(r.result.value);
  const byComp = {};
  for (const e of list) { const k = `${e.comp} ${e.tag}.${e.cls.split(' ')[0]} box ${e.box} content ${e.content} [${(e.text||'').replace(/s+/g,' ')}]`; byComp[k] = (byComp[k] || 0) + 1; }
  console.log("overflowing elements:", list.length);
  Object.entries(byComp).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, n]) => console.log(String(n).padStart(4), k));
  ws.close(); proc.kill(); process.exit(0);
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
