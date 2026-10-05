// PID tuning for cal1615 (classic PID loops; no PLC change).
//  1. Imports cal2016's PIDE autotune faceplates (Components/PID/*) as objects only - not wired to any loop.
//  2. Project script cal1615.pid: the tunable oven loops (PV, SP, output, gain sets, valve card).
//  3. Page Maintenance/PID Tuning (route /pid-tuning): loop buttons, PV/SP + output trend, live values,
//     editable gains (written to the HMI inputs the PLC loads the PID parameters from), control-valve card.
// Run: node pid_tuning.js <folder with cal2016 Components/PID copied from the gateway>
const fs = require("fs"), path = require("path");
const R = "E:/aaa_projects/ParkTemp/1615";
const P = R + "/cal1615_std/com.inductiveautomation.perspective";
const V = P + "/views";
const C16 = process.argv[2];
const rd = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
const RESOURCE = fs.readFileSync(`${V}/MainViews/Feature Views/Ovens/RTO - Large/resource.json`, "utf8");
const writeView = (vp, v) => { wr(`${V}/${vp}/view.json`, v); fs.writeFileSync(`${V}/${vp}/resource.json`, RESOURCE); };

// ------------------------------------------------------------------ 1. cal2016 autotune faceplates (objects only)
if (C16) {
  for (const name of ["PID Control", "PIDE_Tuning"]) {
    const src = path.join(C16, name);
    const v = JSON.parse(fs.readFileSync(path.join(src, "view.json"), "utf8").split("[cal2016]").join("[cal1615]"));
    v.custom = { ...(v.custom || {}), note: "Imported from cal2016 (PIDE + PIDE_AUTOTUNE). Not wired: the cal1615 PLC runs classic PID. Needs PIDE loops with PIDE_AUTOTUNE tags ([cal1615]Oven {num} {UpperLower} PID Control / PID Autotune)." };
    writeView(`Components/PID/${name}`, v);
  }
  console.log("imported cal2016 PID faceplates");
}

// ------------------------------------------------------------------ 2. loops script (the registry shared by the page and cal1615.tunerun)
// JS value -> Python literal
const pyl = (v) => {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) + (Math.abs(v) >= 1e15 ? "" : "") : String(v);
  if (typeof v === "string") return "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  if (Array.isArray(v)) return "[" + v.map(pyl).join(", ") + "]";
  return "{" + Object.entries(v).map(([k, x]) => `${pyl(k)}: ${pyl(x)}`).join(", ") + "}";
};
const zone = (n, heatSet) => `\t'zone${n}': {
\t\t'label': 'Zone ${n} Temperature', 'units': 'F',
\t\t'pv': '[cal1615]p1${n}_real_to_hmi_2_', 'sp': '[cal1615]p1${n}r30_pid_temp_sp', 'cv': '[cal1615]p1${n}_ao_cv',
\t\t'set1': 'Fast PID (heat-up)', 'set2': 'Auto PID (control)', 'gains': cal1615.zones.PATHS[${n}],
\t\t'valve_view': 'Components/Oven/Zone/Control Valve', 'valve_params': {'zone': ${n}},
\t\t'test': _zone_test(${n}, '${heatSet}'),
\t},`;

// tension loops: load-cell PID (PV in lb, SP = the recipe tension, output 0..100 % with 50 % = neutral speed trim).
// Everything comes from the PID instruction's own members: [cal1615]<pid>/PV /SP /OUT /ERR /SWM, the gains /KP /KI /KD.
const tensionTest = (extra) => ({ kind: "tension", modes: ["steady"], pv_min: 0.0, pv_max: 500.0, cv_min: 0.0, cv_max: 100.0, error_pct: false,
  sample_s: 0.1, bump_default: 2.0, bump_min: 0.5, bump_max: 5.0, steady_band: 3.0, band_min: 0.4,
  base_min_s: 15.0, base_max_s: 60.0, seg_min_s: 20.0, seg_max_s: 60.0, ret_min_s: 15.0, ret_max_s: 60.0, hold_s: 5.0, sat_abort_s: 5.0, max_total_s: 900.0, ...extra });
