// Adds the tags the tension-loop tuning needs to the tag export (idempotent):
//  - the PID instruction members of the five tension PIDs: /PV /SP /OUT /ERR (REAL) and /SWM (manual bit), on the "Fast" tag group;
//    PV, SP and OUT are also logged every 10 s like the other process values;
//  - the TS2 gain inputs p02_real_from_hmi.ts2[40..42] (the other loops already have theirs) and the gains /KP /KI /KD of the TS2
//    and Winder B PIDs;
//  - the loop-active flags, the line-running bit and the winder index bit that the tuning checks read.
// The tag group "Fast" must exist in the cal1615 tag provider: Direct mode, rate 100 ms (Config > Tags > Tag Groups). Until it does,
// Ignition runs these tags on the Default group (1 s) and the tension tuning test refuses to start, saying so.
// Run: node tension_tags.js
const fs = require("fs");
const TAGS = "E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tags/cal1615_tags.json";
const j = JSON.parse(fs.readFileSync(TAGS, "utf8"));
const OPC = (item) => ({ opcItemPath: `nsu=FTLGW_Server_Namespace;s=[PLC]${item}`, opcServer: "cal1615", valueSource: "opc" });
const HIST = { historyEnabled: true, historyProvider: "myOracle", sampleMode: "Periodic", historySampleRate: 10, historySampleRateUnits: "SEC", historyMaxAge: 10, historyMaxAgeUnits: "SEC" };
const HIST_CHANGE = { historyEnabled: true, historyProvider: "myOracle", sampleMode: "OnChange", historyMaxAge: 1, historyMaxAgeUnits: "MIN" };
const find = (list, name) => list.find((t) => t.name === name);
const put = (list, tag) => { const i = list.findIndex((t) => t.name === tag.name); if (i >= 0) list.splice(i, 1); list.push(tag); };
let added = 0;

const PIDS = ["p20r10_pid_tens", "p22r10_pid_psn", "p25r10_pid_psn", "p29r10_pid_psn", "p29r11_pid_psn"];
for (const pid of PIDS) {
  let folder = find(j.tags, pid);
  if (!folder) { folder = { name: pid, tagType: "Folder", tags: [] }; j.tags.push(folder); }
  const m = (name, dataType, extra = {}) => { put(folder.tags, { name, tagType: "AtomicTag", dataType, ...OPC(`${pid}.${name}`), ...extra }); added++; };
  for (const g of ["KP", "KI", "KD"]) if (!find(folder.tags, g)) m(g, "Float4", HIST_CHANGE);
  m("PV", "Float4", { tagGroup: "Fast", ...HIST });
  m("SP", "Float4", { tagGroup: "Fast", ...HIST });
  m("OUT", "Float4", { tagGroup: "Fast", ...HIST });
  m("ERR", "Float4", { tagGroup: "Fast" });
  m("SWM", "Boolean", { tagGroup: "Fast" });
}

// TS2 gain inputs (HMI writes them; the PLC loads them into the PID every scan)
let hmiReal = find(j.tags, "p02_real_from_hmi");
if (!hmiReal) { hmiReal = { name: "p02_real_from_hmi", tagType: "Folder", tags: [] }; j.tags.push(hmiReal); }
for (const n of [40, 41, 42]) { put(hmiReal.tags, { name: `ts2_${n}_`, tagType: "AtomicTag", dataType: "Float4", ...OPC(`p02_real_from_hmi.ts2[${n}]`) }); added++; }

// flags
for (const name of ["p20r10_tension_request", "p22r11_request_tension", "p25r10_tension_request", "p29r10_request_run", "p29r11_request_run", "p01r13_line_running", "p29_di_wdr_index_fwd"]) {
  put(j.tags, { name, tagType: "AtomicTag", dataType: "Boolean", ...OPC(name) });
  added++;
}
fs.writeFileSync(TAGS, JSON.stringify(j, null, 2) + "\n");
console.log("tension tuning tags written:", added);
