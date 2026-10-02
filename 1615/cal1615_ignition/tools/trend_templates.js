// Trend templates for the Ad Hoc Trends page (route /trend), stored in myOracle (AD_HOC_TRENDS_CONFIG).
// Writes the project script cal1615.trends and patches the AdHocTrends view.
const fs = require("fs"), path = require("path");
const R = "E:/aaa_projects/ParkTemp/1615";
const STD = R + "/cal1615_std";
const PROVIDER = "histprov:myOracle:/drv:ignition-4d950438c38c:cal1615:/tag:";

// --- tags with history (validate every pen)
const hist = new Set();
(function w(n, p) { for (const t of n.tags || []) { const q = p ? p + "/" + t.name : t.name; if (t.historyEnabled) hist.add(q.toLowerCase()); w(t, q); } })(JSON.parse(fs.readFileSync(R + "/cal1615_ignition/tags/cal1615_tags.json", "utf8")), "");

const Z = (n) => [[`Zone ${n} PV (Control Temp)`, `p1${n}_real_to_hmi_2_`], [`Zone ${n} SP`, `p1${n}r30_pid_temp_sp`], [`Zone ${n} TC1`, `p1${n}_ai_tc01`], [`Zone ${n} TC2`, `p1${n}_ai_tc02`], [`Zone ${n} CV (Valve Output %)`, `p1${n}_ao_cv`, 1]];
const TEMPLATES = [
  ["Oven - Zone Temperatures", 4, [...[1, 2, 3].flatMap((n) => [[`Zone ${n} PV`, `p1${n}_real_to_hmi_2_`], [`Zone ${n} SP`, `p1${n}r30_pid_temp_sp`]]),
    ...[1, 2, 3].map((n) => [`Zone ${n} CV %`, `p1${n}_ao_cv`, 1])]],
  ["Oven - Zone 1 Detail", 2, Z(1)],
  ["Oven - Zone 2 Detail", 2, Z(2)],
  ["Oven - Zone 3 Detail", 2, Z(3)],
  ["Oven - Control Valves", 2, [["Zone 1 CV", "p11_ao_cv"], ["Zone 2 CV", "p12_ao_cv"], ["Zone 3 CV", "p13_ao_cv"], ["Cooling CV", "p19_ao_cv"]]],
  ["Oven - Zone Pressure", 2, [["Zone 1 Pressure", "p11_ai_prs"], ["Zone 2 Pressure", "p12_ai_prs"]]],
  ["Oven - LFL", 2, [["Zone 1 LFL", "p11_ai_lfl"], ["Zone 2 LFL", "p12_ai_lfl"]]],
  ["Oven - Fan Speeds", 2, [["Zone 1 Exhaust", "p11_ai_exh_rpm"], ["Zone 1 Recirc", "p11_ai_recirc_rpm"], ["Zone 2 Exhaust", "p12_ai_exhaust_rpm"],
    ["Zone 2 Recirc", "p12_ai_recirc_rpm"], ["Zone 3 Exhaust", "p13_ai_exhaust_rpm"], ["Zone 3 Recirc", "p13_ai_recirc_rpm"]]],
  ["RTO - Temperatures", 4, [["TE-103 Chamber", "p01_real_to_hmi_13_"], ["TE-104 Chamber", "p01_real_to_hmi_14_"], ["TE-101 Inlet", "p01_real_to_hmi_11_"],
    ["TE-105 Exhaust", "p01_real_to_hmi_15_"], ["TE-107 Combustion Air", "p01_real_to_hmi_16_"], ["TE-108 Bed", "p01_real_to_hmi_17_"], ["TE-109 Bed", "p01_real_to_hmi_18_"], ["Delta T", "p01_real_to_hmi_12_"]]],
  ["Advanced Cooling", 2, [["Roll Cooling PV", "p19_ai_tc01"], ["Roll Cooling SP", "p01_recipe_active/adv_cooling_temp_sp"], ["Roll Cooling CV (Valve Output %)", "p19_ao_cv", 1]]],
  ["Line - Speeds", 1, [["Line Speed", "p01r12_master_ramped_speed"], ["Line Speed SP", "p01_recipe_active/line_speed_sp"], ["Tension Stand 1", "p22_ai_speed"],
    ["Tension Stand 2", "p25_ai_speed"], ["Impreg Metering Roll", "p23_ai_metering_roll_speed_fpm"], ["Slitter", "p28_ai_slitter_speed"]]],
  ["Line - Tensions", 1, [["Letoff", "p20r06_ave_lc"], ["Letoff SP", "p01_recipe_active/letoff_tension_sp"], ["Tension Stand 1", "p22r06_ave_lc"], ["TS1 SP", "p01_recipe_active/ts1_tension_sp"],
    ["Tension Stand 2", "p25r06_ave_lc"], ["TS2 SP", "p01_recipe_active/ts2_tension_sp"], ["Winder", "p29r06_ave_wdr_lc"], ["Winder SP", "p01_recipe_active/winder_tension_sp"]]],
  ["Line - Accumulators", 1, [["Entry Accumulator", "p20r13_ai_acc_pct"], ["Winder Accumulator", "Program_P31_WAC/ai_lpt01_pct"]]],
  ["Line - Drive Currents", 1, [["Letoff A", "p20_loa_ai_amps"], ["Letoff B", "p20_lob_ai_amps"], ["Tension Stand 1", "p22_ai_amps"], ["Metering Roll", "p23_ai_metering_roll_amps"],
    ["Impreg Supply", "p23_ai_supply_amps"], ["Slitter", "p28_ai_slitter_amps"], ["Winder A", "p29_ai_wa_amps"], ["Winder B", "p29_ai_wb_amps"]]],
  ["Splice Press", 2, [["Platen Temp", "p21_ai_splice_platen_temp"], ["Platen Temp SP", "p01_recipe_active/platen_temp_sp"]]],
  ["Winder & Poly Diameters", 4, [["Winder A Avg Diameter", "p29r17_winder_a_avg_diam_inch"], ["Upper Poly A", "p26_ao_dia_a"], ["Upper Poly B", "p26_ao_dia_b"],
    ["Lower Poly A", "p27_ao_dia_a"], ["Lower Poly B", "p27_ao_dia_b"]]],
];
const bad = TEMPLATES.flatMap(([, , pens]) => pens.filter(([, t]) => !hist.has(t.toLowerCase())).map(([, t]) => t));
if (bad.length) throw new Error("pens without history: " + bad.join(", "));