const tension = (id, label, pid, recipe, active, gainTag, o = {}) => {
  const c = (t) => `[cal1615]${t}`;
  return [id, {
    label, units: "LBS", pv: c(`${pid}/PV`), sp: c(`${pid}/SP`), cv: c(`${pid}/OUT`), set1: "", set2: "Gains",
    gains: { pid2_kp: c(`${pid}/KP`), pid2_ki: c(`${pid}/KI`), pid2_kd: c(`${pid}/KD`),
      pid2_kp_w: c(`p02_real_from_hmi/${gainTag}_40_`), pid2_ki_w: c(`p02_real_from_hmi/${gainTag}_41_`), pid2_kd_w: c(`p02_real_from_hmi/${gainTag}_42_`) },
    valve_view: "", valve_params: {},
    test: tensionTest({ pv: c(`${pid}/PV`), sp: c(`${pid}/SP`), sp_w: c(`p02_recipe_from_hmi/${recipe}`), cv: c(`${pid}/OUT`), active: c(active),
      line_running: c("p01r13_line_running"), swm: c(`${pid}/SWM`), ...(o.test || {}) }),
  }];
};
const TENSION = [
  tension("letoff", "Let-Off Tension", "p20r10_pid_tens", "letoff_tension_sp", "p20r10_tension_request", "letoff"),
  tension("ts1", "Tension Stand 1 Tension", "p22r10_pid_psn", "ts1_tension_sp", "p22r11_request_tension", "ts1", { test: { bump_default: 3.0, bump_max: 8.0 } }),
  tension("ts2", "Tension Stand 2 Tension", "p25r10_pid_psn", "ts2_tension_sp", "p25r10_tension_request", "ts2", { test: { bump_default: 3.0, bump_max: 8.0 } }),
  tension("winder_a", "Winder A Tension", "p29r10_pid_psn", "winder_tension_sp", "p29r10_request_run", "wdr", { test: { bump_default: 3.0, bump_max: 8.0, must_be_off: [["[cal1615]p29_di_wdr_index_fwd", "The winder is not indexing"]] } }),
  tension("winder_b", "Winder B Tension", "p29r11_pid_psn", "winder_tension_sp", "p29r11_request_run", "wdr", { test: { pv_max: 300.0, bump_default: 3.0, bump_max: 8.0, must_be_off: [["[cal1615]p29_di_wdr_index_fwd", "The winder is not indexing"]] } }),
];
const LOOP_IDS = ["zone1", "zone2", "zone3", "cooling", ...TENSION.map((t) => t[0])];
const py = `# Tunable PID loops: the registry for the PID Tuning page (Maintenance/PID Tuning, route /pid-tuning) and for the test runner
# cal1615.tunerun. Generated by tools/pid_tuning.js. Edit the generator, not this file.
#
# The PLC runs classic PID instructions with INDEPENDENT gains (Kp unitless, Ki 1/s, Kd s) on error in ENGINEERING UNITS
# (the PID data shows ERR = SP - PV in degrees / lb), so the gain numbers the tuner suggests are scaled for that ('error_pct' False).
# Oven zones: gains are PLC parameters (pNN_param_pidX_*); the HMI writes them to p02_real_from_hmi.<section>[44..51] and the PLC
# loads them into the PID. Zone 1 and 2 have a Fast PID (large error, heat-up) and an Auto PID (near SP); zone 3 and the cooling
# loop only use the Auto PID. Tension loops: gains are written to p02_real_from_hmi.<section>[40..42] and loaded into the PID every scan.
# Gain keys: pid1_kp / pid1_kp_w (read / write), ... pid2_bias. An empty path hides that row.
# The 'test' section is what cal1615.tunerun needs (tags, limits and timing); a loop without it has no tuning test.

def _zone_test(n, heat_set):
	p = cal1615.zones.PATHS[n]
	return {'kind': 'temperature', 'modes': ['heatup', 'steady'], 'heat_set': heat_set,
		'pv_min': 0.0, 'pv_max': 1000.0, 'cv_min': 0.0, 'cv_max': 100.0, 'error_pct': False,
		'pv': p['temp'], 'sp': p['temp_sp'], 'sp_w': p['temp_sp_w'], 'cv': p['cv_output'],
		'status': p['status'], 'status_ok': 10, 'faults_ok': p['led_zone_faults_ok'], 'auto': p['cv_auto'],
		'hl': p['tc_high_limit'], 'dev': p['sp_dev_warning'], 'soak_to_fast': p['soak_to_fast'],
		'sample_s': 1.0, 'bump_default': 3.0, 'bump_min': 1.0, 'bump_max': 8.0, 'steady_band': 3.0, 'band_min': 0.4,
		'base_min_s': 120.0, 'base_max_s': 600.0, 'seg_min_s': 240.0, 'seg_max_s': 900.0, 'ret_min_s': 120.0, 'ret_max_s': 300.0,
		'hold_s': 60.0, 'sat_abort_s': 30.0, 'max_total_s': 7200.0,
		'cold_margin': 40.0, 'arm_timeout_s': 1800.0, 'reach_band': 2.0, 'reach_hold_s': 180.0, 'max_heat_s': 7200.0}

LOOPS = {
${zone(1, "pid1")}
${zone(2, "pid1")}
${zone(3, "pid2")}
\t'cooling': {
\t\t'label': 'Advanced Cooling Temperature', 'units': 'F',
\t\t'pv': '[cal1615]p19_ai_tc01', 'sp': '[cal1615]p01_recipe_active/adv_cooling_temp_sp', 'cv': '[cal1615]p19_ao_cv',
\t\t'set1': '', 'set2': 'Auto PID (control)',
\t\t'gains': {  # the P19 PID uses only the second gain set
\t\t\t'pid2_kp': '[cal1615]p19_param_pid2_kp', 'pid2_kp_w': '[cal1615]p02_real_from_hmi/adv_cooling_48_',
\t\t\t'pid2_ki': '[cal1615]p19_param_pid2_ki', 'pid2_ki_w': '[cal1615]p02_real_from_hmi/adv_cooling_49_',
\t\t\t'pid2_kd': '[cal1615]p19_param_pid2_kd', 'pid2_kd_w': '[cal1615]p02_real_from_hmi/adv_cooling_50_',
\t\t\t'pid2_bias': '[cal1615]p19_param_pid2_ff', 'pid2_bias_w': '[cal1615]p02_real_from_hmi/adv_cooling_51_',
\t\t},
\t\t'valve_view': 'Components/Oven/Roll Cooling Valve', 'valve_params': {},
\t},
${TENSION.map(([id, o]) => `\t${pyl(id)}: ${pyl(o)},`).join("\n")}
}
ORDER = [${LOOP_IDS.map((i) => `'${i}'`).join(", ")}]
GAIN_KEYS = [s + '_' + g for s in ('pid1', 'pid2') for g in ('kp', 'ki', 'kd', 'bias')]

def loop(name):
	"""Flat dict of tag paths and settings for one loop (missing gains -> '') for the page."""
	l = LOOPS.get(name) or LOOPS['zone1']
	out = dict((k, v) for k, v in l.items() if k not in ('gains', 'test'))
	for k in GAIN_KEYS:
		out[k] = l['gains'].get(k, '')
		out[k + '_w'] = l['gains'].get(k + '_w', '')
	t = l.get('test')
	out['has_test'] = bool(t)
	out['kind'] = t['kind'] if t else 'temperature'
	out['modes'] = list(t['modes']) if t else []
	out['bump_default'] = t['bump_default'] if t else 3.0
	out['bump_min'] = t['bump_min'] if t else 1.0
	out['bump_max'] = t['bump_max'] if t else 8.0
	return out

def pens(name):
	"""Tuning trend: PV and SP on the top plot, controller output on the bottom plot."""
	l = LOOPS.get(name) or LOOPS['zone1']
	src = 'histprov:myOracle:/drv:ignition-4d950438c38c:cal1615:/tag:'
	def pen(label, tag, color, plot):
		st = lambda o: {'fill': {'color': color, 'opacity': o}, 'stroke': {'color': color, 'dashArray': 0, 'opacity': o, 'width': 1.5}}
		return {'axis': '', 'name': label, 'plot': plot, 'enabled': True, 'selectable': True, 'visible': True,
			'data': {'aggregateMode': 'default', 'source': src + tag.split(']', 1)[-1].lower()},
			'display': {'type': 'line', 'breakLine': True, 'interpolation': 'curveStepAfter' if plot else 'curveLinear', 'radius': 3,
				'styles': {'normal': st(0.9), 'highlighted': st(1), 'muted': st(0.4), 'selected': st(1)}}}
	return [pen('PV', l['pv'], '#1F77B4', 0), pen('SP', l['sp'], '#D62728', 0), pen('Output %', l['cv'], '#2CA02C', 1)]
`;
const pyDir = R + "/cal1615_std/ignition/script-python/cal1615/pid";
fs.mkdirSync(pyDir, { recursive: true });
fs.writeFileSync(pyDir + "/code.py", py);
fs.writeFileSync(pyDir + "/resource.json", fs.readFileSync(R + "/cal1615_std/ignition/script-python/cal1615/recipes/resource.json", "utf8"));

