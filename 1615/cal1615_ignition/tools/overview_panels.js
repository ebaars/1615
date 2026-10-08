// Two small panels on the Overview (Home/Overview - Large):
//   Components/Main/Line State   four-state line panel (RUNNING / IDLE / SETUP / DOWN): big state tile, time in state, share of the last 8 h
//   Components/Main/Job Panel    job view: shop order, recipe, line speed, current roll, rolls and feet done against the targets, last 3 rolls
// Data: [cal1615]HMI/LineState/* (tools/line_tick.py), [cal1615]HMI/Rolls/* (tools/roll_tick.py), [cal1615]HMI/Job/* (targets), cal1615.rolls.list_rolls.
// Run: node overview_panels.js   (idempotent: replaces the two panels on the Overview)
const fs = require("fs"), path = require("path");
const R = "E:/aaa_projects/ParkTemp/1615";
const V = R + "/cal1615_std/com.inductiveautomation.perspective/views";
const RESOURCE = fs.readFileSync(`${V}/MainViews/Feature Views/Ovens/RTO - Large/resource.json`, "utf8");
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
const writeView = (vp, v) => { wr(`${V}/${vp}/view.json`, v); fs.writeFileSync(`${V}/${vp}/resource.json`, RESOURCE); };

// the text helper script cal1615.overview needs a resource.json next to its code.py
fs.writeFileSync(R + "/cal1615_std/ignition/script-python/cal1615/overview/resource.json", fs.readFileSync(R + "/cal1615_std/ignition/script-python/cal1615/recipes/resource.json", "utf8"));

const AUTH = "{session.props.auth.authenticated}";
const expr = (expression) => ({ binding: { type: "expr", config: { expression } } });
const lbl = (name, text, position, style, propConfig) => ({ type: "ia.display.label", meta: { name }, position, props: { text, style: { ...style } }, ...(propConfig ? { propConfig } : {}) });
const bound = (name, e, position, style) => lbl(name, "", position, style, { "props.text": expr(e) });
const flex = (name, direction, children, position, style, propConfig) => ({ type: "ia.container.flex", meta: { name }, position,
  props: { direction, style: { ...style } }, children, ...(propConfig ? { propConfig } : {}) });
const LS = (t) => `{[cal1615]HMI/LineState/${t}}`;
const RL = (t) => `{[cal1615]HMI/Rolls/${t}}`;
const JB = (t) => `{[cal1615]HMI/Job/${t}}`;
const PLC = (t) => `{[cal1615]${t}}`;
const COLORS = { RUNNING: "#2e9e5b", IDLE: "#6b7684", SETUP: "#e0a21b", DOWN: "#d64545" };
const STATES = ["RUNNING", "IDLE", "SETUP", "DOWN"];
// seconds -> "12 s" / "4 min 05 s" / "2 h 15 min"
const dur = (s) => `if(${s} < 60, toStr(floor(${s})) + ' s', if(${s} < 3600, toStr(floor(${s} / 60)) + ' min ' + numberFormat(floor(${s}) % 60, '00') + ' s', toStr(floor(${s} / 3600)) + ' h ' + numberFormat(floor(${s} / 60) % 60, '00') + ' min'))`;
const secsSince = (tag) => `dateDiff(now(1000), ${tag}, 'sec')`;