const COLORS = ["#1F77B4", "#D62728", "#2CA02C", "#FF7F0E", "#9467BD", "#8C564B", "#E377C2", "#17BECF"];
const pen = (name, tag, color, plot = 0) => {
  const st = (o) => ({ fill: { color, opacity: o }, stroke: { color, dashArray: 0, opacity: o, width: 1.5 } });
  return { axis: "", name, plot, enabled: true, selectable: true, visible: true,
    data: { aggregateMode: "default", source: PROVIDER + tag.toLowerCase() },
    display: { type: "line", breakLine: true, interpolation: "curveLinear", radius: 3, styles: { normal: st(0.9), highlighted: st(1), muted: st(0.4), selected: st(1) } } };
};
const VERSION = 3; // bump when the templates change; rows still marked with an older version are replaced
// A pen may name its plot as a third element: [label, tag, plot]. Plot 1 becomes a lower plot (e.g. CV in %).
const plotsFor = (pens) => {
  const n = Math.max(0, ...pens.map((p) => p[2] || 0)) + 1;
  return Array.from({ length: n }, (_, i) => ({ color: "var(--neutral-10)", markers: [], relativeWeight: i === 0 ? 3 : 1, style: { classes: "" } }));
};
const configOf = (name, hours, pens) => JSON.stringify({ config: { measureOfTime: "hours", unitOfTime: hours, refreshRate: 10000, visibility: { showTagBrowser: true } }, pens: pens.map(([n, t, plot], i) => pen(n, t, COLORS[i % COLORS.length], plot || 0)),
  plots: plotsFor(pens), title: { font: { color: "" }, text: name, visible: true }, cal1615Template: VERSION });