// ------------------------------------------------------------------ 3. page
const AUTH = "{session.props.auth.authenticated}";
const ROW = { paddingLeft: "6px", paddingRight: "6px", paddingTop: "3px", paddingBottom: "3px", gap: "4px" };
const ind = (key, transforms) => ({ binding: { type: "tag", config: { fallbackDelay: 2.5, mode: "indirect", references: { 0: `{view.custom.p.${key}}` }, tagPath: "{0}", bidirectional: false }, ...(transforms ? { transforms } : {}) } });
const expr = (expression) => ({ binding: { type: "expr", config: { expression } } });
const lbl = (name, text, cls, position, propConfig, style) => ({ type: "ia.display.label", meta: { name }, position, props: { text, style: { classes: cls, ...(style || {}) } }, ...(propConfig ? { propConfig } : {}) });
const row = (name, title, middle, units, display) => ({ type: "ia.container.flex", meta: { name }, position: { basis: "28px", shrink: 0 },
  props: { direction: "row", alignItems: "stretch", style: ROW },
  children: [lbl("title", title, "cal1615/row-label", { grow: 1, basis: "0" }), middle, lbl("units", units, "cal1615/units", { basis: "34px", shrink: 0 }, units === "@" ? { "props.text": expr("{view.custom.p.units}") } : undefined)],
  ...(display ? { propConfig: { "position.display": expr(display) } } : {}) });
