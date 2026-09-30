// node --experimental-websocket click.js <url> <w> <h> <waitMs> <x,y[;x,y...]> [out.png]
// Opens a page, clicks the given points in order (1.5 s apart), prints the URL after each click, saves a screenshot.
const { spawn } = require("child_process");
const fs = require("fs");
const [url, w, h, waitMs, points, out] = process.argv.slice(2);
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9300 + Math.floor(Math.random() * 500);
const prof = require("path").join(require("os").tmpdir(), "cal1615-click-" + port);
const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${w},${h}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 120 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = {};
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) pending[d.id](d.result); };
  await new Promise((r) => (ws.onopen = r));
  await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  await sleep(+waitMs);
  for (const pt of points.split(";")) {
    const [x, y] = pt.split(",").map(Number);
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    await sleep(4000);
    const r = await send("Runtime.evaluate", { expression: "location.pathname", returnByValue: true });
    console.log(`click ${x},${y} -> ${r.result.value}`);
  }
  if (out) { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(out, Buffer.from(r.data, "base64")); console.log("saved", out); }
  ws.close(); proc.kill(); process.exit(0);
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
