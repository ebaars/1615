// Roll logging for the tag export: adds
//   - PLC tags the roll logic needs and the export lacked: p29r15_request_run, p29r16_request_run (torque-mode winder run bits),
//     p00_wac_position_pct (accumulator carriage position, % of stroke; also logged with 10 s history like the other process values)
//   - [cal1615]HMI/Rolls/*  state for the page (state, roll_no, roll_ft, winder, msg) and the operator buttons (prod_start, prod_stop)
//   - [cal1615]HMI/roll_tick  an expression tag, now(500), whose valueChanged script is tools/roll_tick.py
// The list of logged process values is every analog tag in the export with history enabled (the 10 s periodic ones).
// Run:  node roll_logging.js                      (idempotent)
//       node roll_logging.js --extract <file>     (writes the script body, without the tag list, for roll_test.py)
const fs = require("fs");
const TAGS = "E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tags/cal1615_tags.json";
const SRC = "E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tools/roll_tick.py";
const MARK = "TAGS = []   # @@TAGS@@";
const src = fs.readFileSync(SRC, "utf8");
if (!src.includes(MARK)) throw new Error("marker missing in roll_tick.py");

if (process.argv[2] === "--extract") {
  fs.writeFileSync(process.argv[3], src);
  console.log("script written to " + process.argv[3]);
  process.exit(0);
}

const j = JSON.parse(fs.readFileSync(TAGS, "utf8"));
const find = (ts, name) => ts.find((t) => t.name === name);
const plc = (name) => `nsu=FTLGW_Server_Namespace;s=[PLC]${name}`;
const opc = (name, dataType, extra = {}) => ({ name, tagType: "AtomicTag", dataType, opcItemPath: plc(name), opcServer: "cal1615", valueSource: "opc", ...extra });
const HIST = { historyEnabled: true, historyProvider: "myOracle", sampleMode: "Periodic", historySampleRate: 10, historySampleRateUnits: "SEC", historyMaxAge: 10, historyMaxAgeUnits: "SEC" };

const put = (t) => { j.tags = j.tags.filter((x) => x.name !== t.name); j.tags.push(t); };
put(opc("p29r15_request_run", "Boolean"));
put(opc("p29r16_request_run", "Boolean"));
put(opc("p00_wac_position_pct", "Float4", HIST));

// the logged process values: analog tags with history
const list = [];
const walk = (ts, p) => { for (const t of ts) { const q = p ? `${p}/${t.name}` : t.name;
  if (t.tagType === "AtomicTag" && t.historyEnabled && /^(Float|Int)/.test(t.dataType)) list.push(`[cal1615]${q}`);
  if (t.tags) walk(t.tags, q); } };
walk(j.tags, "");
list.sort();

const mem = (name, dataType, value) => ({ name, tagType: "AtomicTag", valueSource: "memory", dataType, value });
let hmi = find(j.tags, "HMI");
hmi.tags = hmi.tags.filter((t) => t.name !== "Rolls" && t.name !== "roll_tick");
hmi.tags.push({ name: "Rolls", tagType: "Folder", tags: [
  mem("state", "String", "IDLE"), mem("roll_no", "Int4", -1), mem("roll_ft", "Float4", 0), mem("winder", "String", ""), mem("msg", "String", ""),
  mem("prod_start", "Boolean", false), mem("prod_stop", "Boolean", false),
  mem("rolls_done", "Int4", 0), mem("ft_done", "Float4", 0), mem("session_start", "DateTime", null) ] });
const body = src.replace(MARK, "TAGS = [\n" + list.map((t) => `\t${JSON.stringify(t)},`).join("\n") + "\n]");
const script = body.split("\n").map((l) => (l.length ? "\t" + l : l)).join("\n");
hmi.tags.push({ name: "roll_tick", tagType: "AtomicTag", valueSource: "expr", dataType: "DateTime", expression: "now(500)",
  documentation: "Roll logging: cuts rolls from the winder length counters and logs process snapshots per roll. See tools/roll_tick.py.",
  eventScripts: [{ eventid: "valueChanged", script }] });
fs.writeFileSync(TAGS, JSON.stringify(j, null, 2) + "\n");
console.log(`roll logging written: ${list.length} logged process values, script ${script.split("\n").length} lines`);