const fmt = (f) => [{ type: "format", formatType: "numeric", formatValue: f }];
const valueRow = (name, title, key, units, f = "#,##0.0") => row(name, title, lbl("value", "---", "cal1615/value", { basis: "100px", shrink: 0 }, { "props.text": ind(key, fmt(f)) }), units);
const exprRow = (name, title, e, units) => row(name, title, lbl("value", "---", "cal1615/value", { basis: "100px", shrink: 0 }, { "props.text": expr(e) }), units);
const gainRow = (key, title, units, f) => row(`r_${key}`, title, {
  type: "ia.input.numeric-entry-field", meta: { name: "entry" }, position: { basis: "100px", shrink: 0 },
  props: { format: f, spinner: { enabled: false }, style: { classes: "cal1615/entry" } },
  propConfig: { "props.value": ind(key), "props.enabled": expr(AUTH) },
  events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script:
    `\t# Read from the PLC parameter, written to the HMI input the PLC loads it from.\n\tpath = self.view.custom.p['${key}_w']\n\tif path:\n\t\tsystem.tag.writeBlocking([path], [self.props.value])` } } } } },
  units, `len({view.custom.p.${key}}) > 0`);
const card = (name, header, rows, headerBinding) => {
  const h = 26 + rows.length * 28 + 6;
  return { type: "ia.container.flex", meta: { name }, position: { basis: `${h}px`, shrink: 0 },
    props: { direction: "column", style: { classes: "cal1615/card", paddingBottom: "4px" } },
    children: [lbl("header", header, "cal1615/card-header", { basis: "26px", shrink: 0 }, headerBinding ? { "props.text": headerBinding } : undefined), ...rows] };
};
const gainCard = (set) => ({ ...card(`gains_${set}`, "", [
  gainRow(`${set}_kp`, "Proportional Gain Kp", "", "#,##0.000"),
  gainRow(`${set}_ki`, "Integral Gain Ki", "1/s", "#,##0.000"),
  gainRow(`${set}_kd`, "Derivative Gain Kd", "s", "#,##0.000"),
  gainRow(`${set}_bias`, "Bias", "%", "#,##0.0"),
], expr(`{view.custom.p.${set === "pid1" ? "set1" : "set2"}}`)),
  propConfig: { "position.display": expr(`len({view.custom.p.${set}_kp}) > 0`) } });

const LOOP_BTNS = [["zone1", "Zone 1", 96], ["zone2", "Zone 2", 96], ["zone3", "Zone 3", 96], ["cooling", "Advanced Cooling", 150], ["letoff", "Let-Off", 90], ["ts1", "TS1", 70], ["ts2", "TS2", 70], ["winder_a", "Winder A", 96], ["winder_b", "Winder B", 96]];
const btn = (id, text, w) => ({ type: "ia.input.button", meta: { name: `loop_${id}` }, position: { basis: `${w}px`, shrink: 0 },
  props: { text, style: { fontSize: "14px" } },
  propConfig: { "props.primary": expr(`{view.custom.loop} = '${id}'`) },
  events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script: `\tself.view.custom.loop = '${id}'\n\tself.view.custom.bumpUser = 0.0\n\tself.view.custom.confirm = ''\n\tself.view.custom.msg = ''` } } } } });

const chart = { type: "ia.chart.powerchart", meta: { name: "trend" }, position: { grow: 1, basis: "0" },
  props: { config: { measureOfTime: "minutes", unitOfTime: 30, refreshRate: 1000, visibility: { showTagBrowser: false } },
    plots: [{ color: "var(--neutral-10)", markers: [], relativeWeight: 3, style: { classes: "" } }, { color: "var(--neutral-10)", markers: [], relativeWeight: 1, style: { classes: "" } }],
    style: { classes: "cal1615/card" } },
  propConfig: {
    "props.pens": { binding: { type: "expr", config: { expression: "{view.custom.loop}" }, transforms: [{ type: "script", code: "\treturn cal1615.pid.pens(value)" }] } },
    "props.title.text": expr("{view.custom.p.label}"),
  } };

const live = card("live", "Live", [
  valueRow("pv", "Process Value (PV)", "pv", "@"),
  valueRow("sp", "Setpoint (SP)", "sp", "@"),
  exprRow("err", "Error (PV - SP)", "if(isNull({view.custom.pvv}) || isNull({view.custom.spv}), '---', numberFormat({view.custom.pvv} - {view.custom.spv}, '#,##0.0'))", "@"),
  valueRow("cv", "Controller Output", "cv", "%"),
], expr("{view.custom.p.label}"));
const valve = { type: "ia.display.view", meta: { name: "valve" }, position: { basis: "160px", shrink: 0 },
  props: { path: "", params: {}, style: { classes: "" } },
  propConfig: { "position.display": expr("len({view.custom.p.valve_view}) > 0"), "props.path": expr("{view.custom.p.valve_view}"), "props.params": { binding: { type: "property", config: { path: "view.custom.p.valve_params" } } } } };