// --- project script cal1615.trends
const py = `# Trend templates for the Trend page (Ad Hoc Trends, route /trend). Generated; edit the templates here.
# Saved trends and templates live in myOracle table AD_HOC_TRENDS_CONFIG (Ad Hoc Trends' own format).
# Templates are shared rows (USERNAME NULL, PRIVATE 0). ensureStore() only inserts templates that are missing,
# so a template edited and re-saved by an operator is kept.
DB = 'myOracle'
VERSION = ${VERSION}
_log = system.util.getLogger('cal1615.trends')
_done = [False]

TEMPLATES = [
${TEMPLATES.map(([n, h, p]) => `\t(${JSON.stringify(n)}, ${JSON.stringify(configOf(n, h, p))}),`).join("\n")}
]

_CREATE = """BEGIN
	EXECUTE IMMEDIATE 'CREATE TABLE AD_HOC_TRENDS_CONFIG (
		id NUMBER GENERATED BY DEFAULT ON NULL AS IDENTITY,
		username VARCHAR(255),
		config_name VARCHAR(255),
		private NUMBER,
		config NCLOB,
		t_stamp DATE DEFAULT CURRENT_TIMESTAMP,
		CONSTRAINT name UNIQUE(username, config_name))';
EXCEPTION
	WHEN OTHERS THEN
		IF SQLCODE <> -955 THEN RAISE; END IF;
END;"""
# row id 0 with private = 0 is how Ad Hoc Trends marks a database as enabled for saved trends
_ENABLE = """MERGE INTO AD_HOC_TRENDS_CONFIG a USING (SELECT 0 AS ID FROM DUAL) d ON (a.ID = d.ID)
	WHEN NOT MATCHED THEN INSERT (ID, CONFIG, CONFIG_NAME, PRIVATE, USERNAME) VALUES (0, NULL, NULL, 0, NULL)"""
# Replace a template only while it is still the generated one: first version (no marker, no refreshRate)
# or an older marker. A trend re-saved from the page loses the marker and is never overwritten.
_UPGRADE = """UPDATE AD_HOC_TRENDS_CONFIG SET config = ?, t_stamp = CURRENT_TIMESTAMP
	WHERE username IS NULL AND config_name = ? AND (
		(DBMS_LOB.INSTR(config, '"cal1615Template"') = 0 AND DBMS_LOB.INSTR(config, '"refreshRate"') = 0) OR
		(DBMS_LOB.INSTR(config, '"cal1615Template"') > 0 AND DBMS_LOB.INSTR(config, ?) = 0))"""
_INSERT = """INSERT INTO AD_HOC_TRENDS_CONFIG (config, config_name, private, username)
	SELECT ?, ?, 0, NULL FROM DUAL
	WHERE NOT EXISTS (SELECT 1 FROM AD_HOC_TRENDS_CONFIG WHERE username IS NULL AND config_name = ?)"""

def ensureStore():
	"""Create the saved-trends table in myOracle, enable it and add missing templates. Once per gateway run."""
	if _done[0]:
		return
	try:
		system.db.runUpdateQuery(_CREATE, DB)
		system.db.runUpdateQuery(_ENABLE, DB)
		added = updated = 0
		for name, config in TEMPLATES:
			updated += system.db.runPrepUpdate(_UPGRADE, [config, name, '"cal1615Template":%d' % VERSION], DB)
			added += system.db.runPrepUpdate(_INSERT, [config, name, name], DB)
		_done[0] = True
		if added or updated:
			_log.info('Trend templates: %d added, %d updated' % (added, updated))
	except Exception, e:
		_log.warn('Trend template store not ready: %s' % e)

# ---- template bar on the Trend page: Load / Update / Delete / Store New
BUILT_IN = set(name for name, config in TEMPLATES)

def options():
	"""Dropdown options: every saved trend and template, by name."""
	ensureStore()
	ds = system.db.runPrepQuery('SELECT id AS "id", config_name AS "name" FROM AD_HOC_TRENDS_CONFIG WHERE id > 0 ORDER BY UPPER(config_name)', [], DB)
	return [{'value': int(r['id']), 'label': r['name']} for r in ds]

def _name(id):
	return system.db.runScalarPrepQuery('SELECT config_name FROM AD_HOC_TRENDS_CONFIG WHERE id = ?', [id], DB)

def load(id):
	"""Chart configuration (JSON) of a saved trend, for the page's loadFromFile()."""
	v = system.db.runScalarPrepQuery('SELECT config FROM AD_HOC_TRENDS_CONFIG WHERE id = ?', [id], DB)
	if v is not None and not isinstance(v, basestring) and hasattr(v, 'getSubString'):
		v = v.getSubString(1, int(v.length()))  # NCLOB
	return v

def store(name, config, user):
	"""New trend shared with everyone. Returns (id or None, message)."""
	name = (name or '').strip()
	if not name:
		return None, 'Enter a name first.'
	if system.db.runScalarPrepQuery('SELECT COUNT(*) FROM AD_HOC_TRENDS_CONFIG WHERE id > 0 AND UPPER(config_name) = UPPER(?)', [name], DB):
		return None, '"%s" already exists. Select it and press Update to overwrite it.' % name
	system.db.runPrepUpdate('INSERT INTO AD_HOC_TRENDS_CONFIG (config, config_name, private, username) VALUES (?, ?, 0, ?)', [config, name, user], DB)
	id = system.db.runScalarPrepQuery('SELECT MAX(id) FROM AD_HOC_TRENDS_CONFIG WHERE config_name = ?', [name], DB)
	_log.info('%s stored trend "%s"' % (user, name))
	return int(id), 'Stored "%s".' % name

def update(id, config, user):
	name = _name(id)
	if name is None:
		return 'That trend no longer exists.'
	system.db.runPrepUpdate('UPDATE AD_HOC_TRENDS_CONFIG SET config = ?, t_stamp = CURRENT_TIMESTAMP WHERE id = ?', [config, id], DB)
	_log.info('%s updated trend "%s"' % (user, name))
	return 'Updated "%s".' % name

def delete(id, user):
	name = _name(id)
	if name is None:
		return 'That trend no longer exists.'
	if name in BUILT_IN:
		return '"%s" is a built-in template and cannot be deleted (it can be updated).' % name
	system.db.runPrepUpdate('DELETE FROM AD_HOC_TRENDS_CONFIG WHERE id = ?', [id], DB)
	_log.info('%s deleted trend "%s"' % (user, name))
	return 'Deleted "%s".' % name
`;
const pyDir = STD + "/ignition/script-python/cal1615/trends";
fs.mkdirSync(pyDir, { recursive: true });
fs.writeFileSync(pyDir + "/code.py", py);
fs.writeFileSync(pyDir + "/resource.json", fs.readFileSync(STD + "/ignition/script-python/cal1615/recipes/resource.json", "utf8"));

