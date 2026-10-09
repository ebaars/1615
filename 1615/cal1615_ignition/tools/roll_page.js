// Rolls page for cal1615_std: Maintenance/Rolls (route /rolls). Shows what the gateway roll logging (tools/roll_tick.py) is doing, the list of
// rolls, the statistics of the selected roll, the production start / stop buttons and the settings (fabric path, accumulator capacity, ...).
// Project script: cal1615.rolls (ignition/script-python/cal1615/rolls). Run: node roll_page.js
const fs = require("fs"), path = require("path");
const R = "E:/aaa_projects/ParkTemp/1615";
const P = R + "/cal1615_std/com.inductiveautomation.perspective";
const V = P + "/views";
const rd = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
const RESOURCE = fs.readFileSync(`${V}/MainViews/Feature Views/Ovens/RTO - Large/resource.json`, "utf8");
const writeView = (vp, v) => { wr(`${V}/${vp}/view.json`, v); fs.writeFileSync(`${V}/${vp}/resource.json`, RESOURCE); };
fs.mkdirSync(R + "/cal1615_std/ignition/script-python/cal1615/rolls", { recursive: true });
fs.writeFileSync(R + "/cal1615_std/ignition/script-python/cal1615/rolls/resource.json", fs.readFileSync(R + "/cal1615_std/ignition/script-python/cal1615/recipes/resource.json", "utf8"));

const AUTH = "{session.props.auth.authenticated}";
const ROW = { paddingLeft: "6px", paddingRight: "6px", paddingTop: "3px", paddingBottom: "3px", gap: "4px" };
const expr = (expression) => ({ binding: { type: "expr", config: { expression } } });
const lbl = (name, text, cls, position, propConfig, style) => ({ type: "ia.display.label", meta: { name }, position, props: { text, style: { classes: cls, ...(style || {}) } }, ...(propConfig ? { propConfig } : {}) });
const row = (name, title, middle, units) => ({ type: "ia.container.flex", meta: { name }, position: { basis: "28px", shrink: 0 },
  props: { direction: "row", alignItems: "stretch", style: ROW },
  children: [lbl("title", title, "cal1615/row-label", { grow: 1, basis: "0" }), middle, lbl("units", units, "cal1615/units", { basis: "34px", shrink: 0 })] });
const card = (name, header, children, position) => ({ type: "ia.container.flex", meta: { name }, position,
  props: { direction: "column", style: { classes: "cal1615/card", paddingBottom: "4px" } },
  children: [lbl("header", header, "cal1615/card-header", { basis: "26px", shrink: 0 }), ...children] });
const textLbl = (name, e, style = {}) => ({ type: "ia.display.label", meta: { name }, position: { basis: "auto", shrink: 0 },
  props: { text: "", style: { fontSize: "12px", padding: "2px 8px", textAlign: "left", whiteSpace: "pre-wrap", ...style } }, propConfig: { "props.text": expr(e) } });
const tagVal = (t) => `{[cal1615]HMI/Rolls/${t}}`;
const pulse = (name, text, tag, primary) => ({ type: "ia.input.button", meta: { name }, position: { basis: "170px", shrink: 0 },
  props: { text, primary: !!primary, style: { fontSize: "14px" } }, propConfig: { "props.enabled": expr(AUTH) },
  events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script: `\tsystem.tag.writeBlocking(['[cal1615]HMI/Rolls/${tag}'], [True])` } } } } });

// settings card (keys and labels come from cal1615.rolls.SETTINGS; keep in step)
const SETTINGS = [["path_len_ft", "Fabric path, coater to winder", "ft"], ["acc_cap_ft", "Accumulator capacity (full = 100 %)", "ft"], ["cut_max_ft", "Counter below this = new roll", "ft"],
  ["min_roll_ft", "Shorter than this = SHORT", "ft"], ["snap_s", "Snapshot interval", "s"], ["prod_off_s", "Gates down this long ends production", "s"], ["gates_needed", "Tank + RTO needed (1 yes, 0 no)", ""]];
const setRow = ([key, title, units]) => row(`s_${key}`, title, {
  type: "ia.input.numeric-entry-field", meta: { name: "entry" }, position: { basis: "100px", shrink: 0 },
  props: { format: "#,##0.0", spinner: { enabled: false }, style: { classes: "cal1615/entry" } },
  propConfig: { "props.value": expr(`{view.custom.cfg.${key}}`), "props.enabled": expr(AUTH) },
  events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script:
    `\tok, msg = cal1615.rolls.set_cfg('${key}', self.props.value, self.session.props.auth.user.userName)\n\tself.view.custom.msg = msg` } } } } }, units);

const COLS = (defs) => defs.map(([field, title, width, align]) => ({ field, header: { title }, width, ...(align ? { align } : {}) }));
const rollsTable = { type: "ia.display.table", meta: { name: "rolls" }, position: { grow: 1, basis: "0" },
  props: { selection: { mode: "single" }, columns: COLS([["roll", "Roll", 70], ["winder", "Winder", 70], ["status", "Status", 90], ["start", "Start", 110], ["end", "End", 60], ["length", "Feet", 70], ["recipe", "Recipe", 150], ["shop", "Shop order", 110], ["flags", "Flags", 110]]) },
  propConfig: { "props.data": expr('runScript("cal1615.rolls.list_rolls", 5000, 80)') },
  events: { component: { onRowClick: { type: "script", scope: "G", config: { script: "\tself.view.custom.sel = event.value['id']" } } } } };