const note = lbl("note", "Gains are PLC parameters. A value entered here is sent to the HMI input the PLC loads the PID from; it takes effect on the next PLC scan. Trend: 30 min, history logged every 10 s (tension loops: use the test result for fast detail).",
  "", { basis: "auto", shrink: 0 }, undefined, { fontSize: "11px", color: "var(--neutral-70)", whiteSpace: "normal", padding: "2px 4px" });

// ------------------------------------------------------------------ tuning test column (engine in cal1615.tuning, runner in cal1615.tunerun)
const r = (k) => `{view.custom.run.${k}}`;      // live test state (cal1615.tunerun.status, polled)
const sm = (k) => `{view.custom.sum.${k}}`;     // last result (cal1615.tunerun.summary)
const P_ = (k) => `{view.custom.p.${k}}`;       // the selected loop (cal1615.pid.loop)
const num = (e, f) => `numberFormat(coalesce(${e}, 0), '${f}')`;
const textLbl = (name, e, style = {}, display) => ({ type: "ia.display.label", meta: { name }, position: { basis: "auto", shrink: 0 },
  props: { text: "", style: { fontSize: "12px", padding: "2px 8px", textAlign: "left", whiteSpace: "pre-wrap", ...style } },
  propConfig: { "props.text": expr(e), ...(display ? { "position.display": expr(display) } : {}) } });
const abtn = (name, text, enabled, script, primary = false, display, textExpr) => ({ type: "ia.input.button", meta: { name }, position: { grow: 1, basis: "0" },
  props: { text, primary, style: { fontSize: "13px" } },
  propConfig: { "props.enabled": expr(enabled), ...(display ? { "position.display": expr(display) } : {}), ...(textExpr ? { "props.text": expr(textExpr) } : {}) },
  events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script } } } } });
const btnRow = (name, buttons, display) => ({ type: "ia.container.flex", meta: { name }, position: { basis: "42px", shrink: 0 },
  props: { direction: "row", style: { gap: "6px", padding: "4px 6px" } }, children: buttons,
  ...(display ? { propConfig: { "position.display": expr(display) } } : {}) });
const USER = "\tuser = self.session.props.auth.user.userName\n";
const SET = (v) => `\tself.view.custom.confirm = '${v}'\n`;
const NOT_RUNNING = `!${r("running")}`;
const CONF = "{view.custom.confirm}";
const MODE = "{view.custom.mode}";
const HAS_RESULT = `coalesce(${sm("k")}, '') != ''`;

// --- mode selector, instructions, bump size
const modeBtn = (id, text) => ({ type: "ia.input.button", meta: { name: `mode_${id}` }, position: { grow: 1, basis: "0" },
  props: { text, style: { fontSize: "12px" } },
  propConfig: { "props.primary": expr(`${MODE} = '${id}'`), "props.enabled": expr(NOT_RUNNING) },
  events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script: `\tself.view.custom.modeSel = '${id}'\n\tself.view.custom.confirm = ''\n\tself.view.custom.msg = ''` } } } } });
const HOW_HEATUP = "'Heat-up from cold tunes the Fast PID while the oven climbs, which is when its dynamics matter most. 1) Oven empty and cold (see the checklist). 2) Press Arm: nothing is written to the PLC, the capture only records. 3) Press Start Heat on the zone page as usual. The capture waits up to 30 minutes for the burner. 4) Leave it alone until PV has been at SP for 3 minutes, or press Finish now. 5) Review the result, apply, and watch the next heat-up. Revert if it is worse.'";
const HOW_STEADY_TEMP = "'SP bumps at steady state tune the Auto PID. The zone stays in auto control the whole time. The test bumps the SP up, back, down and back (about 25 minutes), records PV and CV every second, then restores the SP. Use an empty oven that has been steady at SP for 10 minutes or more. Do not download a recipe, open doors or change other zones during the test.'";
const HOW_STEADY_TENSION = "'SP bumps tune the loop while the line runs with material (about 2 minutes). The test bumps the tension SP up, back, down and back, recording PV and the PID output every 0.1 s, then restores the SP. Do not splice, index, change speed or download a recipe during the test. The tension tags must be on the fast tag group (see the README); otherwise the test refuses to start.'";
const howText = `if(${MODE} = 'heatup', ${HOW_HEATUP}, if(${P_("kind")} = 'tension', ${HOW_STEADY_TENSION}, ${HOW_STEADY_TEMP}))`;
const bumpRow = row("bump", "SP bump size (up, then down)", {
  type: "ia.input.numeric-entry-field", meta: { name: "entry" }, position: { basis: "100px", shrink: 0 },
  props: { format: "#,##0.0", spinner: { enabled: false }, style: { classes: "cal1615/entry" } },
  propConfig: { "props.value": expr("{view.custom.bump}"), "props.enabled": expr(`${AUTH} && ${NOT_RUNNING}`) },
  events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script: "\tself.view.custom.bumpUser = float(self.props.value or 0)" } } } } }, "@", `${MODE} = 'steady'`);