// ------------------------------------------------------------------ Line State (190 x 192)
// elapsed times come from the project script cal1615.overview (age, job_header), ticking every second
const stateExpr = LS("state");
const tile = flex("tile", "column", [
  bound("state", `coalesce(${stateExpr}, '---')`, { basis: "34px", shrink: 0 }, { fontSize: "24px", fontWeight: "800", color: "#ffffff", textAlign: "center", letterSpacing: "1px" }),
  lbl("since", "", { basis: "18px", shrink: 0 }, { fontSize: "13px", color: "#ffffff", textAlign: "center", opacity: "0.92" },
    { "props.text": expr(`runScript('cal1615.overview.age', 1000, ${LS("since")}, 'for ')`) }),
], { basis: "56px", shrink: 0 }, { margin: "4px 8px 2px 8px", borderRadius: "8px", justifyContent: "center", alignItems: "stretch" },
{ "props.style.backgroundColor": { binding: { type: "expr", config: { expression: `if(${stateExpr} = 'RUNNING', '${COLORS.RUNNING}', if(${stateExpr} = 'SETUP', '${COLORS.SETUP}', if(${stateExpr} = 'DOWN', '${COLORS.DOWN}', '${COLORS.IDLE}')))` } } } });
const stateRow = (s) => flex(`row_${s}`, "row", [
  lbl("dot", "", { basis: "12px", shrink: 0 }, { height: "12px", width: "12px", borderRadius: "6px", backgroundColor: COLORS[s], alignSelf: "center" }),
  bound("name", `'${s[0]}${s.slice(1).toLowerCase()}'`, { grow: 1, basis: "0" }, { fontSize: "13px", textAlign: "left" }),
  bound("pct", `if(isNull(${LS("pct_" + s.toLowerCase())}), '--', numberFormat(${LS("pct_" + s.toLowerCase())}, '0') + ' %')`, { basis: "46px", shrink: 0 }, { fontSize: "13px", textAlign: "right" }),
], { basis: "22px", shrink: 0 }, { alignItems: "center", gap: "8px", paddingLeft: "14px", paddingRight: "12px" },
{ "props.style.fontWeight": expr(`if(${stateExpr} = '${s}', 'bold', 'normal')`) });
const lineState = {
  custom: {}, params: {}, propConfig: {}, props: { defaultSize: { width: 190, height: 198 } },
  root: { type: "ia.container.flex", meta: { name: "root" }, position: {}, props: { direction: "column", style: { classes: "cal1615/card", paddingBottom: "4px" } },
    children: [lbl("header", "Line State", { basis: "26px", shrink: 0 }, { classes: "cal1615/card-header" }), tile,
      bound("hours", "'Last 8 hours'", { basis: "16px", shrink: 0 }, { fontSize: "11px", opacity: "0.7", textAlign: "left", paddingLeft: "14px" }),
      ...STATES.map(stateRow)] },
};
writeView("Components/Main/Line State", lineState);