const statsTable = { type: "ia.display.table", meta: { name: "stats" }, position: { grow: 1, basis: "0" },
  props: { columns: COLS([["tag", "Process value", 300], ["avg", "Average", 90], ["min", "Min", 90], ["max", "Max", 90], ["sd", "Std dev", 80], ["n", "Samples", 70]]) },
  propConfig: { "props.data": expr('runScript("cal1615.rolls.roll_stats", 0, {view.custom.sel})') } };

const view = {
  custom: { sel: 0, msg: "", cfg: {} },
  params: {},
  propConfig: { "custom.cfg": expr('runScript("cal1615.rolls.get_cfg", 0)') },
  props: { defaultSize: { width: 1680, height: 1024 } },
  root: { type: "ia.container.flex", meta: { name: "root" }, position: {}, props: { direction: "column", style: { padding: "6px", gap: "8px", overflow: "hidden" } },
    children: [
      { type: "ia.container.flex", meta: { name: "topBar" }, position: { basis: "44px", shrink: 0 }, props: { direction: "row", alignItems: "center", style: { gap: "8px" } },
        children: [lbl("title", "Rolls", "cal1615/page-title", { basis: "160px", shrink: 0 }, undefined, { textAlign: "left" }),
          pulse("start", "Production start", "prod_start", true), pulse("stop", "Production stop", "prod_stop", false),
          { ...textLbl("status", `'Roll logging: ' + ${tagVal("state")} + if(${tagVal("roll_no")} >= 0, '   roll ' + toStr(${tagVal("roll_no")}) + ' on winder ' + ${tagVal("winder")} + ', ' + numberFormat(${tagVal("roll_ft")}, '#,##0') + ' ft', '') + '   ' + coalesce(${tagVal("msg")}, '')`, { fontSize: "14px", fontWeight: "bold" }), position: { grow: 1, basis: "0" } }] },
      { type: "ia.container.flex", meta: { name: "body" }, position: { grow: 1, basis: "0" }, props: { direction: "row", alignItems: "stretch", style: { gap: "8px" } },
        children: [
          card("rolls", "Rolls (latest first, click one)", [rollsTable], { basis: "760px", shrink: 0 }),
          card("detail", "Selected roll", [textLbl("info", "runScript('cal1615.rolls.roll_info', 5000, {view.custom.sel})", { color: "var(--neutral-70)" }), statsTable], { grow: 1, basis: "0" }),
          { type: "ia.container.flex", meta: { name: "side" }, position: { basis: "420px", shrink: 0 }, props: { direction: "column", style: { gap: "8px", overflowY: "auto" } },
            children: [
              card("settings", "Settings", [...SETTINGS.map(setRow), textLbl("msg", "coalesce({view.custom.msg}, '')", { color: "#B05000" })], { basis: "auto", shrink: 0 }),
              card("how", "How it works", [textLbl("t", "'A roll is cut when the other winder starts with its length counter below the limit, after both winders were stopped. The first roll of a production run (tank up and RTO ready, or Production start) is the leader. Process values are logged every snapshot interval and assigned to the roll by where the fabric was at the coater: feet wound + path + accumulator fill. Set the path and capacity, or the values are not shifted. A roll shorter than the stored fabric can have few or no snapshots.'", { fontSize: "11px", color: "var(--neutral-70)" })], { basis: "auto", shrink: 0 }),
            ] },
        ] },
    ] },
};
writeView("MainViews/Feature Views/Maintenance/Rolls", view);

// navigation: page route, Maintenance menu entry after PID Tuning, header highlight
const pcf = `${P}/page-config/config.json`;
const pc = rd(pcf);
pc.pages["/rolls"] = { ...pc.pages["/zone-setup"], viewPath: "MainViews/Feature Views/Maintenance/Rolls" };
wr(pcf, pc);
const navf = `${V}/MainViews/Nav/Maintenance/view.json`;
const nav = rd(navf);
const items = nav.root.children[0].props.items;
if (!items.some((i) => i.target === "/rolls")) {
  const pt = items.find((i) => i.target === "/pid-tuning") || items.find((i) => i.target === "/zone-setup");
  items.splice(items.indexOf(pt) + 1, 0, { ...JSON.parse(JSON.stringify(pt)), label: { ...pt.label, text: "Rolls" }, target: "/rolls" });
  nav.props.defaultSize.height = Math.round(nav.props.defaultSize.height * items.length / (items.length - 1));
  wr(navf, nav);
}
const hf = `${V}/Framework/Header Main Nav/view.json`;
let hs = fs.readFileSync(hf, "utf8");
if (!hs.includes('\\"/rolls\\"')) { hs = hs.split('{page.props.path} = \\"/pid-tuning\\"').join('{page.props.path} = \\"/pid-tuning\\" || {page.props.path} = \\"/rolls\\"'); fs.writeFileSync(hf, hs); }
console.log("Rolls page, script cal1615.rolls, route /rolls, Maintenance menu entry done");