// --- readiness checklist: ten rows, filled from cal1615.tunerun.readiness
const readyRow = (i) => ({ type: "ia.container.flex", meta: { name: `ready${i}` }, position: { basis: "auto", shrink: 0 },
  props: { direction: "row", alignItems: "flex-start", style: { gap: "6px", padding: "1px 8px" } },
  propConfig: { "position.display": expr(`len({view.custom.ready}) > ${i}`) },
  children: [
    { type: "ia.display.label", meta: { name: "lamp" }, position: { basis: "14px", shrink: 0 }, props: { text: "", style: { height: "14px", marginTop: "2px", borderRadius: "7px" } },
      propConfig: { "props.style.backgroundColor": { binding: { type: "expr", config: { expression: "{view.custom.ready}" }, transforms: [{ type: "script",
        code: `\tif len(value) <= ${i}:\n\t\treturn 'transparent'\n\tok = value[${i}]['ok']\n\treturn '#00C000' if ok is True else ('#E02020' if ok is False else '#B0B0B0')` }] } } } },
    { type: "ia.display.label", meta: { name: "text" }, position: { grow: 1, basis: "0" }, props: { text: "", style: { fontSize: "12px", whiteSpace: "pre-wrap", textAlign: "left" } },
      propConfig: { "props.text": { binding: { type: "expr", config: { expression: "{view.custom.ready}" }, transforms: [{ type: "script",
        code: `\treturn value[${i}]['text'] if len(value) > ${i} else ''` }] } } } },
  ] });

const testCard = { type: "ia.container.flex", meta: { name: "test" }, position: { basis: "auto", shrink: 0 },
  props: { direction: "column", style: { classes: "cal1615/card", paddingBottom: "6px" } },
  children: [
    lbl("header", "Tuning Test", "cal1615/card-header", { basis: "26px", shrink: 0 }, { "props.text": expr(`'Tuning Test: ' + ${P_("label")}`) }),
    btnRow("modes", [modeBtn("heatup", "Heat-up from cold"), modeBtn("steady", "SP bumps (steady)")], `${P_("kind")} = 'temperature'`),
    textLbl("how", howText, { color: "var(--neutral-70)", fontSize: "11px" }),
    textLbl("readyTitle", "'Ready to start? (green = ok, red = fix first, grey = you confirm)'", { fontWeight: "bold", fontSize: "11px", padding: "4px 8px 0 8px" }),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(readyRow),
    bumpRow,
    btnRow("buttons", [
      abtn("start", "Start test", `${AUTH} && ${NOT_RUNNING} && ${CONF} = ''`, "\tself.view.custom.msg = ''\n" + SET("start"), true, null,
        `if(${MODE} = 'heatup', 'Arm heat-up capture', 'Start test')`),
      abtn("finish", "Finish now", `${AUTH} && ${r("running")} && ${r("phase")} = 'heating'`, USER + "\tcal1615.tunerun.finish(user)\n\tself.view.custom.msg = 'Finishing: analysing what was captured.'", false, `${MODE} = 'heatup'`),
      abtn("abort", "Abort", `${AUTH} && ${r("running")}`,
        USER + "\tcal1615.tunerun.abort(user)\n\tself.view.custom.msg = 'Abort requested.'"),
    ]),
    textLbl("confirmText", `if(${CONF} = 'start', if(${MODE} = 'heatup', 'Arm the capture on ' + ${P_("label")} + '? Nothing is written to the PLC. After arming, press Start Heat on the zone page. The capture waits up to 30 minutes for the burner.', 'This will move the ' + ${P_("label")} + ' setpoint by +/- ' + toStr(coalesce({view.custom.bump}, 0)) + ' ' + ${P_("units")} + ' for ' + if(${P_("kind")} = 'tension', 'about 2 minutes', 'about 25 minutes') + ', then restore it. It stops and restores the setpoint on any fault, a runaway, or Abort. If someone else changes the setpoint, it stops and leaves their value alone.'), if(${CONF} = 'apply', 'Write the suggested Kp and Ki to the PLC now? The old values are kept so you can revert.', if(${CONF} = 'revert', 'Put the previous Kp and Ki back?', '')))`,
      { color: "#B05000", fontWeight: "bold" }, `len(${CONF}) > 0`),
    btnRow("confirmButtons", [
      abtn("confirm", "Confirm", AUTH,
        USER + "\tkind = self.view.custom.confirm\n\tself.view.custom.confirm = ''\n\tloop = self.view.custom.loop\n" +
        "\tif kind == 'start':\n\t\tok, msg = cal1615.tunerun.start(loop, self.view.custom.bump, user, self.view.custom.mode)\n" +
        "\telif kind == 'apply':\n\t\tok, msg = cal1615.tunerun.apply_suggested(loop, user)\n" +
        "\telif kind == 'revert':\n\t\tok, msg = cal1615.tunerun.revert_applied(loop, user)\n" +
        "\telse:\n\t\tmsg = ''\n" +
        "\tself.view.custom.msg = msg", true),
      abtn("cancel", "Cancel", "true", "\tself.view.custom.confirm = ''"),
    ], `len(${CONF}) > 0`),
    textLbl("phase", `if(${r("running")}, if(${r("phase")} = 'waiting for heat', 'Armed: waiting for the burner (press Start Heat on the zone page)', if(${r("phase")} = 'heating', 'Capturing the heat-up', 'Running: ' + coalesce(${r("phase")}, ''))) + '   elapsed ' + numberFormat(coalesce(${r("elapsed")}, 0) / 60, '0.0') + ' min', 'Idle')`, { fontWeight: "bold" }),
    textLbl("live", `if(${r("running")}, 'PV ' + ${num(r("pv"), "#,##0.0")} + '   SP ' + ${num(r("sp"), "#,##0.0")} + '   CV ' + ${num(r("cv"), "#,##0.0")} + ' %', '')`, {}, r("running")),
    textLbl("msg", `if(len(coalesce({view.custom.msg}, '')) > 0, {view.custom.msg}, if(${r("running")}, '', coalesce(${r("message")}, '')))`, { color: "#B05000" }),
    { ...textLbl("events", r("events"), { fontSize: "11px", color: "var(--neutral-70)", fontFamily: "monospace" }),
      propConfig: { "props.text": { binding: { type: "expr", config: { expression: r("events") }, transforms: [{ type: "script", code: "\treturn '\\n'.join(list(value)[-6:]) if value else ''" }] } } } },
  ] };

