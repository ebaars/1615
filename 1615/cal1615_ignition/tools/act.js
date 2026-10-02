// node --experimental-websocket act.js <url> <w> <h> <waitMs> <steps> [out.png]
// steps separated by ';' : c:x,y (click)  t:text (type)  w:ms (wait)  s:file.png (screenshot)
const { spawn } = require("child_process");
const fs = require("fs");
const [url, w, h, waitMs, steps, out] = process.argv.slice(2);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const port = 9300 + Math.floor(Math.random() * 500);
const prof = require("path").join(require("os").tmpdir(), "cal1615-act-" + port);
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
  const shot = async (f) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(f, Buffer.from(r.data, "base64")); console.log("saved", f); };
  for (const st of steps.split(";")) {
    const [k, ...rest] = st.split(":"); const arg = rest.join(":");
    if (k === "c") { const [x, y] = arg.split(",").map(Number); for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }); await sleep(2500); }
    else if (k === "t") { await send("Input.insertText", { text: arg }); await sleep(1500); }
    else if (k === "w") await sleep(+arg);
    else if (k === "s") await shot(arg);
  }
  if (out) await shot(out);
  ws.close(); proc.kill(); process.exit(0);
})().catch((e) => { console.error(e); proc.kill(); process.exit(1); });
