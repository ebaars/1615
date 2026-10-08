// check_copy.sh --demo: in the TEMPORARY check copy only, replace references to tags that are not on the gateway yet with demo values, so a screenshot
// shows what the page looks like with data. Usage: node demo_values.js <project folder>
const fs = require("fs"), path = require("path");
const root = process.argv[2];
const D = {
  "HMI/LineState/state": "'RUNNING'", "HMI/LineState/since": "1759600000000",
  "HMI/LineState/pct_running": "62.4", "HMI/LineState/pct_idle": "21.0", "HMI/LineState/pct_setup": "9.1", "HMI/LineState/pct_down": "7.5",
  "HMI/Rolls/state": "'PRODUCING'", "HMI/Rolls/roll_no": "3", "HMI/Rolls/winder": "'B'", "HMI/Rolls/roll_ft": "412", "HMI/Rolls/rolls_done": "2",
  "HMI/Rolls/ft_done": "1850", "HMI/Rolls/session_start": "1759600000000", "HMI/Rolls/msg": "''",
  "HMI/Job/target_rolls": "10", "HMI/Job/target_ft": "6000", "HMI/shop_order": "'SO-48213'",
};
let n = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (e.name === "view.json") { let s = fs.readFileSync(p, "utf8"); const b = s;
    for (const [k, v] of Object.entries(D)) s = s.split(`{[cal1615]${k}}`).join(`(${v})`);
    if (s !== b) { fs.writeFileSync(p, s); n++; } } } };
walk(path.join(root, "com.inductiveautomation.perspective", "views"));
console.log(n + " view(s) given demo values");
