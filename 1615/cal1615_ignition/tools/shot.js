// node --experimental-websocket shot.js <url> <width> <height> <out.png> [waitMs]
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const [url, w, h, out, waitMs = "12000"] = process.argv.slice(2);
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9300 + Math.floor(Math.random() * 500);
const prof = path.join(require("os").tmpdir(), "cal1615-cdp-" + port);
const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${w},${h}`, "about:blank"], { stdio: "ignore" });
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
  await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 600 });
  await send("Page.navigate", { url });
  await sleep(+waitMs);
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(out, Buffer.from(r.data, "base64"));
  ws.close(); proc.kill();
  console.log("saved", out);
  process.exit(0);
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