const sumRow = (name, title, key, units = "") => ({ ...exprRow(name, title, `coalesce(${sm(key)}, '---')`, units), propConfig: { "position.display": expr(HAS_RESULT) } });
const gainRowS = (name, title, a, b) => ({ ...exprRow(name, title, `coalesce(${sm(a)}, '---') + ' > ' + coalesce(${sm(b)}, '---')`, ""), propConfig: { "position.display": expr(HAS_RESULT) } });
const resultCard = { type: "ia.container.flex", meta: { name: "result" }, position: { basis: "auto", shrink: 0 },
  props: { direction: "column", style: { classes: "cal1615/card", paddingBottom: "6px" } },
  children: [
    lbl("header", "Last Test Result", "cal1615/card-header", { basis: "26px", shrink: 0 }),
    textLbl("empty", `coalesce(${sm("text")}, '')`, { color: "var(--neutral-70)" }, `!${HAS_RESULT}`),
    textLbl("title", `coalesce(${sm("text")}, '')`, { fontWeight: "bold" }, HAS_RESULT),
    sumRow("k", "Process gain", "k"), sumRow("tau", "Time constant", "tau"), sumRow("theta", "Dead time", "theta"), sumRow("r2", "Model fit (R2)", "r2"),
    gainRowS("kp", "Kp  now > suggested", "cur_kp", "sug_kp"), gainRowS("ki", "Ki  now > suggested (1/s)", "cur_ki", "sug_ki"),
    textLbl("perfNow", `'Now: ' + coalesce(${sm("cur_perf")}, '')`, {}, HAS_RESULT),
    textLbl("perfSug", `'Suggested: ' + coalesce(${sm("sug_perf")}, '')`, { fontWeight: "bold" }, HAS_RESULT),
    textLbl("extra", `coalesce(${sm("extra")}, '')`, { fontSize: "11px", color: "var(--neutral-70)" }, `len(coalesce(${sm("extra")}, '')) > 0`),
    textLbl("conv", `'The PLC PID works on ' + coalesce(${sm("convention")}, '?') + ' error. Only Kp and Ki are changed; Kd is left alone.'`, { color: "var(--neutral-70)", fontSize: "11px" }, HAS_RESULT),
    textLbl("warn", `coalesce(${sm("warnings")}, '')`, { color: "#B05000" }, `len(coalesce(${sm("warnings")}, '')) > 0`),
    textLbl("block", `'Cannot apply: ' + coalesce(${sm("blockers")}, '')`, { color: "#D01010", fontWeight: "bold" }, `len(coalesce(${sm("blockers")}, '')) > 0`),
    textLbl("applied", `coalesce(${sm("applied")}, '')`, { color: "var(--neutral-70)" }, `len(coalesce(${sm("applied")}, '')) > 0`),
    btnRow("applyButtons", [
      abtn("apply", "Apply suggested", `${AUTH} && ${NOT_RUNNING} && ${sm("can_apply")} && ${CONF} = ''`, "\tself.view.custom.msg = ''\n" + SET("apply"), true),
      abtn("revert", "Revert", `${AUTH} && ${NOT_RUNNING} && ${sm("can_revert")} && ${CONF} = ''`, "\tself.view.custom.msg = ''\n" + SET("revert")),
    ], `${HAS_RESULT} || ${sm("can_revert")}`),
  ] };
