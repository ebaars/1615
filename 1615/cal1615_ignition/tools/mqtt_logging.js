// MQTT link for the tag export: adds
//   - [cal1615]HMI/MQTT/*  state for the page (state, msg, connected, counters, last times) and the Publish now button (a pulse)
//   - [cal1615]HMI/mqtt_tick  an expression tag, now(1000), whose valueChanged script is tools/mqtt_tick.py
// The published process values are every analog tag in the export with history enabled (the 10 s periodic ones), like the roll logging.
// Run:  node mqtt_logging.js     (idempotent; run roll_logging.js first if the tag list changed)
const fs = require("fs");
const TAGS = "E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tags/cal1615_tags.json";
const SRC = "E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tools/mqtt_tick.py";
const MARK = "TAGS = []   # @@TAGS@@";
const src = fs.readFileSync(SRC, "utf8");
if (!src.includes(MARK)) throw new Error("marker missing in mqtt_tick.py");

const j = JSON.parse(fs.readFileSync(TAGS, "utf8"));
const find = (ts, name) => ts.find((t) => t.name === name);
const list = [];
const walk = (ts, p) => { for (const t of ts) { const q = p ? `${p}/${t.name}` : t.name;
  if (t.tagType === "AtomicTag" && t.historyEnabled && /^(Float|Int)/.test(t.dataType)) list.push(`[cal1615]${q}`);
  if (t.tags) walk(t.tags, q); } };
walk(j.tags, "");
list.sort();

const mem = (name, dataType, value) => ({ name, tagType: "AtomicTag", valueSource: "memory", dataType, value });
const hmi = find(j.tags, "HMI");
hmi.tags = hmi.tags.filter((t) => t.name !== "MQTT" && t.name !== "mqtt_tick");
hmi.tags.push({ name: "MQTT", tagType: "Folder", tags: [
  mem("state", "String", "DISABLED"), mem("msg", "String", ""), mem("connected", "Boolean", false),
  mem("count_out", "Int4", 0), mem("count_in", "Int4", 0), mem("rejected", "Int4", 0),
  mem("last_out", "DateTime", null), mem("last_in", "DateTime", null), mem("publish_now", "Boolean", false) ] });
const body = src.replace(MARK, "TAGS = [\n" + list.map((t) => `\t${JSON.stringify(t)},`).join("\n") + "\n]");
const script = body.split("\n").map((l) => (l.length ? "\t" + l : l)).join("\n");
hmi.tags.push({ name: "mqtt_tick", tagType: "AtomicTag", valueSource: "expr", dataType: "DateTime", expression: "now(1000)",
  documentation: "MQTT link to AWS IoT Core: publishes the process values and subscribes to the topic. See tools/mqtt_tick.py.",
  eventScripts: [{ eventid: "valueChanged", script }] });
fs.writeFileSync(TAGS, JSON.stringify(j, null, 2) + "\n");
console.log(`mqtt written: ${list.length} published process values, script ${script.split("\n").length} lines`);
