// Remaining cal1615 pages: oven control, recipes, zone detail, line drives, maintenance and trends.
// Called from gen.js with its helpers; returns extra session custom props.
module.exports = (g) => {
  const { TAGMAP, T, TW, TH, tagFor, penSource, E, C, en, R, led, btn, cardHeight, ROW_PARAMS,
    view, flex, label, embed, expr, prop, tagIndirect, scriptT, writeView, writeScript, dataUri, PROVIDER } = g;

  // Cards on these pages drop rows with no PLC source (e.g. Zone 3 has no burner or LFL).
  const keep = (r) => (r.kind === "buttons" ? r.buttons.some((b) => b.tag || b.page) : r.kind === "leds" ? r.leds.some((l) => l.tag) : !!r.tag);
  const card = (t, rows) => g.card(t, rows.filter(keep));

  // ------------------------------------------------------------ layout helpers
  const W = 1512, H = 920;
  const pct = (x, y, w, h) => ({ x: +(x / W).toFixed(5), y: +(y / H).toFixed(5), width: +(w / W).toFixed(5), height: +(h / H).toFixed(5) });
  const has = (id) => !!(TAGMAP[id] && TAGMAP[id].tag);
  const enumOf = (id, fallback) => (TAGMAP[id] && TAGMAP[id].enum ? colorEnum(TAGMAP[id].enum) : fallback);
  // Colour an enum from its text so any status list reads the same way.
  function colorEnum(m) {
    const out = {};
    for (const [k, v] of Object.entries(m)) {
      const t = String(v);
      const color = /fault|alarm|error|not permissive|not in auto/i.test(t) ? "#FF6060"
        : /control to|running|run$|^ok$|permissive ok|in operation/i.test(t) ? C.ok
        : /manual/i.test(t) ? C.manual : /cool/i.test(t) ? C.cool
        : /^off$|stopped|default|none|---/i.test(t) ? C.off : /idle|complete/i.test(t) ? C.idle : C.busy;
      out[k] = { text: t, color };
    }
    return out;
  }
  const cardAt = (name, cd, x, y, w) => embed(name, "Components/Common/Card", cd, pct(x, y, w, cardHeight(cd.rows)));
  const ind = (name, text, id, x, y, w, o = {}) =>
    embed(name, "Components/Common/Indicator", { text, tag: T(id), onColor: "#00E000", offColor: "#FFFF00", invert: !!(TAGMAP[id] && TAGMAP[id].invert), ...o }, pct(x, y, w, 32));
  const title = (text) => label("title", text, { style: { fontFamily: "Arial", fontSize: "26px", fontWeight: "bold", textAlign: "center" } }, pct(456, 6, 600, 40));
  const image = (file, x, y, w, h) => ({ type: "ia.display.image", meta: { name: "drawing" }, position: pct(x, y, w, h),
    props: { source: dataUri(file), fit: { mode: "fill" }, style: { classes: "cal1615/drawing" } } });
  const mcard = (name, cd, basis = "320px") => embed(name, "Components/Common/Card", cd, { grow: 1, shrink: 0, basis }, { style: { height: cardHeight(cd.rows) + "px", margin: "4px" } });
  const wrapRoot = (children) => flex("root", children, { direction: "row", wrap: "wrap", alignContent: "flex-start", alignItems: "flex-start", style: { classes: "cal1615/page", padding: "6px", overflowY: "auto" } });
  // A page of cards that wraps: several columns on a monitor, one column on a phone.
  const cardsPage = (vpath, cards, basis = "320px", head = []) =>
    writeView(vpath, view({ size: { width: 1280, height: 900 }, root: wrapRoot([...head, ...cards.map((c, i) => mcard(c.name || `card${i}`, c.cd, c.basis || basis))]) }));
  // Drawing page: coordinate layout (percent mode) on wide screens, stacked cards below 1200px.
  const drawingPage = (vpath, large, smallCards) => {
    writeView(vpath + " - Large", view({ size: { width: W, height: H },
      root: { type: "ia.container.coord", meta: { name: "root" }, props: { mode: "percent", aspectRatio: `${W}:${H}`, style: { classes: "cal1615/page" } }, children: large } }));
    writeView(vpath + " - Small", view({ size: { width: 400, height: 1600 }, root: wrapRoot(smallCards.map((c, i) => mcard(c.name || `card${i}`, c.cd))) }));
    writeView(vpath, view({ root: { type: "ia.container.breakpt", meta: { name: "root" }, props: { breakpoint: 1200 }, children: [
      embed("small", vpath + " - Small", {}),
      { ...embed("large", vpath + " - Large", {}), position: { size: "large" } },
    ] } }));
  };
  const statusBox = (name, id, x, y, w, stacked = false, labelText = "") => embed(name, "Components/Common/Rows/status",
    { ...ROW_PARAMS, kind: "status", label: labelText, tag: T(id), map: enumOf(id, {}), stacked }, pct(x, y, w, stacked ? 44 : 24));
  const lamp = (name, text, id, x, y, size = 26, on = "#00E000", off = "#FF2020") =>
    embed(name, "Components/Common/LED", { text, tag: T(id), onColor: on, offColor: off, invert: !!(TAGMAP[id] && TAGMAP[id].invert) }, pct(x, y, size, size));
  const E1 = (label2, id, units, o) => R.entry(label2, id, units, o);
  const PID = (titleText, pre) => card(titleText, [E1("Kp", `${pre}.pid_kp`, "", { format: "#,##0.000" }), E1("Ki", `${pre}.pid_ki`, "", { format: "#,##0.000" }), E1("Kd", `${pre}.pid_kd`, "", { format: "#,##0.000" })]);
  const ledRow = (text, id, o = {}) => R.leds(text, [led("", id, { invert: !!(TAGMAP[id] && TAGMAP[id].invert), ...o })]);

  // Power Chart with preset pens; `browser` shows the tag browser for ad hoc trending.
  const COLORS = ["#1F77B4", "#D62728", "#2CA02C", "#FF7F0E", "#9467BD", "#8C564B", "#E377C2", "#17BECF", "#BCBD22", "#7F7F7F"];
  const pen = (name, tagPath, i) => {
    const c = COLORS[i % COLORS.length];
    const st = (o) => ({ fill: { color: c, opacity: o }, stroke: { color: c, dashArray: 0, opacity: o, width: 1.5 } });
    return { axis: "", data: { aggregateMode: "default", source: penSource(tagPath) }, display: { breakLine: true, interpolation: "curveLinear", radius: 3,
      styles: { highlighted: st(1), muted: st(0.4), normal: st(0.9), selected: st(1) }, type: "line" }, enabled: true, name, plot: 0, selectable: true, visible: true };
  };
  const chart = (name, pens, position, browser = false, titleText = "") => ({
    type: "ia.chart.powerchart", meta: { name }, position,
    props: { title: { text: titleText }, pens: pens.filter((p) => p[1]).map(([n, t], i) => pen(n, t, i)),
      config: { measureOfTime: "hours", unitOfTime: 1, visibility: { showTagBrowser: browser } } },
  });

  // ------------------------------------------------------------ oven control (00 Main 10)
  const zones = [1, 2, 3];
  const zoneCard = (n) => card(`Zone ${n}`, [
    R.status("Exhaust", `z${n}.exh_status`, enumOf(`z${n}.exh_status`)),
    R.status("Recirc", `z${n}.recirc_status`, enumOf(`z${n}.recirc_status`)),
    R.status(n === 3 ? "Cooling" : "Heat", `z${n}.heat_status`, enumOf(`z${n}.heat_status`)),
    R.status("Status", `z${n}.status`, enumOf(`z${n}.status`, n < 3 ? E.zone12 : E.zone3)),
    R.entry("Setpoint", `zone${n}.temp_sp`, "F"),
    R.value("Temperature", `zone${n}.temp`, "F"),
    R.buttons([btn("Start Heat", `z${n}.pb_start_heat`, { styleClass: "cal1615/btn-start" }), btn("Stop Heat", `z${n}.pb_stop_heat`, { styleClass: "cal1615/btn-stop" })]),
  ]);
  cardsPage("Main/Oven Control", [
    ...zones.map((n) => ({ name: `zone${n}`, cd: zoneCard(n) })),
    { name: "oven", cd: card("Oven", [
      R.buttons([btn("Start Oven", "btn.start_oven", { styleClass: "cal1615/btn-start" }), btn("Stop Oven", "btn.stop_oven", { styleClass: "cal1615/btn-stop" })]),
      R.buttons([btn("Stop All Fans", "oven.pb_stop_all_fans", { styleClass: "cal1615/btn-stop" })]),
      R.leds("Open Oven", [led("Active", "oven.open_oven", { onColor: "#FFA000" })]),
      R.buttons([btn("Open Oven On/Off", "oven.pb_open_oven")]),
    ]) },
  ]);

  // ------------------------------------------------------------ recipes (00 Main 20 / 30)
  const rcpKey = (id) => id.replace(/^rcp\./, "").replace(/\./g, "__");
  const LINE_SETTINGS = ["line_speed_sp", "letoff_tension_sp", "cure_time_sp", "platen_temp_sp", "acc_counter_pressure_sp", "acc_fill_pressure_sp",
    "acc_tension_sp", "ts1_tension_sp", "impreg_gap_sp", "impreg_supply_speed_sp", "slitter_speed_sp", "upper_poly_tension_sp",
    "lower_poly_tension_sp", "winder_tension_sp", "adv_cooling_temp_sp"];
  const LINE_LABELS = { line_speed_sp: "Line Speed Setpoint", letoff_tension_sp: "Letoff Tension Setpoint", cure_time_sp: "Splice Platen Cure Time Setpoint",
    platen_temp_sp: "Splice Platen Temperature Setpoint", acc_counter_pressure_sp: "Accumulator Counter Pressure", acc_fill_pressure_sp: "Accumulator Fill Pressure Setpoint",
    acc_tension_sp: "Accumulator Tension Setpoint", ts1_tension_sp: "Tension Stand 1 Tension Setpoint", impreg_gap_sp: "Impreg Gap Setpoint",
    impreg_supply_speed_sp: "Impreg Supply Speed Setpoint", slitter_speed_sp: "Slitter Speed Setpoint", upper_poly_tension_sp: "Upper Poly Tension Setpoint",
    lower_poly_tension_sp: "Lower Poly Tension Setpoint", winder_tension_sp: "Winder Tension Setpoint", adv_cooling_temp_sp: "Roll Cooling Temperature Setpoint" };
  const UNITS = { fpm: "FPM", lb: "LBS", s: "Sec", degF: "F", psi: "PSI", in: "IN", rpm: "RPM", "%": "%" };
  const units = (id) => UNITS[(TAGMAP[id] || {}).units] || (TAGMAP[id] || {}).units || "";
  const fmt = (m) => (/gap/.test(m) ? "#,##0.0000" : /pressure|slitter|tension|cure|cool/.test(m) ? "#,##0.000" : "#,##0.0");
  const ZONE_SP = [["exhaust_sp", "Exhaust Fan Setpoint"], ["recirc_sp", "Recirc Fan Setpoint"], ["temp_sp", "Temperature Setpoint"]];
  // Every numeric recipe member used by the PLC is stored in the library and downloaded.
  const rcpIds = Object.keys(TAGMAP).filter((k) => k.startsWith("rcp.") && TAGMAP[k].tag && TAGMAP[k].type === "REAL" && TAGMAP[k].used !== false);

  // Active recipe: edits go straight to the running recipe (p02_recipe_from_hmi).
  cardsPage("Main/Active Recipe", [
    { name: "lineSettings", basis: "480px", cd: card("Line Settings", LINE_SETTINGS.map((m) => R.entry(LINE_LABELS[m], `rcp.${m}`, units(`rcp.${m}`), { format: fmt(m), labelWidth: "" }))) },
    ...zones.map((n) => ({ name: `zone${n}`, cd: card(`Zone ${n}`, ZONE_SP.map(([m, l]) => R.entry(`Zone ${n} ${l}`, `rcp.zone_${n}.${m}`, units(`rcp.zone_${n}.${m}`), { format: "#,##0.0" }))) })),
  ], "360px", [
    embed("banner", "Components/Common/Recipe Banner", {}, { grow: 1, shrink: 0, basis: "100%" }, { style: { height: "40px", margin: "4px" } }),
    embed("saveAs", "Components/Recipe/Save As", {}, { grow: 1, shrink: 0, basis: "100%" }, { style: { height: "48px", margin: "4px" } }),
  ]);

  // Save As bar: stores the running recipe in the library under a new name.
  writeView("Components/Recipe/Save As", view({ custom: { name: "" }, size: { width: 600, height: 48 },
    root: flex("root", [
      label("lbl", "Save running recipe as:", { style: { fontWeight: "bold" } }, { basis: "200px", shrink: 0 }),
      { type: "ia.input.text-field", meta: { name: "name" }, position: { grow: 1, basis: "200px" }, props: { placeholder: "recipe name" },
        propConfig: { "props.text": { binding: { type: "property", config: { path: "view.custom.name", bidirectional: true } } } } },
      { type: "ia.input.button", meta: { name: "save" }, position: { basis: "140px", shrink: 0 }, props: { text: "Save As...", style: { classes: "cal1615/btn" } },
        propConfig: { "props.enabled": expr('{session.custom.canOperate} && len(trim({view.custom.name})) > 0') },
        events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script:
          "\tname = self.view.custom.name.strip()\n\tcal1615.recipes.save(name, cal1615.recipes.readActive())\n\tself.view.custom.name = ''\n" } } } } },
    ], { direction: "row", alignItems: "center", style: { classes: "cal1615/card", gap: "8px", padding: "6px" } }) }));

  // Recipe editor: works on session.custom.recipeDraft, then saves to the library or downloads to the PLC.
  const draftField = (labelText, key, unitsText, format) => flex(`f_${key}`, [
    label("l", labelText, { style: { classes: "cal1615/row-label" } }, { grow: 1, basis: "0" }),
    { type: "ia.input.numeric-entry-field", meta: { name: "v" }, position: { basis: "90px", shrink: 0 }, props: { format, spinner: { enabled: false }, style: { classes: "cal1615/entry" } },
      propConfig: { "props.value": { binding: { type: "property", config: { path: `session.custom.recipeDraft.values.${key}`, bidirectional: true } } } } },
    label("u", unitsText, { style: { classes: "cal1615/units" } }, { basis: "40px", shrink: 0 }),
  ], { direction: "row", alignItems: "center", style: { paddingLeft: "6px", paddingRight: "6px" } }, { basis: "26px", shrink: 0 });
  const draftCard = (name, titleText, fields, basis) => flex(name, [
    label("title", titleText, { style: { classes: "cal1615/card-header" } }, { basis: "26px", shrink: 0 }),
    ...fields,
  ], { direction: "column", style: { classes: "cal1615/card", margin: "4px", paddingBottom: "6px", gap: "2px" } }, { grow: 1, shrink: 0, basis });
  const editorScript = (body) => ({ component: { onActionPerformed: { type: "script", scope: "G", config: { script: body } } } });
  const ebtn = (name, text, enabled, script, cls = "cal1615/btn") => ({ type: "ia.input.button", meta: { name }, position: { basis: "150px", shrink: 0 },
    props: { text, style: { classes: cls } }, propConfig: { "props.enabled": expr(enabled) }, events: editorScript(script) });
  const DRAFT_VALUES = Object.fromEntries(rcpIds.map((id) => [rcpKey(id), 0]));
  writeView("Main/Recipe Editor", view({
    custom: { names: [], newName: "" }, size: { width: 1280, height: 900 },
    propConfig: { "custom.names": { binding: { type: "tag", config: { fallbackDelay: 2.5, mode: "direct", tagPath: `[${PROVIDER}]HMI/recipes` } },
      transforms: [scriptT("\ttry:\n\t\treturn sorted(system.util.jsonDecode(value).keys()) if value else []\n\texcept:\n\t\treturn []")] } },
    root: wrapRoot([
      flex("toolbar", [
        label("lbl", "Recipe:", { style: { fontWeight: "bold", fontSize: "18px" } }, { basis: "80px", shrink: 0 }),
        { type: "ia.input.dropdown", meta: { name: "select" }, position: { grow: 1, basis: "220px" }, props: { placeholder: { text: "Select recipe" } },
          propConfig: { "props.options": expr("{view.custom.names}", [scriptT("\treturn [{'label': n, 'value': n} for n in (value or [])]")]),
            "props.value": { binding: { type: "property", config: { path: "session.custom.recipeDraft.name", bidirectional: true } } } } },
        ebtn("load", "Select Recipe", 'len({session.custom.recipeDraft.name}) > 0',
          "\td = self.session.custom.recipeDraft\n\tvals = cal1615.recipes.get(d.name)\n\tfor k in cal1615.recipes.KEYS:\n\t\td.values[k] = vals.get(k, 0)\n"),
        ebtn("fromActive", "Copy Running", "true",
          "\td = self.session.custom.recipeDraft\n\tvals = cal1615.recipes.readActive()\n\tfor k in cal1615.recipes.KEYS:\n\t\td.values[k] = vals.get(k, 0)\n"),
      ], { direction: "row", alignItems: "center", wrap: "wrap", style: { classes: "cal1615/card", gap: "8px", padding: "6px", margin: "4px" } }, { grow: 1, shrink: 0, basis: "100%" }),
      flex("actions", [
        { type: "ia.input.text-field", meta: { name: "newName" }, position: { grow: 1, basis: "200px" }, props: { placeholder: "new recipe name" },
          propConfig: { "props.text": { binding: { type: "property", config: { path: "view.custom.newName", bidirectional: true } } } } },
        ebtn("create", "Create Recipe", '{session.custom.canOperate} && len(trim({view.custom.newName})) > 0',
          "\tname = self.view.custom.newName.strip()\n\td = self.session.custom.recipeDraft\n\tcal1615.recipes.save(name, cal1615.recipes.fromDraft(d.values))\n\td.name = name\n\tself.view.custom.newName = ''\n"),
        ebtn("save", "Save Recipe", '{session.custom.canOperate} && len({session.custom.recipeDraft.name}) > 0',
          "\td = self.session.custom.recipeDraft\n\tcal1615.recipes.save(d.name, cal1615.recipes.fromDraft(d.values))\n"),
        ebtn("delete", "Delete Recipe", '{session.custom.canOperate} && len({session.custom.recipeDraft.name}) > 0',
          "\td = self.session.custom.recipeDraft\n\tcal1615.recipes.delete(d.name)\n\td.name = ''\n", "cal1615/btn-stop"),
        ebtn("download", "Download to PLC", '{session.custom.canOperate} && len({session.custom.recipeDraft.name}) > 0',
          "\td = self.session.custom.recipeDraft\n\tcal1615.recipes.download(d.name, cal1615.recipes.fromDraft(d.values))\n", "cal1615/btn-start"),
      ], { direction: "row", alignItems: "center", wrap: "wrap", style: { classes: "cal1615/card", gap: "8px", padding: "6px", margin: "4px" } }, { grow: 1, shrink: 0, basis: "100%" }),
      draftCard("lineSettings", "Line Settings", LINE_SETTINGS.filter((m) => has(`rcp.${m}`)).map((m) => draftField(LINE_LABELS[m], rcpKey(`rcp.${m}`), units(`rcp.${m}`), fmt(m))), "480px"),
      ...zones.map((n) => draftCard(`zone${n}`, `Zone ${n}`, ZONE_SP.map(([m, l]) => draftField(`Zone ${n} ${l}`, rcpKey(`rcp.zone_${n}.${m}`), units(`rcp.zone_${n}.${m}`), "#,##0.0")), "360px")),
      draftCard("other", "Other Recipe Values", rcpIds.filter((id) => !LINE_SETTINGS.includes(id.slice(4)) && !/^rcp\.zone_/.test(id))
        .map((id) => draftField(TAGMAP[id].label || id.slice(4), rcpKey(id), units(id), "#,##0.000")), "360px"),
    ]),
  }));
  // Recipe library script: recipes are kept as JSON in the memory tag HMI/recipes.
  tagFor("memory:recipes", "STRING", { value: "{}" });
  const nameWrite = TW("rcp.name");
  const fieldLines = rcpIds.map((id) => `\t'${rcpKey(id)}': ('${T(id)}', '${TW(id)}'),`).join("\n");
  writeScript("cal1615/recipes", `# Recipe library for cal1615 (generated by tools/pages.js).
# Recipes are stored as JSON in ${`[${PROVIDER}]HMI/recipes`}: {name: {key: value}}.
# The PLC copies p02_recipe_from_hmi into p01_recipe_active every scan (P02 R04),
# so "download" is simply writing every member to p02_recipe_from_hmi.
LIB = '[${PROVIDER}]HMI/recipes'
NAME_WRITE = '${nameWrite}'
# key: (read tag in p01_recipe_active, write tag in p02_recipe_from_hmi)
FIELDS = {
${fieldLines}
}
KEYS = sorted(FIELDS.keys())

def _load():
	v = system.tag.readBlocking([LIB])[0].value
	try:
		return dict(system.util.jsonDecode(v) or {}) if v else {}
	except:
		return {}

def _store(d):
	system.tag.writeBlocking([LIB], [system.util.jsonEncode(d)])

def names():
	return sorted(_load().keys())

def get(name):
	return dict(_load().get(name) or {})

def save(name, values):
	d = _load()
	d[name] = dict((k, float(values.get(k) or 0)) for k in KEYS)
	_store(d)

def delete(name):
	d = _load()
	d.pop(name, None)
	_store(d)

def fromDraft(values):
	"""Plain dict from the session draft (a Perspective property object)."""
	out = {}
	for k in KEYS:
		try:
			out[k] = float(values[k] or 0)
		except:
			out[k] = 0.0
	return out

def readActive():
	qvs = system.tag.readBlocking([FIELDS[k][0] for k in KEYS])
	return dict((k, qv.value) for k, qv in zip(KEYS, qvs))

def download(name, values):
	paths = [FIELDS[k][1] for k in KEYS]
	vals = [float(values.get(k) or 0) for k in KEYS]
	if NAME_WRITE:
		paths.append(NAME_WRITE)
		vals.append(name)
	return system.tag.writeBlocking(paths, vals)
`);

  // ------------------------------------------------------------ zone detail (10 Oven 00)
  const zoneDetail = (n) => {
    const z = `z${n}`;
    const statusCard = card(`Zone ${n}`, [
      ledRow("Lower Flash Limit High Warning", `${z}.led_lfl_high_warning`, { onColor: "#FFFF00", offColor: "#00E000" }),
      ledRow("Lower Flash Limit Alarm", `${z}.led_lfl_alarm`, { onColor: "#FF2020", offColor: "#00E000" }),
      ledRow("Zone Faults OK", `${z}.led_zone_faults_ok`, { offColor: "#FF2020" }),
      ledRow("VFDs Ready", `${z}.led_vfds_ready`, { offColor: "#FF2020" }),
      R.status(n === 3 ? "Cooling" : "Heat", `${z}.heat_status`, enumOf(`${z}.heat_status`)),
      R.buttons([btn("Start Heat", `${z}.pb_start_heat`, { styleClass: "cal1615/btn-start" }), btn("Stop Heat", `${z}.pb_stop_heat`, { styleClass: "cal1615/btn-stop" })]),
    ]);
    const chamber = card("Chamber Data", [R.value("Zone Pressure", `${z}.pressure`, '"wc', { format: "#,##0.000" }), R.value("Lower Flash Limit", `${z}.lfl`, "%")]);
    const temps = card("Temperature Data", [
      R.value("Control Temperature", `zone${n}.temp`, "F"), R.entry("Temperature Setpoint", `zone${n}.temp_sp`, "F"),
      R.value("Process Control Temp 1", `${z}.tc1`, "F"), R.value("Process Control Temp 2", `${z}.tc2`, "F"),
    ]);
    const valve = card("Control Valve", [
      R.value("Output", `${z}.cv_output`, "%"), R.entry("Manual Setpoint", `${z}.cv_manual_sp`, "%"),
      R.status("Mode", `${z}.cv_auto`, en([[1, "Auto", C.ok], [0, "Manual", C.manual]])),
      R.buttons([btn("Auto", `${z}.pb_cv_auto`), btn("Manual", `${z}.pb_cv_manual`)]),
    ]);
    const motors = card("Motor Data", [
      R.value("Exhaust Fan", `${z}.exh_rpm`, "RPM", { format: "#,##0" }), R.entry(`Zone ${n} Exhaust Fan Setpoint`, `${z}.exh_sp`, "RPM", { format: "#,##0" }),
      R.value("Recirculation Fan", `${z}.recirc_rpm`, "RPM", { format: "#,##0" }), R.entry(`Zone ${n} Recirc Fan Setpoint`, `${z}.recirc_sp`, "RPM", { format: "#,##0" }),
    ]);
    const burner = card("Burner / Fans", [
      R.status("Exhaust Fan", `${z}.exh_status`, enumOf(`${z}.exh_status`)), R.status("Recirc Fan", `${z}.recirc_status`, enumOf(`${z}.recirc_status`)),
      R.status("Status", `${z}.status`, enumOf(`${z}.status`, n < 3 ? E.zone12 : E.zone3)),
      ...(n < 3 ? [R.leds("Burner", [led("Flame", `${z}.flame_on`, { onColor: "#FF9800" }), led("Safeties", `${z}.burner_safeties_ok`, { offColor: "#FF2020" }), led("Hi Limit", `${z}.high_limit_ok`, { offColor: "#FF2020" })])] : []),
    ]);
    const tempTag = TH(`zone${n}.temp`), spTag = TH(`zone${n}.temp_sp`);
    // Drawing crop origin in the screen print was (12,192); overlays are placed at crop + (8,50).
    const dx = 8, dy = 50;
    const large = [
      title(`Zone ${n}`),
      image("zone.png", dx, dy, 902, 470),
      statusBox("exhaustStatus", `${z}.exh_status`, dx + 318, dy + 36, 128),
      statusBox("zoneStatus", `${z}.status`, dx + 226, dy + 96, 128, true, "Status"),
      statusBox("recircStatus", `${z}.recirc_status`, dx + 356, dy + 391, 128),
      ...(n < 3 ? [
        lamp("lampS", "S", `${z}.burner_safeties_ok`, dx + 34, dy + 306),
        lamp("lampL", "L", `${z}.flame_on`, dx + 34, dy + 357),
        lamp("lampH", "H", `${z}.high_limit_ok`, dx + 73, dy + 357),
        { type: "ia.display.icon", meta: { name: "flame" }, position: pct(dx + 214, dy + 332, 60, 40), props: { path: "material/whatshot", color: "#FF6D00" },
          propConfig: T(`${z}.flame_on`) ? { "position.display": { binding: { type: "tag", config: { fallbackDelay: 2.5, mode: "direct", tagPath: T(`${z}.flame_on`) } }, transforms: [{ type: "expression", expression: "toBoolean({value})" }] } } : {} },
      ] : []),
      chart("trend", [["Control Temp", tempTag], ["Control Setpoint", spTag]], pct(930, 50, 575, 470), false, `Zone ${n}`),
      cardAt("zoneCard", statusCard, 140, 530, 300),
      cardAt("chamber", chamber, 460, 530, 310),
      cardAt("temps", temps, 460, 530 + cardHeight(chamber.rows) + 10, 310),
      cardAt("valve", valve, 140, 530 + cardHeight(statusCard.rows) + 10, 300),
      cardAt("motors", motors, 790, 530, 330),
    ];
    drawingPage(`Oven/Zone ${n}`, large, [
      { name: "zone", cd: statusCard }, { name: "temps", cd: temps }, { name: "chamber", cd: chamber },
      { name: "burner", cd: burner }, { name: "valve", cd: valve }, { name: "motors", cd: motors },
    ]);
  };
  zones.forEach(zoneDetail);

  // Advanced (roll) cooling: no drawing in the screen prints, so a card page with its trend.
  const coolCards = [
    { name: "cooling", cd: card("Roll Cooling", [
      R.value("Temperature", "cooling.temp", "F"), R.entry("Temperature Setpoint", "cooling.temp_sp", "F"),
      R.value("Pressure", "cool.pressure", '"wc', { format: "#,##0.000" }),
      R.leds("Cooling", [led("Requested", "cool.heat_status")]), R.leds("Faults", [led("OK", "cool.led_zone_faults_ok", { invert: true, offColor: "#FF2020" })]),
      R.buttons([btn("Start", "cool.pb_start_heat", { styleClass: "cal1615/btn-start" }), btn("Stop", "cool.pb_stop_heat", { styleClass: "cal1615/btn-stop" })]),
    ]) },
    { name: "pump", cd: card("Pump", [R.leds("Pump", [led("Running", "cool.pump_on")]),
      R.buttons([btn("Start Pump", "cool.pb_pump_start", { styleClass: "cal1615/btn-start" }), btn("Stop Pump", "cool.pb_pump_stop", { styleClass: "cal1615/btn-stop" })])]) },
    { name: "valve", cd: card("Control Valve", [R.value("Output", "cool.cv_output", "%"), R.entry("Manual Setpoint", "cool.cv_manual_sp", "%"),
      R.status("Mode", "cool.cv_auto", en([[1, "Auto", C.ok], [0, "Manual", C.manual]])),
      R.buttons([btn("Auto", "cool.pb_cv_auto"), btn("Manual", "cool.pb_cv_manual")])]) },
  ];
  {
    const v = view({ size: { width: 1280, height: 900 }, root: wrapRoot([
      ...coolCards.map((c) => mcard(c.name, c.cd)),
      chart("trend", [["Roll Cooling Temp", TH("cooling.temp")], ["Setpoint", TH("cooling.temp_sp")]], { grow: 1, shrink: 0, basis: "100%" }, false, "Roll Cooling"),
    ]) });
    v.root.children[v.root.children.length - 1].props.style = { height: "420px", margin: "4px" };
    writeView("Oven/Advanced Cooling", v);
  }

  // ------------------------------------------------------------ line drives (20 Line 00 / 10 / 20)
  const trendCard = (name, pens, titleText) => chart(name, pens, pct(960, 60, 540, 440), false, titleText);
  {
    // Let-Off & Splice Press. Crop origin (30,400) placed at (20,80).
    const ox = 20 - 30, oy = 80 - 400;
    const letoff = card("Let-Off", [R.value("Tension", "letoff.tension", "LBS"), R.entry("Tension Setpoint", "letoff.tension_sp", "LBS"), R.status("Active Let-Off", "letoff.active_a", E.letoffAB)]);
    const footage = card("Let-Off Footage", [R.value("A", "letoff.footage_a", "FT", { format: "#,##0", labelWidth: "18px" }), R.value("B", "letoff.footage_b", "FT", { format: "#,##0", labelWidth: "18px" })]);
    const splice = card("Splice Press", [
      R.value("Temperature", "splice.temp", "F"), R.entry("Temperature Setpoint", "splice.temp_sp", "F"),
      R.value("Cure Time Remaining", "splice.cure_remaining", "Sec"), R.entry("Cure Time Setpoint", "splice.cure_time_sp", "Sec"),
      R.status("Sequencer", "splice.status", E.splice), R.buttons([btn("Reset", "splice.pb_reset")]),
    ]);
    const pid = PID("Let-Off PID", "letoff");
    drawingPage("Line/Letoff Splice", [
      title("Let-Off & Splice Press"),
      image("line_letoff.png", 20, 80, 910, 405),
      cardAt("footage", footage, 185 + ox, 415 + oy, 128),
      ind("turret", "Turret in Position Proximity Switch", "letoff.turret_in_position", 84 + ox, 517 + oy, 268),
      ind("platen", "Platen Closed Limit Switch", "splice.platen_closed", 476 + ox, 475 + oy, 240, { invert: true }),
      trendCard("trend", [["Let-Off Tension", TH("letoff.tension")], ["Tension Setpoint", TH("letoff.tension_sp")]], "Let-Off Tension"),
      cardAt("letoff", letoff, 100, 520, 270),
      cardAt("splice", splice, 400, 520, 320),
      cardAt("pid", pid, 1100, 520, 260),
    ], [{ name: "letoff", cd: letoff }, { name: "footage", cd: footage }, { name: "splice", cd: splice }, { name: "pid", cd: pid },
      { name: "status", cd: card("Status", [ledRow("Turret in Position", "letoff.turret_in_position"), R.leds("Platen Closed", [led("", "splice.platen_closed", { invert: true })])]) }]);
  }
  {
    // Accumulator & Tension Stand 1. Crop origin (20,200) placed at (20,60).
    const ox = 0, oy = 60 - 200;
    const acc = card("Entry Accumulator", [
      R.value("Position", "entry_acc.position_pct", "%"), R.value("Time Until Empty", "entry_acc.time_until_empty", "Sec", { format: "#,##0" }),
      R.entry("Tension Setpoint", "acc.tension_sp", "PSI", { format: "#,##0.00" }), R.entry("Fill Pressure Setpoint", "acc.fill_prs_sp", "PSI", { format: "#,##0.00" }),
      R.entry("Counter Pressure Setpoint", "acc.counter_prs_sp", "PSI", { format: "#,##0.00" }),
      R.status("Sequencer", "entry_acc.status", E.entryAcc), R.status("Fill Mode", "entry_acc.fill_mode_auto", E.fillMode),
      R.buttons([btn("Reset", "acc.pb_seq_reset"), btn("Toggle Mode", "entry_acc.fill_mode_toggle_pb")]),
    ]);
    const ts1 = card("Tension Stand 1", [R.value("Tension", "ts1.tension", "LBS"), R.entry("Tension Setpoint", "ts1.tension_sp", "LBS"), R.status("Mode", "ts1.mode", E.tsMode)]);
    const impreg = card("Impregnation", [
      R.value("Speed", "impreg.speed", "FPM"), R.value("Speed Setpoint", "impreg.speed_sp", "FPM"),
      R.entry("Gap Setpoint", "impreg.gap_sp", "IN", { format: "#,##0.0000" }), R.value("Gap Actual (DS)", "impreg.gap_actual", "IN", { format: "#,##0.0000" }),
      R.leds("Tank Level", [led("Low", "impreg.tank_level_low"), led("High", "impreg.tank_level_high")]),
      R.leds("Trough Level", [led("Low", "impreg.trough_level_low")]),
    ]);
    const pid = PID("Tension Stand 1 PID", "ts1");
    drawingPage("Line/Accumulator TS1", [
      title("Accumulator & Tension Stand 1"),
      image("line_accum.png", 20, 60, 930, 605),
      cardAt("acc", acc, 490 + ox, 213 + oy, 330),
      ind("fullLS", "Accumulator Full Limit Switch", "entry_acc.full_ls", 78 + ox, 313 + oy, 244),
      ind("emptyLS", "Accumulator Empty Limit Switch", "entry_acc.empty_ls", 78 + ox, 680 + oy, 244),
      ind("nipL", "Nip Open", "nip.feedroll_closed", 138 + ox, 578 + oy, 104, { invert: true, onColor: "#00E000", offColor: "#D0D0D0" }),
      ind("nipR", "Nip Open", "nip.ts1_closed", 542 + ox, 578 + oy, 104, { invert: true, onColor: "#00E000", offColor: "#D0D0D0" }),
      ind("tankUp", "Tank Up", "impreg.tank_up", 766 + ox, 728 + oy, 100),
      trendCard("trend", [["TS1 Tension", TH("ts1.tension")], ["Tension Setpoint", TH("ts1.tension_sp")]], "Tension Stand 1 Tension"),
      cardAt("ts1", ts1, 380, 680, 270),
      cardAt("impreg", impreg, 670, 680, 280),
      cardAt("pid", pid, 1100, 520, 260),
    ], [{ name: "acc", cd: acc }, { name: "ts1", cd: ts1 }, { name: "impreg", cd: impreg }, { name: "pid", cd: pid },
      { name: "status", cd: card("Status", [ledRow("Accumulator Full", "entry_acc.full_ls"), ledRow("Accumulator Empty", "entry_acc.empty_ls"),
        R.leds("Nips Open", [led("Feed Roll", "nip.feedroll_closed", { invert: true }), led("TS1", "nip.ts1_closed", { invert: true })]), ledRow("Tank Up", "impreg.tank_up")]) }]);
  }
  {
    // Tension Stand 2, Polys & Windup. Crop origin (25,370) placed at (20,60).
    const ox = 20 - 25, oy = 60 - 370;
    const upper = card("Upper Poly Unwind", [R.value("Diameter A", "upper_poly.dia_a", "IN"), R.value("Diameter B", "upper_poly.dia_b", "IN"), R.entry("Tension Setpoint", "upper_poly.tension_sp", "LBS")]);
    const slitter = card("Slitter", [R.value("Speed", "slitter.speed", "FPM", { format: "#,##0.00" }), R.entry("Speed Setpoint (% of Line)", "slitter.speed_sp", "%", { format: "#,##0.00" })]);
    const wfoot = card("Winder Footage", [R.value("A", "winder.footage_a", "FT", { format: "#,##0", labelWidth: "18px" }), R.value("B", "winder.footage_b", "FT", { format: "#,##0", labelWidth: "18px" })]);
    const cooling = card("Roll Cooling", [R.value("Temperature", "cooling.temp", "F"), R.entry("Temperature Setpoint", "cooling.temp_sp", "F")]);
    const ts2 = card("Tension Stand 2", [R.value("Speed", "ts2.speed", "FPM"), R.value("Speed Setpoint", "ts2.speed_sp", "FPM"),
      R.value("Tension", "ts2.tension", "LBS"), R.entry("Tension Setpoint", "ts2.tension_sp", "LBS"), R.status("Mode", "ts2.mode", E.tsMode)]);
    const lower = card("Lower Poly Unwind", [R.value("Diameter A", "lower_poly.dia_a", "IN"), R.value("Diameter B", "lower_poly.dia_b", "IN"), R.entry("Tension Setpoint", "lower_poly.tension_sp", "LBS")]);
    const winder = card("Winder", [R.value("Tension", "winder.tension", "LBS"), R.entry("Tension Setpoint", "winder.tension_sp", "LBS"),
      R.value("Diameter", "winder.diameter", "IN"), R.leds("Active Winder", [led("A", "winder.active_a"), led("B", "winder.active_b")])]);
    const pid = PID("Winder PID", "winder");
    drawingPage("Line/TS2 Poly Windup", [
      title("Tension Stand 2 & Polys & Windup"),
      image("line_winder.png", 20, 60, 935, 435),
      cardAt("upper", upper, 427 + ox, 375 + oy, 230),
      cardAt("slitter", slitter, 190 + ox, 447 + oy, 230),
      cardAt("wfoot", wfoot, 770 + ox, 429 + oy, 128),
      ind("turret", "Turret in Position Proximity Switch", "winder.turret_in_position", 689 + ox, 540 + oy, 268),
      cardAt("cooling", cooling, 27 + ox, 638 + oy, 243),
      trendCard("trend", [["Winder Tension", TH("winder.tension")], ["Tension Setpoint", TH("winder.tension_sp")]], "Winder Tension"),
      cardAt("ts2", ts2, 60, 520, 270),
      cardAt("lower", lower, 350, 520, 250),
      cardAt("winder", winder, 620, 520, 270),
      cardAt("pid", pid, 1100, 520, 260),
    ], [{ name: "ts2", cd: ts2 }, { name: "slitter", cd: slitter }, { name: "upper", cd: upper }, { name: "lower", cd: lower }, { name: "cooling", cd: cooling },
      { name: "winder", cd: winder }, { name: "wfoot", cd: wfoot }, { name: "pid", cd: pid }]);
  }

  // ------------------------------------------------------------ maintenance: zone setup (30 Maint 10)
  const setupCard = (pre, titleText, cooling) => card(titleText, [
    R.entry("Process Control TC1 Zero Offset", `${pre}.tc1_zero`, "F"), R.entry("Process Control TC2 Zero Offset", `${pre}.tc2_zero`, "F"),
    R.entry("Process Control TC High Limit", `${pre}.tc_high_limit`, "F"), R.entry("Control SP Deviation Warning", `${pre}.sp_dev_warning`, "F"),
    ...(cooling ? [] : [R.entry("LFL Warning Level", `${pre}.lfl_warning`, "%"), R.entry("LFL Alarm Level", `${pre}.lfl_alarm`, "%"),
      R.entry("Shutdown Temperature", `${pre}.shutdown_temp`, "F"), R.entry("Low Pressure Warning Level", `${pre}.low_prs_warning`, "WC", { format: "#,##0.000" }),
      R.entry("Fast to Soak Deviation", `${pre}.fast_to_soak`, "F")]),
    R.entry("Soak to Fast Deviation", `${pre}.soak_to_fast`, "F"),
    ...["1", "2"].flatMap((p) => [
      R.entry(`PID${p} ${p === "1" ? "(Fast)" : "(Soak)"} Gain Kp`, `${pre}.pid${p}_kp`, "", { format: "#,##0.000" }),
      R.entry(`PID${p} Integral Ki`, `${pre}.pid${p}_ki`, "", { format: "#,##0.000" }),
      R.entry(`PID${p} Derivative Kd`, `${pre}.pid${p}_kd`, "", { format: "#,##0.000" }),
      R.entry(`PID${p} Bias`, `${pre}.pid${p}_bias`, "%"),
    ]),
  ]);
  cardsPage("Maintenance/Zone Setup", [...zones.map((n) => ({ name: `zone${n}`, cd: setupCard(`z${n}`, `Zone ${n}`) })), { name: "cooling", cd: setupCard("cool", "Roll Cooling", true) }], "360px");

  // ------------------------------------------------------------ maintenance: VFD drives (maint20)
  const VFD_ROWS = [["loa", "Letoff A"], ["lob", "Letoff B"], ["lot", "Letoff Turret"], ["ts1", "Tension Stand 1"], ["impreg", "Impreg Metering Roll"],
    ["ts2", "Tension Stand 2"], ["slitter", "Slitter"], ["wa", "Winder A"], ["wb", "Winder B"], ["supply", "Impreg Supply Fan"],
    ["z1r", "Zone 1 Recirc"], ["z1e", "Zone 1 Exhaust"], ["z2r", "Zone 2 Recirc"], ["z2e", "Zone 2 Exhaust"], ["z3r", "Zone 3 Recirc"], ["z3e", "Zone 3 Exhaust"]];
  // Extra drives the mapping found (winder turret, spring roll, ...).
  const extraRows = [...new Set(Object.keys(TAGMAP).filter((k) => k.startsWith("vfd.")).map((k) => k.split(".")[1]))]
    .filter((r) => !VFD_ROWS.some(([id]) => id === r)).map((r) => [r, { spring: "Impreg Spring Roll", wt: "Winder Turret" }[r] || r]);
  const VFD_BITS = [["faulted", "Faulted", "#FF2020"], ["warning", "Warning", "#FFA000"], ["run_fwd", "Running Forward"], ["run_rev", "Running Reverse"],
    ["ready", "Ready"], ["ctrl_net", "Ctrl from Net"], ["ref_net", "Ref from Net"], ["at_ref", "At Reference"]];
  const VFD_VALS = [["speed", "Speed", "#,##0.0"], ["amps", "Amps", "#,##0.00"], ["hz", "Hz", "#,##0.0"], ["rpm", "RPM", "#,##0"]];
  const cell = (basis) => ({ basis, shrink: 0 });
  writeView("Maintenance/VFD Row", view({
    params: { name: "", odd: false, ...Object.fromEntries(VFD_VALS.map(([k]) => [k, ""])), ...Object.fromEntries(VFD_BITS.map(([k]) => [k, ""])),
      ...Object.fromEntries(VFD_BITS.map(([k]) => [k + "_inv", false])) },
    size: { width: 1400, height: 36 },
    custom: Object.fromEntries(VFD_VALS.map(([k]) => [k, null])),
    propConfig: Object.fromEntries(VFD_VALS.map(([k]) => ["custom." + k, tagIndirect(`{view.params.${k}}`)])),
    root: flex("root", [
      label("name", "", { style: { fontWeight: "bold", fontSize: "13px" } }, cell("190px"), { propConfig: { "props.text": prop("view.params.name") } }),
      ...VFD_VALS.map(([k, , f]) => label(k, "", { style: { textAlign: "right", fontSize: "13px", paddingRight: "12px" } }, cell("95px"), {
        propConfig: { "props.text": expr(`if(len({view.params.${k}}) = 0, "", if(isNull({view.custom.${k}}), "---", numberFormat({view.custom.${k}}, "${f}")))`) } })),
      ...VFD_BITS.map(([k, , on]) => ({ type: "ia.display.view", meta: { name: k }, position: cell("95px"),
        props: { path: "Components/Common/LED", params: { text: "", tag: "", onColor: on || "#00E000", offColor: "#FFFF00", invert: false }, style: { padding: "5px 28px" } },
        propConfig: { "props.params.tag": prop(`view.params.${k}`), "props.params.invert": prop(`view.params.${k}_inv`),
          "position.display": expr("true"), "props.style.visibility": expr(`if(len({view.params.${k}}) > 0, "visible", "hidden")`) } })),
    ], { direction: "row", alignItems: "center", style: { paddingLeft: "8px", borderBottomStyle: "solid", borderBottomWidth: "1px", borderBottomColor: "var(--neutral-40)" } }, {}, {
      propConfig: { "props.style.backgroundColor": expr('if({view.params.odd}, "var(--neutral-20)", "var(--neutral-10)")') } }),
  }));
  const vfdInstances = [...VFD_ROWS, ...extraRows].map(([r, n], i) => ({
    name: n, odd: i % 2 === 1, instancePosition: { basis: "36px", grow: 0, shrink: 0 },
    ...Object.fromEntries(VFD_VALS.map(([k]) => [k, T(`vfd.${r}.${k}`)])),
    ...Object.fromEntries(VFD_BITS.map(([k]) => [k, T(`vfd.${r}.${k}`)])),
    ...Object.fromEntries(VFD_BITS.map(([k]) => [k + "_inv", !!(TAGMAP[`vfd.${r}.${k}`] && TAGMAP[`vfd.${r}.${k}`].invert)])),
  }));
  writeView("Maintenance/VFD Drives", view({ size: { width: 1400, height: 900 }, root: flex("root", [
    flex("table", [
      flex("header", [
        label("h_name", "VFD", { style: { fontWeight: "bold" } }, cell("190px")),
        ...VFD_VALS.map(([k, t]) => label("h_" + k, t, { style: { fontWeight: "bold", textAlign: "right", paddingRight: "12px" } }, cell("95px"))),
        ...VFD_BITS.map(([k, t]) => label("h_" + k, t, { style: { fontWeight: "bold", textAlign: "center", fontSize: "12px", whiteSpace: "normal" } }, cell("95px"))),
      ], { direction: "row", alignItems: "center", style: { paddingLeft: "8px", backgroundColor: "var(--neutral-40)", minHeight: "44px" } }, { basis: "44px", shrink: 0 }),
      { type: "ia.display.flex-repeater", meta: { name: "rows" }, position: { grow: 1, basis: "0" },
        props: { useDefaultViewWidth: false, useDefaultViewHeight: false, path: "Maintenance/VFD Row", direction: "column", elementPosition: { grow: 0, shrink: 0, basis: "36px" }, instances: vfdInstances } },
    ], { direction: "column", style: { classes: "cal1615/card", minWidth: "1380px" } }, { grow: 1, shrink: 0, basis: "auto" }),
  ], { direction: "column", style: { classes: "cal1615/page", padding: "6px", overflow: "auto" } }) }));

  // ------------------------------------------------------------ maintenance: servo drives (maint30)
  const servoCard = (s, titleText) => card(titleText, [
    R.buttons([btn("Start", `servo.${s}.pb_start`), btn("Stop", `servo.${s}.pb_stop`, { styleClass: "cal1615/btn-stop" }), btn("Reset", `servo.${s}.pb_reset`)]),
    ...[["not_ready", "Not Ready", "#FFA000"], ["bb", "BB (Ready for Power On)"], ["ab", "AB (Control and Power Ready)"], ["af", "AF (In Operation)"],
      ["param_mode", "Parameter Mode", "#FFA000"], ["homed", "Homed"], ["at_target", "At Target Position"], ["standstill", "Stand Still"],
      ["op_mode_error", "Operation Mode Error", "#FF2020"], ["drive_error", "Drive Error", "#FF2020"], ["drive_warning", "Drive Warning", "#FFA000"]]
      .map(([k, t, on]) => ledRow(t, `servo.${s}.${k}`, { onColor: on || "#00E000", offColor: "#E0E0E0" })),
    R.value("Actual Position", `servo.${s}.actual_position`, "IN", { format: "#,##0.000" }),
    R.entry("Zero Offset", `servo.${s}.zero_offset`, "IN", { format: "#,##0.0000" }),
    R.buttons([btn("Zero", `servo.${s}.pb_zero`)]),
    R.buttons([btn("Jog Forward", `servo.${s}.pb_jog_fwd`, { hold: true, pulse: false }), btn("Jog Reverse", `servo.${s}.pb_jog_rev`, { hold: true, pulse: false })]),
  ]);
  cardsPage("Maintenance/Servo Drives", [
    { name: "os", cd: servoCard("os", "Operator Side Servo") },
    { name: "ds", cd: servoCard("ds", "Drive Side Servo") },
    { name: "shared", cd: card("Positioning", [
      R.entry("Jog Velocity", "servo.jog_velocity", "IN/SEC", { format: "#,##0.0000" }),
      R.entry("Positioning Velocity", "servo.pos_velocity", "IN/SEC", { format: "#,##0.0000" }),
      R.entry("Gap Position", "servo.gap_position", "IN", { format: "#,##0.0000" }),
      R.buttons([btn("Move to Position", "servo.pb_move_to_position", { styleClass: "cal1615/btn-start" })]),
    ]) },
  ], "400px");

  // ------------------------------------------------------------ maintenance: I/O (maint00 / maint01)
  const modules = (TAGMAP["io.modules"] && Array.isArray(TAGMAP["io.modules"].value || TAGMAP["io.modules"]) ? (TAGMAP["io.modules"].value || TAGMAP["io.modules"]) : []);
  const pointPath = (m, n) => {
    const pat = m.point_pattern || "";
    if (/\{n\}|<n>|\{i\}/.test(pat)) return pat.replace(/\{n\}|<n>|\{i\}/g, String(n));
    if (/^A/.test(m.kind)) return `${m.data_base.replace(/Ch\d+Data$/, "")}Ch${n}Data`;
    return `${m.data_base}.${n}`;
  };
  const ioCards = modules.filter((m) => m.data_base && /^(DI|DO|AI|AO|AI-TC)$/.test(m.kind)).map((m, i) => {
    const pts = Math.min(+m.points || 16, 32);
    const isBool = m.kind === "DI" || m.kind === "DO";
    const labels = m.labels || {};
    const rows = [];
    if (m.fault_tag) rows.push(R.leds("Module Fault", [led("", "", { tag: tagFor(m.fault_tag, "BOOL"), onColor: "#FF2020", offColor: "#00E000" })]));
    // One row per point, labelled with the I/O comment from the PLC program.
    for (let n = 0; n < pts; n++) {
      const text = `${n}  ${labels[n] || ""}`.trim();
      rows.push(isBool
        ? R.leds(text, [led("", "", { tag: tagFor(pointPath(m, n), "BOOL"), onColor: m.kind === "DO" ? "#FFA000" : "#00E000", offColor: "#D0D0D0" })], { labelWidth: "" })
        : { kind: "value", label: text, tag: tagFor(pointPath(m, n), m.kind === "AI-TC" ? "REAL" : "INT"), units: "", format: "#,##0.0" });
    }
    const rack = m.rack.replace(/\s*\(.*\)$/, "");
    return { name: `io${i}`, rack, cd: card(`Slot ${m.slot} · ${m.catalog || ""} · ${m.kind}`, rows) };
  });
  const racks = [...new Set(ioCards.map((c) => c.rack))];
  writeView("Maintenance/IO", view({ size: { width: 1280, height: 900 }, root: wrapRoot(racks.length ? racks.flatMap((rk, ri) => [
    label(`rack${ri}`, rk, { style: { fontSize: "20px", fontWeight: "bold", borderBottomStyle: "solid", borderBottomWidth: "2px", borderBottomColor: "var(--callToAction)" } },
      { grow: 1, shrink: 0, basis: "100%" }, {}),
    ...ioCards.filter((c) => c.rack === rk).map((c) => mcard(c.name, c.cd, "360px")),
  ]) : [label("none", "No I/O module map yet (tools/tagmap_maint.json io.modules).", { style: { classes: "cal1615/placeholder" } }, { grow: 1, basis: "100%" })]) }));

  // ------------------------------------------------------------ maintenance: PM schedule (maint40)
  tagFor("memory:pm_tasks", "STRING", { value: JSON.stringify([
    { task: "Calibrate LFL Sensors", interval: 1500, units: "Hours", reset_at: 0 },
    { task: "Lubricate all Roll Bearings", interval: 1500, units: "Hours", reset_at: 0 },
    { task: "Change Let-Off Gearbox Oil", interval: 2000, units: "Hours", reset_at: 0 },
  ]) });
  const runTimeTag = T("pm.run_time") || T("line.run_time_hrs");
  writeScript("cal1615/pm", `# Preventive maintenance schedule (generated by tools/pages.js).
# Tasks are JSON in [${PROVIDER}]HMI/pm_tasks: [{task, interval, units, reset_at}].
# Remaining = interval - (run hours now - run hours at last reset). Warning when under 10% left.
LIB = '[${PROVIDER}]HMI/pm_tasks'
RUN_TIME = '${runTimeTag}'

def runTime():
	v = system.tag.readBlocking([RUN_TIME])[0].value
	return float(v or 0)

def _load():
	v = system.tag.readBlocking([LIB])[0].value
	try:
		return list(system.util.jsonDecode(v) or []) if v else []
	except:
		return []

def _store(tasks):
	system.tag.writeBlocking([LIB], [system.util.jsonEncode(tasks)])

def rows():
	now = runTime()
	out = []
	for t in _load():
		interval = float(t.get('interval') or 0)
		remaining = interval - (now - float(t.get('reset_at') or 0))
		color = '#FF6060' if remaining <= 0 else ('#FFFF80' if remaining < 0.1 * interval else '#00E000')
		out.append({'Task': t.get('task'), 'Remaining': {'value': int(round(remaining)), 'style': {'backgroundColor': color}},
			'Interval': int(interval), 'Units': t.get('units', 'Hours')})
	return out

def add(task, interval, units='Hours'):
	tasks = _load()
	tasks.append({'task': task, 'interval': float(interval), 'units': units, 'reset_at': runTime()})
	_store(tasks)

def update(index, task, interval, units='Hours'):
	tasks = _load()
	if 0 <= index < len(tasks):
		tasks[index].update({'task': task, 'interval': float(interval), 'units': units})
		_store(tasks)

def delete(index):
	tasks = _load()
	if 0 <= index < len(tasks):
		tasks.pop(index)
		_store(tasks)

def reset(index):
	tasks = _load()
	if 0 <= index < len(tasks):
		tasks[index]['reset_at'] = runTime()
		_store(tasks)
`);
  const pmBtn = (name, text, enabled, script, cls = "cal1615/btn") => ({ type: "ia.input.button", meta: { name }, position: { basis: "44px", shrink: 0 },
    props: { text, style: { classes: cls } }, propConfig: { "props.enabled": expr(enabled) }, events: editorScript(script) });
  const sel = "self.view.custom.selected";
  writeView("Maintenance/PM Schedule", view({
    custom: { selected: -1, task: "", interval: 0, rev: 0 }, size: { width: 1280, height: 900 },
    root: wrapRoot([
      flex("schedule", [
        label("title", "Preventive Maintenance Schedule", { style: { fontSize: "22px", fontWeight: "bold", textAlign: "center" } }, { basis: "40px", shrink: 0 }),
        label("runTime", "", { style: { textAlign: "center" } }, { basis: "24px", shrink: 0 }, runTimeTag ? {
          custom: { hours: null },
          propConfig: { "custom.hours": { binding: { type: "tag", config: { fallbackDelay: 2.5, mode: "direct", tagPath: runTimeTag } } },
            "props.text": expr('"Run Time: " + if(isNull({this.custom.hours}), "---", numberFormat({this.custom.hours}, "#,##0")) + " hours"') } } : {}),
        { type: "ia.display.table", meta: { name: "table" }, position: { grow: 1, basis: "300px" },
          props: { selection: { mode: "single" }, columns: [
            { field: "Task", header: { title: "Task" }, width: 360 }, { field: "Remaining", header: { title: "Remaining" }, width: 120, justify: "right" },
            { field: "Interval", header: { title: "Interval" }, width: 120, justify: "right" }, { field: "Units", header: { title: "Units" }, width: 100 }] },
          propConfig: {
            "props.data": expr("toMillis(now(10000)) + {view.custom.rev}", [scriptT("\treturn cal1615.pm.rows()")]),
            "props.selection.selectedRow": { binding: { type: "property", config: { path: "view.custom.selected", bidirectional: true } } },
          },
          events: { component: { onRowClick: { type: "script", scope: "G", config: { script:
            "\tself.view.custom.selected = event.rowIndex\n\tself.view.custom.task = event.value['Task']\n\tself.view.custom.interval = event.value['Interval']\n" } } } } },
      ], { direction: "column", style: { classes: "cal1615/card", padding: "8px", margin: "4px", gap: "4px" } }, { grow: 3, shrink: 0, basis: "600px" }, {}),
      flex("task", [
        label("title", "Maintenance Task", { style: { fontSize: "18px", fontWeight: "bold", textAlign: "center" } }, { basis: "36px", shrink: 0 }),
        { type: "ia.input.text-field", meta: { name: "taskName" }, position: { basis: "34px", shrink: 0 }, props: { placeholder: "task" },
          propConfig: { "props.text": { binding: { type: "property", config: { path: "view.custom.task", bidirectional: true } } } } },
        flex("intervalRow", [
          label("l", "Interval (hours)", {}, { grow: 1, basis: "0" }),
          { type: "ia.input.numeric-entry-field", meta: { name: "interval" }, position: { basis: "110px", shrink: 0 }, props: { format: "#,##0", style: { classes: "cal1615/entry" } },
            propConfig: { "props.value": { binding: { type: "property", config: { path: "view.custom.interval", bidirectional: true } } } } },
        ], { direction: "row", alignItems: "center" }, { basis: "34px", shrink: 0 }),
        pmBtn("create", "Create", '{session.custom.canOperate} && len(trim({view.custom.task})) > 0 && {view.custom.interval} > 0',
          `\tcal1615.pm.add(self.view.custom.task.strip(), self.view.custom.interval)\n\tself.view.custom.rev += 1\n`),
        pmBtn("modify", "Modify", '{session.custom.canOperate} && {view.custom.selected} >= 0',
          `\tcal1615.pm.update(${sel}, self.view.custom.task.strip(), self.view.custom.interval)\n\tself.view.custom.rev += 1\n`),
        pmBtn("delete", "Delete", '{session.custom.canOperate} && {view.custom.selected} >= 0',
          `\tcal1615.pm.delete(${sel})\n\t${sel} = -1\n\tself.view.custom.rev += 1\n`, "cal1615/btn-stop"),
        pmBtn("reset", "Reset", '{session.custom.canOperate} && {view.custom.selected} >= 0',
          `\tcal1615.pm.reset(${sel})\n\tself.view.custom.rev += 1\n`, "cal1615/btn-start"),
      ], { direction: "column", style: { classes: "cal1615/card", padding: "10px", margin: "4px", gap: "8px" } }, { grow: 1, shrink: 0, basis: "260px" }, {}),
    ]),
  }));

  // ------------------------------------------------------------ trends (otrend00 / trend00)
  const ovenPens = [
    ...zones.flatMap((n) => [[`Zone ${n} Temp`, TH(`zone${n}.temp`)], [`Zone ${n} SP`, TH(`zone${n}.temp_sp`)]]),
    ["Roll Cooling Temp", TH("cooling.temp")], ["Splice Platen Temp", TH("splice.temp")],
  ];
  const trendView = (vpath, pens, browser, titleText) => {
    const v = view({ size: { width: 1280, height: 900 }, root: flex("root", [chart("chart", pens, { grow: 1, basis: "400px" }, browser, titleText)],
      { direction: "column", style: { classes: "cal1615/page", padding: "6px" } }) });
    writeView(vpath, v);
  };
  trendView("Trends/Oven Trend", ovenPens, true, "Oven Trends");
  // Ad hoc trend: pick any tag from the tag browser; line tensions and speeds are historized for it.
  trendView("Trends/Trend", [["Line Speed", TH("line.speed")], ["Let-Off Tension", TH("letoff.tension")], ["TS1 Tension", TH("ts1.tension")],
    ["TS2 Speed", TH("ts2.speed")], ["Winder Tension", TH("winder.tension")]], true, "Trend");

  // Draft recipe lives in the session so the editor's fields bind to it directly.
  return { recipeDraft: { name: "", values: DRAFT_VALUES } };
};
