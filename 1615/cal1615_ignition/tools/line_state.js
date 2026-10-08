// Tags for the four-state line panel and the job view on the Overview:
//   - PLC tags the state logic needs and the export lacked: p01r02_fault_exists, p01r02_warnings_exists
//   - [cal1615]HMI/LineState/*  state, since, pct_running, pct_idle, pct_setup, pct_down (written by the line_tick script)
//   - [cal1615]HMI/line_tick    an expression tag, now(1000), whose valueChanged script is tools/line_tick.py
//   - [cal1615]HMI/Job/*        target_rolls, target_ft (entered by the operator on the Overview job panel)
// Run:  node line_state.js                      (idempotent)
//       node line_state.js --check              (nothing written; only checks the script source has what the generator expects)
const fs = require("fs");
const TAGS = "E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tags/cal1615_tags.json";
const src = fs.readFileSync("E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tools/line_tick.py", "utf8");
if (process.argv[2] === "--check") { console.log("line_tick.py: " + src.split("\n").length + " lines"); process.exit(0); }
const j = JSON.parse(fs.readFileSync(TAGS, "utf8"));
const plc = (name) => ({ name, tagType: "AtomicTag", dataType: "Boolean", opcItemPath: `nsu=FTLGW_Server_Namespace;s=[PLC]${name}`, opcServer: "cal1615", valueSource: "opc" });
const put = (t) => { j.tags = j.tags.filter((x) => x.name !== t.name); j.tags.push(t); };
put(plc("p01r02_fault_exists"));
put(plc("p01r02_warnings_exists"));
const mem = (name, dataType, value) => ({ name, tagType: "AtomicTag", valueSource: "memory", dataType, value });
const hmi = j.tags.find((t) => t.name === "HMI");
hmi.tags = hmi.tags.filter((t) => !["LineState", "Job", "line_tick"].includes(t.name));
hmi.tags.push({ name: "LineState", tagType: "Folder", tags: [mem("state", "String", "IDLE"), mem("since", "DateTime", null),
  mem("pct_running", "Float4", 0), mem("pct_idle", "Float4", 0), mem("pct_setup", "Float4", 0), mem("pct_down", "Float4", 0)] });
hmi.tags.push({ name: "Job", tagType: "Folder", tags: [mem("target_rolls", "Int4", 0), mem("target_ft", "Float4", 0)] });
const script = src.split("\n").map((l) => (l.length ? "\t" + l : l)).join("\n");
hmi.tags.push({ name: "line_tick", tagType: "AtomicTag", valueSource: "expr", dataType: "DateTime", expression: "now(1000)",
  documentation: "Line state (RUNNING / IDLE / SETUP / DOWN) for the Overview panel. See tools/line_tick.py.",
  eventScripts: [{ eventid: "valueChanged", script }] });
fs.writeFileSync(TAGS, JSON.stringify(j, null, 2) + "\n");
console.log(`line state tags written, script ${script.split("\n").length} lines`);
