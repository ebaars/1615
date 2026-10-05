// Tuning simulator for the PID Tuning page: writes tags/cal1615_sim_tags.json, a separate tag import (folder [cal1615]Sim) that is not
// part of the plant's tag file. Import it only when you want to try the tuner without the oven:
//   Sim/enable  (switch the simulation on and off)
//   Sim/tick    (expression now(100); its valueChanged script is tools/sim_tick.py and advances both plants)
//   Sim/Zone/*  an oven zone with a Fast and an Auto PID, status codes, burner delay, reset buttons, fault and recipe-download buttons
//   Sim/Tension/*  a tension loop (0..100 % output, 50 % = neutral)
// The page shows them as the loops "Sim Oven" and "Sim Tension" (registry and controls come from sim_defs.js via pid_tuning.js).
// Run:  node tuning_sim.js                       (writes the tag file)
//       node tuning_sim.js --registry <file>     (writes the two loop definitions and the tag defaults as JSON for sim_test.py)
const fs = require("fs");
const { ZONE_TAGS, TENSION_TAGS, SIM_LOOPS } = require("./sim_defs");
const OUT = "E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tags/cal1615_sim_tags.json";
const TICK = "E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tools/sim_tick.py";

if (process.argv[2] === "--registry") {
  fs.writeFileSync(process.argv[3], JSON.stringify({ loops: Object.fromEntries(SIM_LOOPS), tags: { Zone: ZONE_TAGS, Tension: TENSION_TAGS } }));
  console.log("simulated loops written to " + process.argv[3]);
  process.exit(0);
}

const tag = ([name, dataType, value], history) => ({
  name, tagType: "AtomicTag", valueSource: "memory", dataType, value,
  ...(history ? { historyEnabled: true, historyProvider: "myOracle", sampleMode: "Periodic", historySampleRate: 1, historySampleRateUnits: "SEC", historyMaxAge: 10, historyMaxAgeUnits: "SEC" } : {}),
});
const HIST = new Set(["pv", "sp", "cv"]);
const folder = (name, list) => ({ name, tagType: "Folder", tags: list.map((t) => tag(t, HIST.has(t[0]))) });

const script = fs.readFileSync(TICK, "utf8").split("\n").map((l) => (l.length ? "\t" + l : l)).join("\n");
const sim = {
  name: "Sim", tagType: "Folder",
  documentation: "Tuning simulator (see tools/tuning_sim.js). Set Sim/enable to false to stop it.",
  tags: [
    { name: "enable", tagType: "AtomicTag", valueSource: "memory", dataType: "Boolean", value: true },
    { name: "tick", tagType: "AtomicTag", valueSource: "expr", dataType: "DateTime", expression: "now(100)", eventScripts: [{ eventid: "valueChanged", script }] },
    folder("Zone", ZONE_TAGS),
    folder("Tension", TENSION_TAGS),
  ],
};
fs.writeFileSync(OUT, JSON.stringify({ name: "", tagType: "Provider", tags: [sim] }, null, 2) + "\n");
console.log(`simulator tags written: ${ZONE_TAGS.length + TENSION_TAGS.length + 2} tags, script ${script.split("\n").length} lines -> ${OUT}`);
