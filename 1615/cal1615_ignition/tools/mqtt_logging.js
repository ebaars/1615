// MQTT link for the tag export: adds
//   - [cal1615]HMI/MQTT/*  state for the page (state, msg, connected, counters, last times) and the Publish now button (a pulse)
//   - [cal1615]HMI/mqtt_tick  an expression tag, now(1000), whose valueChanged script is tools/mqtt_tick.py
// The published process values are every analog tag in the export with history enabled (the 10 s periodic ones), like the roll logging.
// Run:  node mqtt_logging.js     (idempotent; run roll_logging.js first if the tag list changed)
const fs = require("fs");
const TAGS = "E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tags/cal1615_tags.json";
const SRC = "E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tools/mqtt_tick.py";
const MARK = "TAGS = []   # @@TAGS@@";
const MARK_AJ = "AJ = []     # @@AJ@@";
const DIR = "E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tools/";
const src = fs.readFileSync(SRC, "utf8");
if (!src.includes(MARK) || !src.includes(MARK_AJ)) throw new Error("marker missing in mqtt_tick.py");

const j = JSON.parse(fs.readFileSync(TAGS, "utf8"));
const find = (ts, name) => ts.find((t) => t.name === name);
const list = [];
const walk = (ts, p) => { for (const t of ts) { const q = p ? `${p}/${t.name}` : t.name;
  if (t.tagType === "AtomicTag" && t.historyEnabled && /^(Float|Int)/.test(t.dataType)) list.push(`[cal1615]${q}`);
  if (t.tags) walk(t.tags, q); } };
walk(j.tags, "");
list.sort();

// The Sparkplug metrics: aj_line_tags.csv (the AJ line tag list from machineiq docs/machines/AJ_LINE) names the PLC tags and the metric names the cloud expects,
// aj_line_critical.txt the critical ones (from that line's AJ_Line_config.yaml). Each tag is found in the tag export (same name, or with the dots as folders);
// one that is not there is added as an OPC tag under [cal1615]AJ.
const atomic = new Map();
const walk2 = (ts, p) => { for (const t of ts) { const q = p ? `${p}/${t.name}` : t.name; if (t.tagType === "AtomicTag") atomic.set(q, t); if (t.tags) walk2(t.tags, q); } };
j.tags = j.tags.filter((t) => t.name !== "AJ");
walk2(j.tags, "");
const critical = new Set(fs.readFileSync(DIR + "aj_line_critical.txt", "utf8").split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
const DTYPE = { float: "Float4", int: "Int4", bool: "Boolean", string: "String" };
const aj = [], added = [];
for (const line of fs.readFileSync(DIR + "aj_line_tags.csv", "utf8").split(/\r?\n/).slice(1).filter(Boolean)) {
  const c = line.match(/^([^,]*),([^,]*),([^,]*),/);
  const plc = c[1], metric = c[2], type = c[3];
  if (plc.startsWith("(edge derived)")) continue;
  const last = plc.split(".").pop();
  const cand = [plc, plc.replace(/\./g, "/"), plc.replace(/\./g, "/") + "/" + last, metric];
  let path = cand.find((x) => atomic.has(x));
  if (!path) {
    path = "AJ/" + metric;
    added.push({ name: metric, tagType: "AtomicTag", dataType: DTYPE[type], valueSource: "opc", opcServer: "cal1615", opcItemPath: `nsu=FTLGW_Server_Namespace;s=[PLC]${plc}` });
  }
  aj.push([metric, path, type, critical.has(metric)]);
}
j.tags.push({ name: "AJ", tagType: "Folder", tags: added });
const mem = (name, dataType, value) => ({ name, tagType: "AtomicTag", valueSource: "memory", dataType, value });
const hmi = find(j.tags, "HMI");
hmi.tags = hmi.tags.filter((t) => t.name !== "MQTT" && t.name !== "mqtt_tick");
hmi.tags.push({ name: "MQTT", tagType: "Folder", tags: [
  mem("state", "String", "DISABLED"), mem("msg", "String", ""), mem("connected", "Boolean", false),
  mem("count_out", "Int4", 0), mem("count_in", "Int4", 0), mem("rejected", "Int4", 0),
  mem("last_out", "DateTime", null), mem("last_in", "DateTime", null), mem("publish_now", "Boolean", false) ] });
const body = src.replace(MARK, "TAGS = [\n" + list.map((t) => `\t${JSON.stringify(t)},`).join("\n") + "\n]")
  .replace(MARK_AJ, "AJ = [\n" + aj.map((t) => `\t(${JSON.stringify(t[0])}, ${JSON.stringify(t[1])}, ${JSON.stringify(t[2])}, ${t[3] ? "True" : "False"}),`).join("\n") + "\n]");
// the lists are Python, not JSON: a true / false / null in them is a NameError on the gateway
if (/\b(true|false|null)\b/.test(body.slice(body.indexOf("TAGS = ["), body.indexOf("DEFAULTS = [")))) throw new Error("JSON literal in the generated Python lists");
const script = body.split("\n").map((l) => (l.length ? "\t" + l : l)).join("\n");
hmi.tags.push({ name: "mqtt_tick", tagType: "AtomicTag", valueSource: "expr", dataType: "DateTime", expression: "now(1000)",
  documentation: "MQTT link to AWS IoT Core: publishes the process values and subscribes to the topic. See tools/mqtt_tick.py.",
  eventScripts: [{ eventid: "valueChanged", script }] });
fs.writeFileSync(TAGS, JSON.stringify(j, null, 2) + "\n");
console.log(`mqtt written: ${aj.length} Sparkplug metrics (${added.length} new OPC tags), ${list.length} JSON process values, script ${script.split("\n").length} lines`);