const tuneCol = { type: "ia.container.flex", meta: { name: "tune" }, position: { basis: "420px", shrink: 0 }, props: { direction: "column", style: { gap: "8px", overflowY: "auto" } },
  propConfig: { "position.display": expr(P_("has_test")) }, children: [testCard, resultCard] };

const view = {
  custom: { loop: "zone1", pvv: null, spv: null, modeSel: "heatup", mode: "heatup", bumpUser: 0.0, bump: 3.0, confirm: "", msg: "", run: { running: false, events: [] }, sum: { has_run: false }, ready: [], recovered: "" },
  params: {},
  propConfig: {
    "custom.p": { binding: { type: "expr", config: { expression: 'runScript("cal1615.pid.loop", 0, {view.custom.loop})' } } },
    "custom.pvv": ind("pv"), "custom.spv": ind("sp"),
    // the mode in effect: the selected one when this loop offers it, else its first mode
    "custom.mode": { binding: { type: "expr-struct", config: { struct: { sel: "{view.custom.modeSel}", modes: "{view.custom.p.modes}" } },
      transforms: [{ type: "script", code: "\tm = list(value['modes'] or [])\n\treturn value['sel'] if value['sel'] in m else (m[0] if m else 'steady')" }] } },
    "custom.bump": { binding: { type: "expr", config: { expression: "if(coalesce({view.custom.bumpUser}, 0) > 0, {view.custom.bumpUser}, coalesce({view.custom.p.bump_default}, 3))" } } },
    "custom.ready": { binding: { type: "expr", config: { expression: "runScript('cal1615.tunerun.readiness', 3000, {view.custom.loop}, {view.custom.mode}, {view.custom.bump})" } } },
    "custom.run": { binding: { type: "expr", config: { expression: 'runScript("cal1615.tunerun.status", 2000)' } } },
    "custom.sum": { binding: { type: "expr", config: { expression: 'runScript("cal1615.tunerun.summary", 10000, {view.custom.loop}, {view.custom.run.running})' } } },
    // opening the page also puts back the SP of an interrupted test (the gateway watchdog tag does the same every minute)
    "custom.recovered": { binding: { type: "expr", config: { expression: 'runScript("cal1615.tunerun.recover", 0)' } } },
  },
  props: { defaultSize: { width: 1680, height: 1024 } },
  root: { type: "ia.container.flex", meta: { name: "root" }, position: {}, props: { direction: "column", style: { padding: "6px", gap: "8px", overflow: "hidden" } },
    children: [
      { type: "ia.container.flex", meta: { name: "topBar" }, position: { basis: "44px", shrink: 0 }, props: { direction: "row", alignItems: "center", style: { gap: "8px" } },
        children: [lbl("title", "PID Tuning", "cal1615/page-title", { basis: "220px", shrink: 0 }, undefined, { textAlign: "left" }), ...LOOP_BTNS.map(([id, t, w]) => btn(id, t, w))] },
      { type: "ia.container.flex", meta: { name: "body" }, position: { grow: 1, basis: "0" }, props: { direction: "row", alignItems: "stretch", style: { gap: "8px" } },
        children: [chart, tuneCol,
          { type: "ia.container.flex", meta: { name: "side" }, position: { basis: "400px", shrink: 0 }, props: { direction: "column", style: { gap: "8px", overflowY: "auto" } },
            children: [live, gainCard("pid1"), gainCard("pid2"), valve, note] }] },
    ] },
};
writeView("MainViews/Feature Views/Maintenance/PID Tuning", view);

// ------------------------------------------------------------------ 4. navigation
const pcf = `${P}/page-config/config.json`;
const pc = rd(pcf);
pc.pages["/pid-tuning"] = { ...pc.pages["/zone-setup"], viewPath: "MainViews/Feature Views/Maintenance/PID Tuning" };
wr(pcf, pc);
const navf = `${V}/MainViews/Nav/Maintenance/view.json`;
const nav = rd(navf);
const items = nav.root.children[0].props.items;
if (!items.some((i) => i.target === "/pid-tuning")) {
  const zs = items.find((i) => i.target === "/zone-setup");
  items.splice(items.indexOf(zs) + 1, 0, { ...JSON.parse(JSON.stringify(zs)), label: { ...zs.label, text: "PID Tuning" }, target: "/pid-tuning" });
  nav.props.defaultSize.height = Math.round(nav.props.defaultSize.height * items.length / (items.length - 1));
  wr(navf, nav);
}
const hf = `${V}/Framework/Header Main Nav/view.json`;
let hs = fs.readFileSync(hf, "utf8");
if (!hs.includes('\\"/pid-tuning\\"')) { hs = hs.split('{page.props.path} = \\"/zone-setup\\"').join('{page.props.path} = \\"/zone-setup\\" || {page.props.path} = \\"/pid-tuning\\"'); fs.writeFileSync(hf, hs); }
console.log("PID Tuning page, script cal1615.pid, route /pid-tuning, Maintenance menu entry done");