// --- AdHocTrends view
const F = STD + "/com.inductiveautomation.perspective/views/MainViews/Feature Views/Trending/AdHocTrends/view.json";
const v = JSON.parse(fs.readFileSync(F, "utf8"));
const tr = v.propConfig["custom.databases"].binding.transforms[0];
if (!tr.code.includes("cal1615.trends.ensureStore")) tr.code = "\t# cal1615: create / enable the saved-trends table in myOracle and add the trend templates\n\tcal1615.trends.ensureStore()\n" + tr.code;
const ex = v.root.scripts.customMethods.find((m) => m.name === "getTableExistsQuery");
ex.script = ex.script.split("dba_tables").join("user_tables"); // EB has no DBA views
(function w(c) { // drop the two cal2016 Trend1Settings buttons (tag never existed)
  if (c.children) c.children = c.children.filter((k) => !(k.type === "ia.input.button" && JSON.stringify(k.events || {}).includes("Trend1Settings")));
  (c.children || []).forEach(w);
})(v.root);
const chart = v.root.children.find((c) => c.meta.name === "PowerChart");
chart.props.pens = [];
chart.props.config = { measureOfTime: "hours", unitOfTime: 1, refreshRate: 1000, visibility: { showTagBrowser: true } };
chart.props.title = { font: { color: "" }, text: "", visible: false };
fs.writeFileSync(F, JSON.stringify(v, null, 2));
console.log(`templates: ${TEMPLATES.length}, pens: ${TEMPLATES.reduce((s, t) => s + t[2].length, 0)}; script + view written; Trend1Settings refs left: ${JSON.stringify(v).split("Trend1Settings").length - 1}`);
