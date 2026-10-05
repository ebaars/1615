// Adds the tag [cal1615]HMI/tune_watchdog to the tag export: an expression tag that changes once a minute, with a
// valueChanged script. The script runs on the gateway (also right after a gateway start, with no page open) and cleans up a PID
// tuning test whose runner thread died (its heartbeat in PID_TUNE_RUN is older than 60 s):
//   - an SP-bump test: the original SP is put back, unless the SP is no longer the value the test commanded (someone else changed it);
//   - a heat-up capture: marked lost; nothing was written to the PLC.
// It is self-contained on purpose: tag scripts do not necessarily see the project script library.
// Same rules as cal1615.tunerun.recover().
// Run:  node tune_watchdog.js                       (writes the tag into the export, idempotent)
//       node tune_watchdog.js --extract <file>      (writes the script body to <file> for tunerun_test.py)
const fs = require("fs");
const TAGS = "E:/aaa_projects/ParkTemp/1615/cal1615_ignition/tags/cal1615_tags.json";
const script = [
  "\t# cal1615 PID tuning watchdog: clean up a tuning test that died (gateway restart, crashed thread).",
  "\timport sys",
  "\tlog = system.util.getLogger('cal1615.tunewatchdog')",
  "\ttry:",
  "\t\trows = system.db.runPrepQuery(\"SELECT id AS \\\"id\\\", run_mode AS \\\"mode\\\", orig_sp AS \\\"orig_sp\\\", last_cmd AS \\\"last_cmd\\\", sp_tag AS \\\"sp_tag\\\", (CAST(SYSTIMESTAMP AS DATE) - CAST(hb AS DATE)) * 86400 AS \\\"age\\\" FROM PID_TUNE_RUN WHERE status = 'RUNNING'\", [], 'myOracle')",
  "\texcept:",
  "\t\trows = []   # the table does not exist until the first test, or the database is down (a Java exception, which 'except Exception' would miss)",
  "\tfor r in rows:",
  "\t\tif float(r['age'] or 0.0) < 60.0:",
  "\t\t\tcontinue   # a live test: its heartbeat is recent",
  "\t\ttry:",
  "\t\t\tstatus = 'RECOVERED'",
  "\t\t\tif (r['mode'] or 'steady') == 'heatup' or r['orig_sp'] is None:",
  "\t\t\t\tstatus = 'ABORTED'",
  "\t\t\t\tmsg = 'Interrupted heat-up capture: the capture was lost. Nothing had been written to the PLC.'",
  "\t\t\telse:",
  "\t\t\t\torig = float(r['orig_sp'])",
  "\t\t\t\tlast = orig if r['last_cmd'] is None else float(r['last_cmd'])",
  "\t\t\t\tcur = system.tag.readBlocking([r['sp_tag']])[0]",
  "\t\t\t\tif not (cur.quality.isGood() and cur.value is not None):",
  "\t\t\t\t\tmsg = 'Interrupted test: the SP could not be read, so it was not touched. Check the setpoint.'",
  "\t\t\t\telif abs(cur.value - orig) <= 0.05:",
  "\t\t\t\t\tmsg = 'Interrupted test: SP was already %.1f.' % orig",
  "\t\t\t\telif abs(cur.value - last) > 0.05:",
  "\t\t\t\t\tmsg = 'Interrupted test: the SP is now %.1f, not the %.1f the test set. Someone else changed it, so it was not touched.' % (cur.value, last)",
  "\t\t\t\telse:",
  "\t\t\t\t\tsystem.tag.writeBlocking([r['sp_tag']], [orig])",
  "\t\t\t\t\tmsg = 'Interrupted test: SP put back to %.1f (was %.1f).' % (orig, cur.value)",
  "\t\t\tsystem.db.runPrepUpdate(\"UPDATE PID_TUNE_RUN SET status = ?, message = ?, ended = SYSTIMESTAMP WHERE id = ?\", [status, msg[:480], int(r['id'])], 'myOracle')",
  "\t\t\tlog.warn(msg)",
  "\t\texcept:",
  "\t\t\tlog.error('Could not clean up an interrupted tuning test: %s' % sys.exc_info()[1])",
].join("\n");

if (process.argv[2] === "--extract") {
  fs.writeFileSync(process.argv[3], script.split("\n").map((l) => l.replace(/^\t/, "")).join("\n"));
  console.log("script body written to " + process.argv[3]);
} else {
  const j = JSON.parse(fs.readFileSync(TAGS, "utf8"));
  const hmi = j.tags.find((t) => t.name === "HMI");
  hmi.tags = hmi.tags.filter((t) => t.name !== "tune_watchdog");
  hmi.tags.push({ name: "tune_watchdog", tagType: "AtomicTag", valueSource: "expr", dataType: "DateTime", expression: "now(60000)",
    documentation: "Once a minute: cleans up a PID tuning test that died. See tools/tune_watchdog.js.",
    eventScripts: [{ eventid: "valueChanged", script }] });
  fs.writeFileSync(TAGS, JSON.stringify(j, null, 2) + "\n");
  console.log("tune_watchdog tag written (" + script.split("\n").length + " script lines)");
}