// ------------------------------------------------------------------ Job Panel (640 x 116)
const rowH = { basis: "24px", shrink: 0 };
const small = (name, text, position) => lbl(name, text, position, { fontSize: "11px", opacity: "0.7", textAlign: "left" });
const kv = (name, title, e, valueStyle = {}) => flex(name, "row", [
  small("k", title, { basis: "72px", shrink: 0 }),
  bound("v", e, { grow: 1, basis: "0" }, { fontSize: "14px", fontWeight: "bold", textAlign: "left", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", ...valueStyle }),
], rowH, { alignItems: "center", gap: "4px" });
const col1 = flex("col1", "column", [
  kv("shop", "Shop order", `if(len(coalesce(${PLC("HMI/shop_order")}, '')) = 0, '---', ${PLC("HMI/shop_order")})`, { fontSize: "16px" }),
  kv("recipe", "Recipe", `coalesce(${PLC("p01_recipe_active/name/name")}, '---')`),
  kv("speed", "Line speed", `numberFormat(coalesce(${PLC("p01r12_master_ramped_speed")}, 0), '0.0') + '  /  ' + numberFormat(coalesce(${PLC("p01_recipe_active/line_speed_sp")}, 0), '0.0') + ' FPM'`),
], { basis: "232px", shrink: 0 }, { justifyContent: "space-around" });

// progress row: label, bar, "done / target" with the target entered by the operator
const progress = (name, title, doneE, targetTag, fmt) => flex(name, "row", [
  small("k", title, { basis: "40px", shrink: 0 }),
  flex("track", "row", [flex("bar", "row", [], { basis: "0%", shrink: 0 }, { backgroundColor: "#2f7fc1", borderRadius: "4px" },
    { "position.basis": expr(`toStr(if(coalesce(${JB(targetTag)}, 0) > 0, min(100, 100 * coalesce(${doneE}, 0) / ${JB(targetTag)}), 0)) + '%'`) })],
    { grow: 1, basis: "0" }, { height: "12px", borderRadius: "4px", backgroundColor: "rgba(128,128,128,0.25)", alignSelf: "center", overflow: "hidden" }),
  bound("done", `numberFormat(coalesce(${doneE}, 0), '${fmt}') + ' of'`, { basis: "62px", shrink: 0 }, { fontSize: "12px", fontWeight: "bold", textAlign: "right" }),
  { type: "ia.input.numeric-entry-field", meta: { name: "target" }, position: { basis: "58px", shrink: 0 },
    props: { format: fmt, placeholder: "target", spinner: { enabled: false }, style: { classes: "cal1615/entry", fontSize: "12px" } },
    propConfig: { "props.value": { binding: { type: "tag", config: { tagPath: `[cal1615]HMI/Job/${targetTag}`, bidirectional: true }, transforms: [{ type: "script", code: "\treturn value if value else None" }] } }, "props.enabled": expr(AUTH) } },
], rowH, { alignItems: "center", gap: "4px" });
const col2 = flex("col2", "column", [
  bound("roll", `if(${RL("roll_no")} < 0, 'No roll open   A ' + numberFormat(coalesce(${PLC("p29r13_ai_wa_footage_ft")}, 0), '#,##0') + ' ft   B ' + numberFormat(coalesce(${PLC("p29r13_ai_wb_footage_ft")}, 0), '#,##0') + ' ft',if(${RL("state")} = 'LEADER', 'Leader roll', 'Roll ' + toStr(${RL("roll_no")})) + '   Winder ' + ${RL("winder")} + '   ' + numberFormat(${RL("roll_ft")}, '#,##0') + ' ft')`,
    { basis: "26px", shrink: 0 }, { fontSize: "15px", fontWeight: "bold", textAlign: "left", whiteSpace: "nowrap" }),
  progress("rolls", "Rolls", RL("rolls_done"), "target_rolls", "#,##0"),
  progress("feet", "Feet", RL("ft_done"), "target_ft", "#,##0"),
], { basis: "300px", shrink: 0 }, { justifyContent: "space-around" });

const lastRoll = (i) => lbl(`last${i}`, "", { basis: "22px", shrink: 0 }, { fontSize: "12px", textAlign: "left", whiteSpace: "nowrap", fontFamily: "monospace" },
  { "props.text": { binding: { type: "expr", config: { expression: "{view.custom.last}" }, transforms: [{ type: "script", code: [
    `\tif not value or len(value) <= ${i}:`, "\t\treturn ''", `\tr = value[${i}]`,
    "\treturn '%-6s %s %5s ft %s' % (r['roll'], r['winder'], format(r['length'] or 0, ',.0f'), r['flags'].replace('PARTIAL', 'PART').replace('NOCLEAR', 'NOCLR'))",
  ].join("\n") }] } } });
const col3 = flex("col3", "column", [small("t", "Last rolls", { basis: "16px", shrink: 0 }), lastRoll(0), lastRoll(1), lastRoll(2)], { grow: 1, basis: "0" }, { justifyContent: "flex-start" });

const jobPanel = {
  custom: { last: [] }, params: {},
  propConfig: { "custom.last": expr("runScript('cal1615.rolls.list_rolls', 8000, 3)") },
  props: { defaultSize: { width: 640, height: 116 } },
  root: { type: "ia.container.flex", meta: { name: "root" }, position: {}, props: { direction: "column", style: { classes: "cal1615/card" } },
    children: [
      lbl("header", "Job", { basis: "26px", shrink: 0 }, { classes: "cal1615/card-header" },
        { "props.text": expr(`runScript('cal1615.overview.job_header', 1000, ${RL("state")}, ${RL("session_start")})`) }),
      flex("body", "row", [col1, col2, col3], { grow: 1, basis: "0" }, { gap: "14px", paddingLeft: "12px", paddingRight: "12px", paddingTop: "2px", paddingBottom: "4px", alignItems: "stretch" }),
    ] },
};
writeView("Components/Main/Job Panel", jobPanel);

// ------------------------------------------------------------------ place them on the Overview
const of = `${V}/MainViews/Feature Views/Home/Overview - Large/view.json`;
const ov = JSON.parse(fs.readFileSync(of, "utf8"));
ov.root.children = ov.root.children.filter((c) => !["lineState", "jobPanel"].includes(c.meta.name));
ov.root.children.push({ type: "ia.display.view", meta: { name: "lineState" }, position: { x: 38, y: 76, width: 190, height: 198 }, props: { path: "Components/Main/Line State", params: {} } });
ov.root.children.push({ type: "ia.display.view", meta: { name: "jobPanel" }, position: { x: 640, y: 52, width: 640, height: 116 }, props: { path: "Components/Main/Job Panel", params: {} } });
fs.writeFileSync(of, JSON.stringify(ov, null, 2));
console.log("Line State and Job Panel views written and placed on the Overview");
