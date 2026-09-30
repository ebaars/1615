// Remaining cal1615 pages for the cal2016-template project (standard Perspective components).
// Called once from build_std.js; returns the page-config entries.
module.exports = (h) => {
  const { carouselArrows, OVEN_SEQUENCE, LINE_SEQUENCE, fs, path, OUT, V, TAGMAP, T, TW, tagOf, Z, write, resource, writeView, view, flex, label, expr, tagBind, fmt, mapT, pyPath,
    canOperate, row, valueRow, entryRow, statusRow, lamp, lampRow, button, buttonRow, card, cardView, embed, zoneCustom, IMG, ZONE_STATUS, FAN_STATUS, HEAT_STATUS } = h;
  const PAGE_W = 1920 - 240, PAGE_H = 1080 - 56; // screen minus header and pinned menu
  const FV = "MainViews/Feature Views";
  const inv = (id) => !!(TAGMAP[id] && TAGMAP[id].invert);
  const r = Math.round;
  const layout = (DW, DH) => {
    const s = Math.min(PAGE_W / DW, PAGE_H / DH), ox = (PAGE_W - DW * s) / 2;
    return { s, pos: (x, y, w, hh, scaleH = false) => ({ x: r(ox + x * s), y: r(y * s), width: r(w * s), height: r(scaleH ? hh * s : hh) }) };
  };

  // ---------------------------------------------------------------- status lists
  const C = { off: "#D0D0D0", idle: "#FFFFFF", busy: "#FFFF80", ok: "#00E000", stop: "#FFB060", manual: "#FFA040", cool: "#9FD8FF", bad: "#FF6060" };
  const E = {
    line: [[1, "Idle", C.idle], [2, "Initiate Start", C.busy], [3, "Pre-Run Warning", C.busy], [4, "Ramp to Slow", C.busy], [5, "Accel (Stretch)", C.busy], [6, "To Tension", C.busy], [7, "Run", C.ok], [8, "Normal Stop", C.stop], [9, "Cycle Complete", C.idle]],
    zone3: [[1, "Off", C.off], [2, "Idle", C.idle], [3, "Start Recirc", C.busy], [4, "Start Exhaust", C.busy], [5, "Control to SP", C.ok], [6, "Complete", C.idle], [31, "Manual", C.manual]],
    entryAcc: [[1, "Control to Low", C.idle], [2, "Fill Request", C.busy], [3, "Ramp Tension Prs", C.busy], [4, "Fill to Full", C.busy], [5, "Control to Top", C.ok], [6, "Payout Request", C.busy], [7, "Payout to Empty", C.busy], [8, "Lower Limit", C.stop], [9, "Complete", C.idle], [10, "Position Fill", C.busy]],
    splice: [[1, "Idle", C.idle], [2, "Enable Sequence", C.busy], [3, "Close Exit Clamp", C.busy], [4, "Close Inlet Clamp", C.busy], [5, "Closing Platen", C.busy], [6, "Cure in Progress", C.ok], [7, "Cure Done", C.busy], [8, "Platen Open", C.busy], [9, "Inlet Clamp Open", C.busy], [10, "Exit Clamp Open", C.busy], [11, "Complete", C.idle]],
    tsMode: [[0, "---", C.off], [1, "Jog", C.busy], [2, "Run", C.ok], [3, "Thread", C.busy]],
    wac: [[1, "Idle", C.idle], [2, "Filling", C.busy], [3, "Paying Out", C.busy], [4, "Alarm", C.bad], [5, "Warning", C.stop], [6, "Full", C.busy], [7, "Empty", C.stop]],
    fillMode: [[true, "Auto", C.ok], [false, "Manual", C.manual]],
    letoffAB: [[true, "A", C.idle], [false, "B", C.idle]],
    autoMan: [[true, "Auto", C.ok], [false, "Manual", C.manual]],
  };

  // ---------------------------------------------------------------- row builders by tag-map id
  // Stacked row: title above a centred value (used by the narrow cards on the overview).
  const stacked = (name, title, valueComp, units, p) => flex(name, [
    label("title", title, { style: { classes: "cal1615/row-label", textAlign: "center" } }, { basis: "20px", shrink: 0 }),
    flex("value", [{ ...valueComp, position: { ...valueComp.position, basis: "66px", grow: 0, shrink: 0 } },
        label("units", units || "", { style: { classes: "cal1615/units", minWidth: "0" } }, { basis: "26px", shrink: 0 })],
      { direction: "row", justify: "center", alignItems: "stretch", style: { gap: "3px", overflow: "hidden" } }, { basis: "22px", shrink: 0 }),
  ], { direction: "column", style: { padding: "2px 6px" } }, { basis: "48px", shrink: 0 });
  const valueBox = (p, format) => label("value", "---", { style: { classes: "cal1615/value" } }, { basis: "100px", shrink: 0 }, p ? { propConfig: { "props.text": tagBind(p, { transforms: [fmt(format)] }) } } : {});
  const statusBox = (p, states) => label("status", "---", { style: { classes: "cal1615/status" } }, { grow: 1, basis: "90px" }, p ? { propConfig: {
    "props.text": tagBind(p, { transforms: [mapT("scalar", states.map(([v, t]) => [v, t]), "---")] }),
    "props.style.backgroundColor": tagBind(p, { transforms: [mapT("color", states.map(([v, , c]) => [v, c]), "#FFFFFF")] }) } } : {});
  const V_ = (t, id, u = "", f = "#,##0.0", st = false) => st ? stacked(n(), t, valueBox(T(id), f), u) : valueRow(n(), t, T(id), u, f);
  const E_ = (t, id, u = "", f = "#,##0.0", st = false) => {
    if (!st) return entryRow(n(), t, T(id), TW(id), u, f);
    const er = entryRow("x", t, T(id), TW(id), u, f);
    return stacked(n(), t, er.children[1], u);
  };
  const S_ = (t, id, states, st = false) => st ? stacked(n(), t, { ...statusBox(T(id), states), position: { basis: "66px", shrink: 0 } }, null) : statusRow(n(), t, T(id), states);
  // Several lamps with captions on one row (e.g. Tank Level Low / High).
  const L_ = (t, leds, st = false) => {
    const lamps = flex("lamps", leds.map(([text, id, on = "#00E000", off = "#D0D0D0", invert]) =>
      lamp(`lamp_${text.replace(/\W/g, "")}`, T(id), on, off, invert ?? inv(id), { grow: 1, basis: "0" }, text)), { direction: "row", style: { gap: "4px" } }, { basis: st ? "66px" : "100px", shrink: 0 });
    return st ? stacked(n(), t, lamps, null) : row(n(), t, lamps, "");
  };
  const compact = (r) => { const [title, box, units] = r.children; box.position = { basis: "72px", shrink: 0 }; units.position = { basis: "26px", shrink: 0 }; return r; };
  const LR = (t, id, on = "#00E000", off = "#D0D0D0") => lampRow(n(), t, T(id), on, off, inv(id));
  const B_ = (btns) => buttonRow(n(), btns.map(([text, id, cls, hold]) => hold ? holdButton(`btn_${text.replace(/\W/g, "")}`, text, T(id)) : button(`btn_${text.replace(/\W/g, "")}`, text, T(id), cls)));
  const holdButton = (name, text, p) => ({ type: "ia.input.button", meta: { name }, position: { grow: 1, basis: "0" }, props: { text, style: { classes: "cal1615/btn" } },
    propConfig: { "props.enabled": expr(canOperate) },
    events: { dom: {
      onMouseDown: { type: "script", scope: "G", config: { script: `\tsystem.tag.writeBlocking([${pyPath(p)}], [True])` } },
      onMouseUp: { type: "script", scope: "G", config: { script: `\tsystem.tag.writeBlocking([${pyPath(p)}], [False])` } },
      onMouseLeave: { type: "script", scope: "G", config: { script: `\tsystem.tag.writeBlocking([${pyPath(p)}], [False])` } } } } });
  let nameSeq = 0;
  const n = () => `row${nameSeq++}`;
  // Card component view; returns {path, h}.
  const C_ = (vpath, title, rows, width = 300) => { nameSeq = 0; const hh = cardView(vpath, title, rows, width); return { path: vpath, h: hh }; };
  const embedAt = (name, c, pos) => embed(name, c.path, {}, pos);
  const flexCard = (name, c, basis = "320px") => embed(name, c.path, {}, { basis, grow: 1, shrink: 0 }, { style: { height: c.h + "px", margin: "4px" } });
  const cardsPage = (vpath, children, extraProps = {}) => writeView(vpath, view({ size: { width: PAGE_W, height: PAGE_H }, ...extraProps,
    root: flex("root", children, { direction: "row", wrap: "wrap", alignContent: "flex-start", alignItems: "flex-start", style: { padding: "6px", overflowY: "auto" } }) }));
  const pageTitle = (text, pos) => label("title", text, { style: { classes: "cal1615/page-title" } }, pos);
  const image = (file, pos) => ({ type: "ia.display.image", meta: { name: "drawing" }, position: pos, props: { source: `${IMG}/${file}`, fit: { mode: "fill" }, style: { classes: "cal1615/drawing" } } });
  // Desktop / mobile / breakpoint views, cal2016 "- Large / - Small / - Main" style.
  const largeSmallMain = (base, largeChildren, smallChildren) => {
    writeView(`${base} - Large`, view({ size: { width: PAGE_W, height: PAGE_H }, root: { type: "ia.container.coord", meta: { name: "root" }, props: { mode: "fixed" }, children: largeChildren } }));
    writeView(`${base} - Small`, view({ size: { width: 400, height: 1400 }, root: flex("root", smallChildren, { direction: "column", style: { gap: "8px", padding: "6px", overflowY: "auto" } }) }));
    writeView(`${base} - Main`, view({ root: { type: "ia.container.breakpt", meta: { name: "root" }, props: { breakpoint: 1200 }, children: [
      embed("small", `${base} - Small`, {}, {}),
      embed("large", `${base} - Large`, {}, { size: "large" }, { useDefaultViewWidth: true, useDefaultViewHeight: true }) ] } }));
    return `${base} - Main`;
  };
  const sCard = (name, c) => embed(name, c.path, {}, { basis: c.h + "px", shrink: 0 });
  // Indicator template (label + lamp) with a tag path parameter, used on the drawings.
  writeView("Components/Common/Indicator", view({
    params: { text: "", tagPath: "", onColor: "#00E000", offColor: "#FFFF00", invert: false }, size: { width: 130, height: 32 },
    root: flex("root", [
      label("text", "", { style: { fontFamily: "Arial", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", lineHeight: "22px" } }, { grow: 1, basis: "0" },
        { propConfig: { "props.text": { binding: { type: "property", config: { path: "view.params.text" } } } } }),
      label("lamp", "", { style: { borderRadius: "4px", borderStyle: "solid", borderWidth: "1px", borderColor: "#555555", width: "18px", height: "18px", minWidth: "18px", boxSizing: "border-box" } }, { basis: "18px", shrink: 0 }, { propConfig: {
        "props.style.backgroundColor": { binding: { type: "tag", config: { fallbackDelay: 2.5, mode: "indirect", references: { "0": "{view.params.tagPath}" }, tagPath: "{0}" },
          transforms: [{ type: "expression", expression: 'if(isNull({value}), "#FF00FF", if(toBoolean({value}) != {view.params.invert}, {view.params.onColor}, {view.params.offColor}))' }] } } } }),
    ], { direction: "row", alignItems: "center", style: { backgroundColor: "var(--neutral-10)", borderStyle: "solid", borderWidth: "1px", borderColor: "var(--neutral-60)", borderRadius: "3px", padding: "4px 6px", gap: "6px" } }),
  }));
  const ind = (name, text, id, pos, o = {}) => embed(name, "Components/Common/Indicator", { text, tagPath: T(id), onColor: "#00E000", offColor: "#FFFF00", invert: inv(id), ...o }, pos);
  // Power Chart with fixed pens.
  const penSrc = (tagPath) => `histprov:mySQL:/drv:ignition-4d950438c38c:cal1615:/tag:${tagPath.replace(/^\[[^\]]+\]/, "").toLowerCase()}`;
  const COLORS = ["#1F77B4", "#D62728", "#2CA02C", "#FF7F0E", "#9467BD", "#8C564B", "#17BECF", "#BCBD22"];
  const chart = (name, pens, pos, browser = false) => ({ type: "ia.chart.powerchart", meta: { name }, position: pos,
    props: { config: { measureOfTime: "hours", unitOfTime: 1, visibility: { showTagBrowser: browser } }, pens: pens.filter(([, id]) => T(id)).map(([nm, id], i) => {
      const c = COLORS[i % COLORS.length], st = (o) => ({ fill: { color: c, opacity: o }, stroke: { color: c, dashArray: 0, opacity: o, width: 1.5 } });
      return { axis: "", name: nm, plot: 0, enabled: true, selectable: true, visible: true, data: { aggregateMode: "default", source: penSrc(T(id)) },
        display: { type: "line", breakLine: true, interpolation: "curveLinear", radius: 3, styles: { normal: st(0.9), highlighted: st(1), muted: st(0.4), selected: st(1) } } }; }) } });
  const pages = {};

  // ---------------------------------------------------------------- Main: overview (RSView Main screen, design 1512x940)
  {
    const M = "Components/Main";
    const c = {
      entryAcc: C_(`${M}/Entry Accumulator`, "Entry Accumulator", [V_("Position", "entry_acc.position_pct", "%"), V_("Time Until Empty", "entry_acc.time_until_empty", "Sec", "#,##0"),
        S_("Fill Mode", "entry_acc.fill_mode_auto", E.fillMode), S_("Sequencer", "entry_acc.status", E.entryAcc), B_([["Toggle Mode", "entry_acc.fill_mode_toggle_pb"]])], 226),
      winderAcc: C_(`${M}/Winder Accumulator`, "Winder Accumulator", [V_("Position", "wac.position_pct", "%"), V_("Stored", "wac.stored_ft", "FT", "#,##0"), S_("Status", "wac.status", E.wac)], 214),
      letoffFootage: C_(`${M}/Let-Off Footage`, "Let-Off Footage", [compact(V_("A", "letoff.footage_a", "FT", "#,##0")), compact(V_("B", "letoff.footage_b", "FT", "#,##0"))], 150),
      winderFootage: C_(`${M}/Winder Footage`, "Winder Footage", [compact(V_("A", "winder.footage_a", "FT", "#,##0")), compact(V_("B", "winder.footage_b", "FT", "#,##0"))], 140),
      slitter: C_(`${M}/Slitter`, "Slitter", [V_("Speed", "slitter.speed", "FPM", "#,##0.00", true), E_("Speed SP", "slitter.speed_sp", "%", "#,##0.00", true)], 106),
      upperPoly: C_(`${M}/Upper Poly`, "Upper Poly", [V_("Diameter A", "upper_poly.dia_a", "IN", "#,##0.0", true), V_("Diameter B", "upper_poly.dia_b", "IN", "#,##0.0", true)], 106),
      lowerPoly: C_(`${M}/Lower Poly`, "Lower Poly", [V_("Diameter A", "lower_poly.dia_a", "IN", "#,##0.0", true), V_("Diameter B", "lower_poly.dia_b", "IN", "#,##0.0", true)], 110),
      letoff: C_(`${M}/Let-Off`, "Let-Off", [V_("Tension", "letoff.tension", "LBS", "#,##0.0", true), E_("Tension SP", "letoff.tension_sp", "LBS", "#,##0.0", true), S_("Active Let-Off", "letoff.active_a", E.letoffAB, true)], 125),
      splice: C_(`${M}/Splice Press`, "Splice Press", [V_("Temperature", "splice.temp", "F"), E_("Temperature SP", "splice.temp_sp", "F"), V_("Cure Time Remaining", "splice.cure_remaining", "Sec"),
        E_("Cure Time SP", "splice.cure_time_sp", "Sec"), S_("Sequencer", "splice.status", E.splice)], 245),
      ts1: C_(`${M}/Tension Stand 1`, "Tension Stand 1", [V_("Tension", "ts1.tension", "LBS", "#,##0.0", true), E_("Tension SP", "ts1.tension_sp", "LBS", "#,##0.0", true), S_("Mode", "ts1.mode", E.tsMode, true)], 125),
      impreg: C_(`${M}/Impregnation`, "Impregnation", [V_("Speed", "impreg.speed", "FPM", "#,##0.0", true), V_("Speed SP", "impreg.speed_sp", "FPM", "#,##0.0", true),
        L_("Tank Level", [["Low", "impreg.tank_level_low"], ["High", "impreg.tank_level_high"]], true), L_("Trough Level", [["Low", "impreg.trough_level_low"]], true)], 125),
      cooling: C_(`${M}/Cooling Rolls`, "Cooling Rolls", [V_("Temperature", "cooling.temp", "F", "#,##0.0", true), E_("Temperature SP", "cooling.temp_sp", "F", "#,##0.0", true)], 118),
      ts2: C_(`${M}/Tension Stand 2`, "Tension Stand 2", [V_("Speed", "ts2.speed", "FPM", "#,##0.0", true), V_("Speed SP", "ts2.speed_sp", "FPM", "#,##0.0", true), S_("Mode", "ts2.mode", E.tsMode, true)], 118),
      winder: C_(`${M}/Winder`, "Winder", [V_("Tension", "winder.tension", "LBS", "#,##0.0", true), E_("Tension SP", "winder.tension_sp", "LBS", "#,##0.0", true),
        L_("Active Winder", [["A", "winder.active_a"], ["B", "winder.active_b"]], true)], 119),
      ovenControl: C_(`${M}/Oven Control`, "Oven Control", [B_([["Start Oven", "btn.start_oven", "cal1615/btn-start"], ["Stop Oven", "btn.stop_oven", "cal1615/btn-stop"]]),
        S_("Zone 1 Status", "zone1.status", ZONE_STATUS), S_("Zone 2 Status", "zone2.status", ZONE_STATUS), S_("Zone 3 Status", "zone3.status", E.zone3)], 300),
      lineControl: C_(`${M}/Line Control`, "Line Control", [B_([["Start Line", "btn.start_line", "cal1615/btn-start"], ["Stop Line", "btn.stop_line", "cal1615/btn-stop"]]),
        S_("Line Status", "line.status", E.line), V_("Run Time", "line.run_time_hrs", "HRS", "#,##0")], 260),
      lineSpeed: C_(`${M}/Line Speed`, "Line Speed", [V_("Line Speed", "line.speed", "FPM", "#,##0.00"), E_("Setpoint", "line.speed_sp", "FPM", "#,##0.00"), E_("Jog Speed", "line.jog_speed", "FPM", "#,##0.00")], 260),
    };
    // Production: shop order is an Ignition memory tag (the PLC has none).
    {
      nameSeq = 0;
      const shop = flex("shopOrder", [
        label("title", "Shop Order Number", { style: { classes: "cal1615/row-label", textAlign: "center" } }, { basis: "20px", shrink: 0 }),
        { type: "ia.input.text-field", meta: { name: "value" }, position: { basis: "22px", shrink: 0 }, props: { style: { classes: "cal1615/entry", textAlign: "center" } },
          propConfig: { "props.text": tagBind(`[cal1615]HMI/shop_order`, { bidirectional: true }), "props.enabled": expr(canOperate) } },
      ], { direction: "column", style: { padding: "2px 6px" } }, { basis: "48px", shrink: 0 });
      const navBtn = (text, page) => ({ type: "ia.input.button", meta: { name: text }, position: { grow: 1, basis: "0" }, props: { text, style: { classes: "cal1615/btn" } },
        events: { component: { onActionPerformed: { type: "nav", scope: "C", config: { page } } } } });
      c.production = { path: `${M}/Production`, h: cardView(`${M}/Production`, "Production", [buttonRow("buttons", [navBtn("Recipe", "/recipe"), navBtn("Trend", "/trend")]), shop], 250) };
    }
    // Zone table over the oven drawing: rows x zones, standard labels and entry fields.
    {
      const cell = (id, f, entry) => entry
        ? flex("c", [{ type: "ia.input.numeric-entry-field", meta: { name: "entry" }, position: { grow: 1, basis: "0" }, props: { format: f, spinner: { enabled: false }, style: { classes: "cal1615/entry" } },
            propConfig: { "props.value": tagBind(T(id)), "props.enabled": expr(canOperate) },
            events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script: `\tsystem.tag.writeBlocking(['${TW(id)}'], [self.props.value])` } } } } }], { direction: "row", alignItems: "stretch" }, { grow: 1, basis: "0" })
        : flex("c", [{ ...valueBox(T(id), f), position: { grow: 1, basis: "0" } }], { direction: "row", alignItems: "stretch" }, { grow: 1, basis: "0" });
      const zRow = (name, title, key, units, f, entry) => flex(name, [label("title", title, { style: { classes: "cal1615/row-label" } }, { basis: "70px", shrink: 0 }),
        ...[1, 2, 3].map((z) => flex(`zone${z}`, [cell(`zone${z}.${key}`, f, entry), label("units", units, { style: { classes: "cal1615/units" } }, { basis: "24px", shrink: 0 })], { direction: "row", alignItems: "stretch", style: { gap: "3px" } }, { grow: 1, basis: "0" }))],
        { direction: "row", alignItems: "stretch", style: { padding: "3px 6px", gap: "4px" } }, { basis: "28px", shrink: 0 });
      writeView(`${M}/Zone Table`, view({ size: { width: 366, height: 152 }, root: flex("root", [
        flex("header", [label("h0", "", {}, { basis: "70px", shrink: 0 }), ...[1, 2, 3].map((z) => label(`zone${z}`, `Zone ${z}`, { style: { classes: "cal1615/card-header" } }, { grow: 1, basis: "0" }))],
          { direction: "row", style: { backgroundColor: "var(--callToAction)" } }, { basis: "26px", shrink: 0 }),
        zRow("temp", "Temp.", "temp", "F", "#,##0.0", false), zRow("tempSp", "Temp.SP", "temp_sp", "F", "#,##0.0", true),
        zRow("lfl", "LFL Level", "lfl", "%", "#,##0.0", false), zRow("pressure", "Pressure", "pressure", '"wc', "#,##0.000", false),
      ], { direction: "column", style: { classes: "cal1615/card" } }) }));
    }
    // Safety pins and recipe banner.
    writeView(`${M}/Safety Pins`, view({ size: { width: 212, height: 60 }, root: flex("root", [
      label("title", "Safety Pins", { style: { fontWeight: "bold", textAlign: "center", fontSize: "13px" } }, { basis: "20px", shrink: 0 }),
      flex("pins", [1, 2, 3, 4, 5, 6, 7, 8].map((p) => lamp(`pin${p}`, T(`pins.pin_${p}`), "#00E000", "#FF2020", false, { grow: 1, basis: "0" }, String(p))), { direction: "row", style: { gap: "3px" } }, { grow: 1, basis: "0" }),
    ], { direction: "column", style: { backgroundColor: "var(--neutral-10)", borderStyle: "solid", borderWidth: "1px", borderColor: "var(--neutral-60)", borderRadius: "3px", padding: "2px 4px" } }) }));
    writeView(`${M}/Recipe Banner`, view({ size: { width: 677, height: 34 }, root: flex("root", [
      label("lbl", "Active Recipe:", { style: { fontSize: "20px", fontWeight: "bold" } }, { basis: "170px", shrink: 0 }),
      label("name", "---", { style: { fontSize: "20px", fontWeight: "bold" } }, { grow: 1, basis: "0" }, { propConfig: { "props.text": tagBind(T("line.recipe_name")) } }),
    ], { direction: "row", alignItems: "center", style: { classes: "cal1615/card", paddingLeft: "10px" } }) }));
    const L = layout(1512, 940), p = L.pos;
    const main = largeSmallMain(`${FV}/Home/Overview`, [
      image("line_overview.png", p(0, 70, 1510, 452, true)),
      embed("recipeBanner", `${M}/Recipe Banner`, {}, p(455, 12, 677, 34)),
      embedAt("entryAccumulator", c.entryAcc, p(205, 70, 226, c.entryAcc.h)), embedAt("winderAccumulator", c.winderAcc, p(1172, 70, 214, c.winderAcc.h)),
      ind("accFullLS", "Full LS", "entry_acc.full_ls", p(458, 152, 92, 32)), ind("accEmptyLS", "Empty LS", "entry_acc.empty_ls", p(458, 425, 92, 32)),
      embedAt("letoffFootage", c.letoffFootage, p(20, 255, 150, c.letoffFootage.h)),
      ind("feedRollNip", "Nip Open", "nip.feedroll_closed", p(347, 313, 86, 32), { invert: true, offColor: "#D0D0D0" }),
      ind("ts1Nip", "Nip Open", "nip.ts1_closed", p(552, 313, 88, 32), { invert: true, offColor: "#D0D0D0" }),
      embed("zoneTable", `${M}/Zone Table`, {}, p(759, 158, 366, 152)),
      embedAt("slitter", c.slitter, p(1172, 200, 106, c.slitter.h)), embedAt("upperPoly", c.upperPoly, p(1280, 200, 106, c.upperPoly.h)),
      embedAt("winderFootage", c.winderFootage, p(1371, 255, 140, c.winderFootage.h)),
      ind("letoffTurret", "Turret in Position", "letoff.turret_in_position", p(20, 443, 128, 32)),
      ind("platenClosed", "Platen Closed", "splice.platen_closed", p(190, 443, 120, 32), { invert: true }),
      ind("tankUp", "Tank Up", "impreg.tank_up", p(668, 465, 84, 32)),
      embed("safetyPins", `${M}/Safety Pins`, {}, p(837, 424, 212, 60)),
      ind("winderTurret", "Turret in Position", "winder.turret_in_position", p(1386, 443, 125, 32)),
      embedAt("letoff", c.letoff, p(20, 530, 125, c.letoff.h)), embedAt("splicePress", c.splice, p(150, 530, 245, c.splice.h)),
      embedAt("tensionStand1", c.ts1, p(499, 530, 125, c.ts1.h)), embedAt("impregnation", c.impreg, p(648, 530, 125, c.impreg.h)),
      embedAt("coolingRolls", c.cooling, p(1034, 530, 118, c.cooling.h)), embedAt("tensionStand2", c.ts2, p(1156, 530, 118, c.ts2.h)),
      embedAt("lowerPoly", c.lowerPoly, p(1278, 530, 110, c.lowerPoly.h)), embedAt("winder", c.winder, p(1392, 530, 119, c.winder.h)),
      embedAt("ovenControl", c.ovenControl, p(135, 770, 300, c.ovenControl.h)), embedAt("lineControl", c.lineControl, p(445, 770, 260, c.lineControl.h)),
      embedAt("lineSpeed", c.lineSpeed, p(715, 770, 260, c.lineSpeed.h)), embedAt("production", c.production, p(985, 770, 250, c.production.h)),
      { ...button("faultReset", "Fault Reset", T("btn.fault_reset"), "cal1615/btn-stop"), position: p(1300, 780, 200, 60) },
    ], [
      embed("recipeBanner", `${M}/Recipe Banner`, {}, { basis: "40px", shrink: 0 }),
      ...["lineControl", "lineSpeed", "ovenControl", "letoff", "letoffFootage", "splice", "entryAcc", "ts1", "impreg", "cooling", "ts2", "slitter", "upperPoly", "lowerPoly", "winderAcc", "winder", "winderFootage", "production"].map((k) => sCard(k, c[k])),
      { ...button("faultReset", "Fault Reset", T("btn.fault_reset"), "cal1615/btn-stop"), position: { basis: "56px", shrink: 0 } },
    ]);
    pages["/overview"] = main;
  }

  // ---------------------------------------------------------------- Main: oven control, emergency stops
  {
    const zoneCard = (zn) => {
      const zc = (f) => Z(f).read;
      return { vpath: `Components/Oven/Zone/Zone Control`, rows: [
        statusRow("exhaust", "Exhaust", zc("exh_status"), FAN_STATUS), statusRow("recirc", "Recirc", zc("recirc_status"), FAN_STATUS),
        statusRow("heat", "Heat", zc("heat_status"), HEAT_STATUS), statusRow("status", "Status", zc("status"), ZONE_STATUS),
        entryRow("setpoint", "Setpoint", Z("temp_sp").read, Z("temp_sp").write, "F"), valueRow("temperature", "Temperature", Z("temp").read, "F"),
        buttonRow("buttons", [button("startHeat", "Start Heat", zc("pb_start_heat"), "cal1615/btn-start"), button("stopHeat", "Stop Heat", zc("pb_stop_heat"), "cal1615/btn-stop")]) ] };
    };
    const zc = zoneCard();
    const hz = cardView(zc.vpath, "Zone", zc.rows, 320, { zone: 1 });
    { const f = path.join(V, `${zc.vpath}/view.json`); const j = JSON.parse(fs.readFileSync(f)); j.root.children[0].propConfig = { "props.text": expr('"Zone " + {view.params.zone}') }; fs.writeFileSync(f, JSON.stringify(j, null, 2)); }
    const oven = C_("Components/Oven/Oven", "Oven", [B_([["Start Oven", "btn.start_oven", "cal1615/btn-start"], ["Stop Oven", "btn.stop_oven", "cal1615/btn-stop"]]),
      B_([["Stop All Fans", "oven.pb_stop_all_fans", "cal1615/btn-stop"]]), L_("Open Oven", [["Active", "oven.open_oven", "#FFA000"]]), B_([["Open Oven On/Off", "oven.pb_open_oven"]])], 320);
    cardsPage(`${FV}/Home/Oven Control`, [
      ...[1, 2, 3].map((z) => embed(`zone${z}`, zc.vpath, { zone: z }, { basis: "320px", grow: 1, shrink: 0 }, { style: { height: hz + "px", margin: "4px" } })),
      flexCard("oven", oven),
    ]);
    pages["/oven-control"] = `${FV}/Home/Oven Control`;

    // Emergency stops: drawing with the rope switch lamps (design 1512x940).
    const L = layout(1512, 940), p = L.pos;
    const trip = { onColor: "#FF2020", offColor: "#00E000" };
    const sw = [[1, 34, 290], [2, 131, 542], [3, 336, 130], [4, 500, 542], [5, 760, 253], [6, 1124, 290], [7, 1127, 542], [8, 1335, 290]];
    const estop = C_("Components/Main/Emergency Stops", "Emergency Stops", [...sw.map(([k]) => L_(`Rope Switch ${k}`, [["Tripped", `estop.rope_${k}`, "#FF2020", "#00E000"]])),
      L_("Main OP Station", [["Tripped", "estop.main_op", "#FF2020", "#00E000"]])], 320);
    pages["/emergency-stops"] = largeSmallMain(`${FV}/Home/Emergency Stops`, [
      pageTitle("Emergency Stops", p(456, 6, 600, 40)),
      image("line_estop.png", p(22, 230, 1490, 295, true)),
      ...sw.map(([k, x, y]) => ind(`ropeSwitch${k}`, `Rope Switch ${k}`, `estop.rope_${k}`, p(x, y, 130, 34), trip)),
      ind("mainEstop", "Main OP Station E-Stop", "estop.main_op", p(690, 660, 190, 34), trip),
    ], [sCard("estops", estop)]);
  }

  // ---------------------------------------------------------------- recipes (SQL, cal2016 approach)
  {
    // Copy the SQL recipe named queries and project scripts from the earlier project.
    const old = path.resolve(OUT, "../cal1615_ignition/ignition");
    fs.cpSync(path.join(old, "named-query/cal1615 Recipe"), path.join(OUT, "ignition/named-query/cal1615 Recipe"), { recursive: true });
    for (const s of ["recipes", "pm"]) fs.cpSync(path.join(old, "script-python/cal1615", s), path.join(OUT, "ignition/script-python/cal1615", s), { recursive: true });
    fs.cpSync(path.resolve(OUT, "../cal1615_ignition/sql"), path.join(OUT, "..", "cal1615_std_sql"), { recursive: true });
    const rcpIds = Object.keys(TAGMAP).filter((k) => k.startsWith("rcp.") && TAGMAP[k].tag && TAGMAP[k].type === "REAL" && TAGMAP[k].used !== false);
    const key = (id) => id.slice(4).replace(/\./g, "__");
    const LINE = ["line_speed_sp", "letoff_tension_sp", "cure_time_sp", "platen_temp_sp", "acc_counter_pressure_sp", "acc_fill_pressure_sp", "acc_tension_sp", "ts1_tension_sp",
      "impreg_gap_sp", "impreg_supply_speed_sp", "slitter_speed_sp", "upper_poly_tension_sp", "lower_poly_tension_sp", "winder_tension_sp", "adv_cooling_temp_sp"];
    const LBL = { line_speed_sp: "Line Speed Setpoint", letoff_tension_sp: "Letoff Tension Setpoint", cure_time_sp: "Splice Platen Cure Time Setpoint", platen_temp_sp: "Splice Platen Temperature Setpoint",
      acc_counter_pressure_sp: "Accumulator Counter Pressure", acc_fill_pressure_sp: "Accumulator Fill Pressure Setpoint", acc_tension_sp: "Accumulator Tension Setpoint",
      ts1_tension_sp: "Tension Stand 1 Tension Setpoint", impreg_gap_sp: "Impreg Gap Setpoint", impreg_supply_speed_sp: "Impreg Supply Speed Setpoint", slitter_speed_sp: "Slitter Speed Setpoint",
      upper_poly_tension_sp: "Upper Poly Tension Setpoint", lower_poly_tension_sp: "Lower Poly Tension Setpoint", winder_tension_sp: "Winder Tension Setpoint", adv_cooling_temp_sp: "Roll Cooling Temperature Setpoint" };
    const UNITS = { fpm: "FPM", lb: "LBS", s: "Sec", degF: "F", psi: "PSI", in: "IN", rpm: "RPM", "%": "%" };
    const units = (id) => UNITS[(TAGMAP[id] || {}).units] || "";
    const fm = (m) => (/gap/.test(m) ? "#,##0.0000" : "#,##0.000");
    const ZSP = [["exhaust_sp", "Exhaust Fan Setpoint"], ["recirc_sp", "Recirc Fan Setpoint"], ["temp_sp", "Temperature Setpoint"]];
    // Active recipe: the running values; edits write p02_recipe_from_hmi.
    const lineCard = C_("Components/Recipe/Active Line Settings", "Line Settings", LINE.filter((m) => T(`rcp.${m}`)).map((m) => E_(LBL[m], `rcp.${m}`, units(`rcp.${m}`), fm(m))), 480);
    const zoneCards = [1, 2, 3].map((z) => C_(`Components/Recipe/Active Zone ${z}`, `Zone ${z}`, ZSP.map(([m, l]) => E_(`Zone ${z} ${l}`, `rcp.zone_${z}.${m}`, units(`rcp.zone_${z}.${m}`), "#,##0.0")), 360));
    const saveAs = flex("saveAs", [
      label("lbl", "Save running recipe as:", { style: { fontWeight: "bold" } }, { basis: "200px", shrink: 0 }),
      { type: "ia.input.text-field", meta: { name: "name" }, position: { grow: 1, basis: "200px" }, props: { placeholder: "recipe name" } },
      { type: "ia.input.button", meta: { name: "save" }, position: { basis: "140px", shrink: 0 }, props: { text: "Save As...", style: { classes: "cal1615/btn" } },
        propConfig: { "props.enabled": expr(`${canOperate} && len(trim({../name.props.text})) > 0`) },
        events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script:
          "\tname = self.getSibling('name').props.text.strip()\n\tcal1615.recipes.save(name, cal1615.recipes.readActive())\n\tself.getSibling('name').props.text = ''" } } } } },
    ], { direction: "row", alignItems: "center", style: { classes: "cal1615/card", gap: "8px", padding: "6px", margin: "4px" } }, { basis: "100%", grow: 1, shrink: 0 });
    cardsPage(`${FV}/Home/Active Recipe`, [
      embed("banner", "Components/Main/Recipe Banner", {}, { basis: "100%", grow: 1, shrink: 0 }, { style: { height: "40px", margin: "4px" } }),
      saveAs, flexCard("lineSettings", lineCard, "480px"), ...zoneCards.map((zc, i) => flexCard(`zone${i + 1}`, zc, "360px")),
    ]);
    pages["/active-recipe"] = `${FV}/Home/Active Recipe`;

    // Recipe screen like cal2016's: recipe table (named query) + entry form bound to view.custom.rcp.
    const rcpField = (title, k, u, f) => flex(`f_${k}`, [
      label("title", title, { style: { classes: "cal1615/row-label" } }, { grow: 1, basis: "0" }),
      { type: "ia.input.numeric-entry-field", meta: { name: "entry" }, position: { basis: "90px", shrink: 0 }, props: { format: f, spinner: { enabled: false }, style: { classes: "cal1615/entry" } },
        propConfig: { "props.value": { binding: { type: "property", config: { path: `view.custom.rcp.${k}`, bidirectional: true } } } } },
      label("units", u, { style: { classes: "cal1615/units" } }, { basis: "auto", shrink: 0 }),
    ], { direction: "row", alignItems: "stretch", style: { padding: "3px 6px", gap: "4px" } }, { basis: "28px", shrink: 0 });
    const formCard = (name, title, fields, basis) => flex(name, [label("header", title, { style: { classes: "cal1615/card-header" } }, { basis: "26px", shrink: 0 }), ...fields],
      { direction: "column", style: { classes: "cal1615/card", margin: "4px", paddingBottom: "4px" } }, { basis, grow: 1, shrink: 0 });
    const act = (nm, text, enabled, script, cls = "cal1615/btn") => ({ type: "ia.input.button", meta: { name: nm }, position: { basis: "140px", shrink: 0 }, props: { text, style: { classes: cls } },
      propConfig: { "props.enabled": expr(enabled) }, events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script } } } } });
    const reload = "\tself.view.rootContainer.getChild('recipes').getChild('table').refreshBinding('props.data')\n";
    const load = "\tvals = cal1615.recipes.get(self.view.custom.name)\n\tself.view.custom.rcp = dict((k, vals.get(k, 0)) for k in cal1615.recipes.KEYS)\n";
    const empty = Object.fromEntries(rcpIds.map((id) => [key(id), 0]));
    const has = `${canOperate} && len({view.custom.name}) > 0`;
    writeView(`${FV}/Home/Recipe`, view({ size: { width: PAGE_W, height: PAGE_H }, custom: { name: "", newName: "", rcp: empty },
      root: flex("root", [
        flex("toolbar", [
          label("lbl", "Recipe:", { style: { fontWeight: "bold", fontSize: "18px" } }, { basis: "80px", shrink: 0 }),
          label("name", "", { style: { classes: "cal1615/value", textAlign: "left", fontSize: "16px" } }, { grow: 1, basis: "200px" },
            { propConfig: { "props.text": expr('if(len({view.custom.name}) > 0, {view.custom.name}, "(select a recipe)")') } }),
          act("copyRunning", "Copy Running", "true", "\tvals = cal1615.recipes.readActive()\n\tself.view.custom.rcp = dict((k, vals.get(k, 0)) for k in cal1615.recipes.KEYS)"),
          act("save", "Save", has, "\tcal1615.recipes.save(self.view.custom.name, cal1615.recipes.fromDraft(self.view.custom.rcp))\n" + reload),
          act("delete", "Delete", has, "\tcal1615.recipes.delete(self.view.custom.name)\n\tself.view.custom.name = ''\n" + reload, "cal1615/btn-stop"),
          act("download", "Download to PLC", has, "\tcal1615.recipes.download(self.view.custom.name, cal1615.recipes.fromDraft(self.view.custom.rcp))", "cal1615/btn-start"),
        ], { direction: "row", alignItems: "center", wrap: "wrap", style: { classes: "cal1615/card", gap: "8px", padding: "6px", margin: "4px" } }, { basis: "100%", grow: 1, shrink: 0 }),
        flex("recipes", [
          label("header", "Recipes", { style: { classes: "cal1615/card-header" } }, { basis: "26px", shrink: 0 }),
          { type: "ia.display.table", meta: { name: "table" }, position: { grow: 1, basis: "400px" },
            props: { selection: { mode: "single" }, columns: [{ field: "name", header: { title: "Name" }, width: 190 }, { field: "modified", header: { title: "Modified" }, width: 150, render: "date", dateFormat: "YYYY-MM-DD HH:mm" }] },
            propConfig: { "props.data": { binding: { type: "query", config: { queryPath: "cal1615 Recipe/Recipe List", parameters: {}, polling: { enabled: false, rate: "0" } } } } },
            events: { component: { onRowClick: { type: "script", scope: "G", config: { script: "\tself.view.custom.name = event.value['name']\n" + load } } } } },
          flex("create", [
            { type: "ia.input.text-field", meta: { name: "newName" }, position: { grow: 1, basis: "120px" }, props: { placeholder: "new recipe name" } },
            act("create", "Create", `${canOperate} && len(trim({../newName.props.text})) > 0`,
              "\tname = self.getSibling('newName').props.text.strip()\n\tcal1615.recipes.save(name, cal1615.recipes.fromDraft(self.view.custom.rcp))\n\tself.view.custom.name = name\n\tself.getSibling('newName').props.text = ''\n\tself.parent.parent.getChild('table').refreshBinding('props.data')"),
          ], { direction: "row", alignItems: "center", style: { gap: "6px", padding: "6px" } }, { basis: "48px", shrink: 0 }),
        ], { direction: "column", style: { classes: "cal1615/card", margin: "4px", height: "680px" } }, { basis: "360px", shrink: 0 }),
        formCard("lineSettings", "Line Settings", LINE.filter((m) => T(`rcp.${m}`)).map((m) => rcpField(LBL[m], key(`rcp.${m}`), units(`rcp.${m}`), fm(m))), "480px"),
        ...[1, 2, 3].map((z) => formCard(`zone${z}`, `Zone ${z}`, ZSP.map(([m, l]) => rcpField(`Zone ${z} ${l}`, key(`rcp.zone_${z}.${m}`), units(`rcp.zone_${z}.${m}`), "#,##0.0")), "360px")),
        formCard("other", "Other Recipe Values", rcpIds.filter((id) => !LINE.includes(id.slice(4)) && !/^rcp\.zone_/.test(id)).map((id) => rcpField(TAGMAP[id].label || id.slice(4), key(id), units(id), "#,##0.000")), "360px"),
      ], { direction: "row", wrap: "wrap", alignContent: "flex-start", alignItems: "flex-start", style: { padding: "6px", overflowY: "auto" } }),
    }));
    // The Save/Delete buttons refresh the table through the root container.
    { const f = path.join(V, `${FV}/Home/Recipe/view.json`); let t = fs.readFileSync(f, "utf8"); t = t.split("self.view.rootContainer.getChild('recipes')").join("self.view.rootContainer.getChild('recipes')"); fs.writeFileSync(f, t); }
    pages["/recipe"] = `${FV}/Home/Recipe`;
  }

  // ---------------------------------------------------------------- Oven Zones: advanced cooling
  {
    const cool = C_("Components/Oven/Roll Cooling", "Roll Cooling", [V_("Temperature", "cooling.temp", "F"), E_("Temperature Setpoint", "cooling.temp_sp", "F"),
      V_("Pressure", "cool.pressure", '"wc', "#,##0.000"), L_("Cooling", [["Requested", "cool.heat_status"]]), L_("Faults", [["OK", "cool.led_zone_faults_ok", "#00E000", "#FF2020", true]]),
      B_([["Start", "cool.pb_start_heat", "cal1615/btn-start"], ["Stop", "cool.pb_stop_heat", "cal1615/btn-stop"]])], 340);
    const pump = C_("Components/Oven/Roll Cooling Pump", "Pump", [L_("Pump", [["Running", "cool.pump_on"]]),
      B_([["Start Pump", "cool.pb_pump_start", "cal1615/btn-start"], ["Stop Pump", "cool.pb_pump_stop", "cal1615/btn-stop"]])], 340);
    const valve = C_("Components/Oven/Roll Cooling Valve", "Control Valve", [V_("Output", "cool.cv_output", "%"), E_("Manual Setpoint", "cool.cv_manual_sp", "%"),
      S_("Mode", "cool.cv_auto", E.autoMan), B_([["Auto", "cool.pb_cv_auto"], ["Manual", "cool.pb_cv_manual"]])], 340);
    const tr = chart("trend", [["Roll Cooling Temp", "cooling.temp"], ["Setpoint", "cooling.temp_sp"]], { basis: "100%", grow: 1, shrink: 0 });
    tr.props.style = { height: "420px", margin: "4px" };
    const coolTitle = flex("titleRow", [...carouselArrows(OVEN_SEQUENCE, () => ({ basis: "36px", shrink: 0 })).slice(0, 1),
      label("title", "Advanced Cooling", { style: { classes: "cal1615/page-title" } }, { grow: 1, basis: "0" }),
      ...carouselArrows(OVEN_SEQUENCE, () => ({ basis: "36px", shrink: 0 })).slice(1)], { direction: "row", alignItems: "stretch" }, { basis: "100%", grow: 1, shrink: 0 });
    coolTitle.props.style = { height: "60px" };
    cardsPage(`${FV}/Ovens/Advanced Cooling`, [coolTitle, flexCard("cooling", cool, "340px"), flexCard("pump", pump, "340px"), flexCard("valve", valve, "340px"), tr]);
    pages["/advanced-cooling"] = `${FV}/Ovens/Advanced Cooling`;
  }

  // ---------------------------------------------------------------- Line Drives (design 1512x920; drawings cropped from the RSView screens)
  const lineArrows = () => carouselArrows(LINE_SEQUENCE, (x) => ({ x: x === "left" ? 0 : PAGE_W - 36, y: 330, width: 36, height: 90 }));
  const PID = (vpath, title, pre) => C_(vpath, title, [E_("Kp", `${pre}.pid_kp`, "", "#,##0.000"), E_("Ki", `${pre}.pid_ki`, "", "#,##0.000"), E_("Kd", `${pre}.pid_kd`, "", "#,##0.000")], 260);
  const LD = "Components/Line";
  {
    const L = layout(1512, 920), p = L.pos;
    const letoff = C_(`${LD}/Let-Off`, "Let-Off", [V_("Tension", "letoff.tension", "LBS"), E_("Tension Setpoint", "letoff.tension_sp", "LBS"), S_("Active Let-Off", "letoff.active_a", E.letoffAB)], 270);
    const footage = C_(`${LD}/Let-Off Footage`, "Let-Off Footage", [V_("A", "letoff.footage_a", "FT", "#,##0"), V_("B", "letoff.footage_b", "FT", "#,##0")], 150);
    const splice = C_(`${LD}/Splice Press`, "Splice Press", [V_("Temperature", "splice.temp", "F"), E_("Temperature Setpoint", "splice.temp_sp", "F"),
      V_("Cure Time Remaining", "splice.cure_remaining", "Sec"), E_("Cure Time Setpoint", "splice.cure_time_sp", "Sec"), S_("Sequencer", "splice.status", E.splice), B_([["Reset", "splice.pb_reset"]])], 320);
    const pid = PID(`${LD}/Let-Off PID`, "Let-Off PID", "letoff");
    const ox = -10, oy = -320;
    pages["/letoff-splice"] = largeSmallMain(`${FV}/Line/Letoff Splice`, [
      pageTitle("Let-Off & Splice Press", p(456, 6, 600, 40)), ...lineArrows(),
      image("line_letoff.png", p(20, 80, 910, 405, true)),
      embedAt("footage", footage, p(185 + ox, 415 + oy, 150, footage.h)),
      ind("turret", "Turret in Position Proximity Switch", "letoff.turret_in_position", p(84 + ox, 517 + oy, 268, 32)),
      ind("platen", "Platen Closed Limit Switch", "splice.platen_closed", p(476 + ox, 475 + oy, 240, 32), { invert: true }),
      chart("trend", [["Let-Off Tension", "letoff.tension"], ["Tension Setpoint", "letoff.tension_sp"]], p(960, 60, 540, 440, true)),
      embedAt("letoff", letoff, p(100, 520, 270, letoff.h)), embedAt("splice", splice, p(400, 520, 320, splice.h)), embedAt("pid", pid, p(1100, 520, 260, pid.h)),
    ], [sCard("letoff", letoff), sCard("footage", footage), sCard("splice", splice), sCard("pid", pid)]);
  }
  {
    const L = layout(1512, 920), p = L.pos;
    const acc = C_(`${LD}/Entry Accumulator`, "Entry Accumulator", [V_("Position", "entry_acc.position_pct", "%"), V_("Time Until Empty", "entry_acc.time_until_empty", "Sec", "#,##0"),
      E_("Tension Setpoint", "acc.tension_sp", "PSI", "#,##0.00"), E_("Fill Pressure Setpoint", "acc.fill_prs_sp", "PSI", "#,##0.00"), E_("Counter Pressure Setpoint", "acc.counter_prs_sp", "PSI", "#,##0.00"),
      S_("Sequencer", "entry_acc.status", E.entryAcc), S_("Fill Mode", "entry_acc.fill_mode_auto", E.fillMode), B_([["Reset", "acc.pb_seq_reset"], ["Toggle Mode", "entry_acc.fill_mode_toggle_pb"]])], 330);
    const ts1 = C_(`${LD}/Tension Stand 1`, "Tension Stand 1", [V_("Tension", "ts1.tension", "LBS"), E_("Tension Setpoint", "ts1.tension_sp", "LBS"), S_("Mode", "ts1.mode", E.tsMode)], 270);
    const impreg = C_(`${LD}/Impregnation`, "Impregnation", [V_("Speed", "impreg.speed", "FPM"), V_("Speed Setpoint", "impreg.speed_sp", "FPM"),
      E_("Gap Setpoint", "impreg.gap_sp", "IN", "#,##0.0000"), V_("Gap Actual (DS)", "impreg.gap_actual", "IN", "#,##0.0000"),
      L_("Tank Level", [["Low", "impreg.tank_level_low"], ["High", "impreg.tank_level_high"]]), L_("Trough Level", [["Low", "impreg.trough_level_low"]])], 280);
    const pid = PID(`${LD}/Tension Stand 1 PID`, "Tension Stand 1 PID", "ts1");
    const oy = -140;
    pages["/accumulator-ts1"] = largeSmallMain(`${FV}/Line/Accumulator TS1`, [
      pageTitle("Accumulator & Tension Stand 1", p(456, 6, 600, 40)), ...lineArrows(),
      image("line_accum.png", p(20, 60, 930, 605, true)),
      embedAt("acc", acc, p(490, 213 + oy, 330, acc.h)),
      ind("fullLS", "Accumulator Full Limit Switch", "entry_acc.full_ls", p(78, 313 + oy, 244, 32)),
      ind("emptyLS", "Accumulator Empty Limit Switch", "entry_acc.empty_ls", p(78, 680 + oy, 244, 32)),
      ind("nipL", "Nip Open", "nip.feedroll_closed", p(138, 578 + oy, 104, 32), { invert: true, offColor: "#D0D0D0" }),
      ind("nipR", "Nip Open", "nip.ts1_closed", p(542, 578 + oy, 104, 32), { invert: true, offColor: "#D0D0D0" }),
      ind("tankUp", "Tank Up", "impreg.tank_up", p(766, 728 + oy, 100, 32)),
      chart("trend", [["TS1 Tension", "ts1.tension"], ["Tension Setpoint", "ts1.tension_sp"]], p(960, 60, 540, 440, true)),
      embedAt("ts1", ts1, p(380, 680, 270, ts1.h)), embedAt("impreg", impreg, p(670, 680, 280, impreg.h)), embedAt("pid", pid, p(1100, 520, 260, pid.h)),
    ], [sCard("acc", acc), sCard("ts1", ts1), sCard("impreg", impreg), sCard("pid", pid)]);
  }
  {
    const L = layout(1512, 920), p = L.pos;
    const upper = C_(`${LD}/Upper Poly Unwind`, "Upper Poly Unwind", [V_("Diameter A", "upper_poly.dia_a", "IN"), V_("Diameter B", "upper_poly.dia_b", "IN"), E_("Tension Setpoint", "upper_poly.tension_sp", "LBS")], 230);
    const slitter = C_(`${LD}/Slitter`, "Slitter", [V_("Speed", "slitter.speed", "FPM", "#,##0.00"), E_("Speed SP (% of Line)", "slitter.speed_sp", "%", "#,##0.00")], 230);
    const wfoot = C_(`${LD}/Winder Footage`, "Winder Footage", [V_("A", "winder.footage_a", "FT", "#,##0"), V_("B", "winder.footage_b", "FT", "#,##0")], 150);
    const cooling = C_(`${LD}/Roll Cooling`, "Roll Cooling", [V_("Temperature", "cooling.temp", "F"), E_("Temperature Setpoint", "cooling.temp_sp", "F")], 243);
    const ts2 = C_(`${LD}/Tension Stand 2`, "Tension Stand 2", [V_("Speed", "ts2.speed", "FPM"), V_("Speed Setpoint", "ts2.speed_sp", "FPM"), V_("Tension", "ts2.tension", "LBS"),
      E_("Tension Setpoint", "ts2.tension_sp", "LBS"), S_("Mode", "ts2.mode", E.tsMode)], 270);
    const lower = C_(`${LD}/Lower Poly Unwind`, "Lower Poly Unwind", [V_("Diameter A", "lower_poly.dia_a", "IN"), V_("Diameter B", "lower_poly.dia_b", "IN"), E_("Tension Setpoint", "lower_poly.tension_sp", "LBS")], 250);
    const winder = C_(`${LD}/Winder`, "Winder", [V_("Tension", "winder.tension", "LBS"), E_("Tension Setpoint", "winder.tension_sp", "LBS"), V_("Diameter", "winder.diameter", "IN"),
      L_("Active Winder", [["A", "winder.active_a"], ["B", "winder.active_b"]])], 270);
    const pid = PID(`${LD}/Winder PID`, "Winder PID", "winder");
    const ox = -5, oy = -310;
    pages["/ts2-poly-windup"] = largeSmallMain(`${FV}/Line/TS2 Poly Windup`, [
      pageTitle("Tension Stand 2 & Polys & Windup", p(456, 6, 600, 40)), ...lineArrows(),
      image("line_winder.png", p(20, 60, 935, 435, true)),
      embedAt("upper", upper, p(427 + ox, 375 + oy, 230, upper.h)), embedAt("slitter", slitter, p(190 + ox, 447 + oy, 230, slitter.h)),
      embedAt("wfoot", wfoot, p(770 + ox, 429 + oy, 150, wfoot.h)),
      ind("turret", "Turret in Position Proximity Switch", "winder.turret_in_position", p(689 + ox, 540 + oy, 268, 32)),
      embedAt("cooling", cooling, p(27 + ox, 638 + oy, 243, cooling.h)),
      chart("trend", [["Winder Tension", "winder.tension"], ["Tension Setpoint", "winder.tension_sp"]], p(960, 60, 540, 440, true)),
      embedAt("ts2", ts2, p(60, 520, 270, ts2.h)), embedAt("lower", lower, p(350, 520, 250, lower.h)), embedAt("winder", winder, p(620, 520, 270, winder.h)), embedAt("pid", pid, p(1100, 520, 260, pid.h)),
    ], [sCard("ts2", ts2), sCard("slitter", slitter), sCard("upper", upper), sCard("lower", lower), sCard("cooling", cooling), sCard("winder", winder), sCard("wfoot", wfoot), sCard("pid", pid)]);
  }

  // ---------------------------------------------------------------- Maintenance
  {
    const MV = `${FV}/Maintenance`;
    // Zone setup: one card view per zone (zone parameter) plus roll cooling.
    const setupRows = (pre, zoneMode, cooling) => {
      const p = (f) => (zoneMode ? Z(f) : { read: T(`${pre}.${f}`), write: TW(`${pre}.${f}`) });
      const e = (t, f, u, form = "#,##0.0") => entryRow(`r_${f}`, t, p(f).read, p(f).write, u, form);
      return [e("Process Control TC1 Zero Offset", "tc1_zero", "F"), e("Process Control TC2 Zero Offset", "tc2_zero", "F"), e("Process Control TC High Limit", "tc_high_limit", "F"),
        e("Control SP Deviation Warning", "sp_dev_warning", "F"),
        ...(cooling ? [] : [e("LFL Warning Level", "lfl_warning", "%"), e("LFL Alarm Level", "lfl_alarm", "%"), e("Shutdown Temperature", "shutdown_temp", "F"),
          e("Low Pressure Warning Level", "low_prs_warning", "WC", "#,##0.000"), e("Fast to Soak Deviation", "fast_to_soak", "F"), e("Soak to Fast Deviation", "soak_to_fast", "F")]),
        ...["1", "2"].flatMap((k) => [e(`PID${k} ${k === "1" ? "(Fast)" : "(Soak)"} Gain Kp`, `pid${k}_kp`, "", "#,##0.000"), e(`PID${k} Integral Ki`, `pid${k}_ki`, "", "#,##0.000"),
          e(`PID${k} Derivative Kd`, `pid${k}_kd`, "", "#,##0.000"), e(`PID${k} Bias`, `pid${k}_bias`, "%")])];
    };
    const zSetup = "Components/Oven/Zone/Zone Setup";
    const hzs = cardView(zSetup, "Zone", setupRows("z", true, false), 360, { zone: 1 });
    { const f = path.join(V, `${zSetup}/view.json`); const j = JSON.parse(fs.readFileSync(f)); j.root.children[0].propConfig = { "props.text": expr('"Zone " + {view.params.zone}') }; fs.writeFileSync(f, JSON.stringify(j, null, 2)); }
    nameSeq = 0;
    const coolSetup = { path: "Components/Oven/Roll Cooling Setup", h: cardView("Components/Oven/Roll Cooling Setup", "Roll Cooling", setupRows("cool", false, true).filter((r) => {
      const b = JSON.stringify(r); return /tagPath":"\[/.test(b); }), 360) };
    cardsPage(`${MV}/Zone Setup`, [...[1, 2, 3].map((z) => embed(`zone${z}`, zSetup, { zone: z }, { basis: "360px", grow: 1, shrink: 0 }, { style: { height: hzs + "px", margin: "4px" } })), flexCard("cooling", coolSetup, "360px")]);
    pages["/zone-setup"] = `${MV}/Zone Setup`;

    // VFD drives: one row template (params = tag paths) repeated for each drive.
    const VALS = [["speed", "Speed", "#,##0.0"], ["amps", "Amps", "#,##0.00"], ["hz", "Hz", "#,##0.0"], ["rpm", "RPM", "#,##0"]];
    const BITS = [["faulted", "Faulted", "#FF2020"], ["warning", "Warning", "#FFA000"], ["run_fwd", "Running Forward"], ["run_rev", "Running Reverse"], ["ready", "Ready"],
      ["ctrl_net", "Ctrl from Net"], ["ref_net", "Ref from Net"], ["at_ref", "At Reference"]];
    const cell = (basis) => ({ basis, shrink: 0 });
    const ind2 = (k) => ({ binding: { type: "tag", config: { fallbackDelay: 2.5, mode: "indirect", references: { "0": `{view.params.${k}}` }, tagPath: "{0}" } } });
    writeView("Components/Drives/VFD Row", view({
      params: { name: "", ...Object.fromEntries(VALS.map(([k]) => [k, ""])), ...Object.fromEntries(BITS.map(([k]) => [k, ""])), ...Object.fromEntries(BITS.map(([k]) => [k + "_inv", false])) },
      size: { width: 1400, height: 36 },
      root: flex("root", [
        label("name", "", { style: { fontWeight: "bold", fontSize: "13px" } }, cell("190px"), { propConfig: { "props.text": { binding: { type: "property", config: { path: "view.params.name" } } } } }),
        ...VALS.map(([k, , f]) => label(k, "", { style: { textAlign: "right", fontSize: "13px", paddingRight: "12px" } }, cell("95px"), { propConfig: {
          "props.text": { ...ind2(k), binding: { ...ind2(k).binding, transforms: [fmt(f)] } }, "position.display": expr(`len({view.params.${k}}) > 0`) } })),
        ...BITS.map(([k, , on]) => flex(`c_${k}`, [label(k, "", { style: { classes: "cal1615/led" } }, { basis: "34px", shrink: 0 }, { propConfig: {
          "props.style.backgroundColor": { ...ind2(k), binding: { ...ind2(k).binding, transforms: [{ type: "expression", expression: `if(isNull({value}), "#FF00FF", if(toBoolean({value}) != {view.params.${k}_inv}, "${on || "#00E000"}", "#FFFF00"))` }] } },
          "position.display": expr(`len({view.params.${k}}) > 0`) } })], { direction: "row", justify: "center", style: { padding: "7px 0" } }, cell("95px"))),
      ], { direction: "row", alignItems: "center", style: { paddingLeft: "8px", borderBottomStyle: "solid", borderBottomWidth: "1px", borderBottomColor: "var(--neutral-40)" } }),
    }));
    const ROWS = [["loa", "Letoff A"], ["lob", "Letoff B"], ["lot", "Letoff Turret"], ["ts1", "Tension Stand 1"], ["impreg", "Impreg Metering Roll"], ["ts2", "Tension Stand 2"], ["slitter", "Slitter"],
      ["wa", "Winder A"], ["wb", "Winder B"], ["wt", "Winder Turret"], ["supply", "Impreg Supply Fan"], ["spring", "Impreg Spring Roll"], ["z1r", "Zone 1 Recirc"], ["z1e", "Zone 1 Exhaust"],
      ["z2r", "Zone 2 Recirc"], ["z2e", "Zone 2 Exhaust"], ["z3r", "Zone 3 Recirc"], ["z3e", "Zone 3 Exhaust"]];
    writeView(`${MV}/VFD Drives`, view({ size: { width: PAGE_W, height: PAGE_H }, root: flex("root", [
      flex("header", [label("h_name", "VFD", { style: { fontWeight: "bold" } }, cell("190px")),
        ...VALS.map(([k, t]) => label("h_" + k, t, { style: { fontWeight: "bold", textAlign: "right", paddingRight: "12px" } }, cell("95px"))),
        ...BITS.map(([k, t]) => label("h_" + k, t, { style: { fontWeight: "bold", textAlign: "center", fontSize: "12px", whiteSpace: "normal" } }, cell("95px")))],
        { direction: "row", alignItems: "center", style: { paddingLeft: "8px", backgroundColor: "var(--neutral-40)" } }, { basis: "44px", shrink: 0 }),
      ...ROWS.map(([id, nm]) => embed(`vfd_${id}`, "Components/Drives/VFD Row", { name: nm, ...Object.fromEntries(VALS.map(([k]) => [k, T(`vfd.${id}.${k}`)])),
        ...Object.fromEntries(BITS.map(([k]) => [k, T(`vfd.${id}.${k}`)])), ...Object.fromEntries(BITS.map(([k]) => [k + "_inv", inv(`vfd.${id}.${k}`)])) }, { basis: "36px", shrink: 0 })),
    ], { direction: "column", style: { classes: "cal1615/card", margin: "6px", overflow: "auto" } }) }));
    pages["/vfd-drives"] = `${MV}/VFD Drives`;

    // Servo drives.
    const servo = (sd, title) => C_(`Components/Drives/Servo ${sd.toUpperCase()}`, title, [
      B_([["Start", `servo.${sd}.pb_start`], ["Stop", `servo.${sd}.pb_stop`, "cal1615/btn-stop"], ["Reset", `servo.${sd}.pb_reset`]]),
      ...[["not_ready", "Not Ready", "#FFA000"], ["bb", "BB (Ready for Power On)"], ["ab", "AB (Control and Power Ready)"], ["af", "AF (In Operation)"], ["param_mode", "Parameter Mode", "#FFA000"],
        ["homed", "Homed"], ["at_target", "At Target Position"], ["standstill", "Stand Still"], ["op_mode_error", "Operation Mode Error", "#FF2020"], ["drive_error", "Drive Error", "#FF2020"],
        ["drive_warning", "Drive Warning", "#FFA000"]].map(([k, t, on]) => LR(t, `servo.${sd}.${k}`, on || "#00E000", "#E0E0E0")),
      V_("Actual Position", `servo.${sd}.actual_position`, "IN", "#,##0.000"), E_("Zero Offset", `servo.${sd}.zero_offset`, "IN", "#,##0.0000"),
      B_([["Zero", `servo.${sd}.pb_zero`]]), B_([["Jog Forward", `servo.${sd}.pb_jog_fwd`, null, true], ["Jog Reverse", `servo.${sd}.pb_jog_rev`, null, true]])], 400);
    const pos = C_("Components/Drives/Servo Positioning", "Positioning", [E_("Jog Velocity", "servo.jog_velocity", "IN/SEC", "#,##0.0000"), E_("Positioning Velocity", "servo.pos_velocity", "IN/SEC", "#,##0.0000"),
      E_("Gap Position", "servo.gap_position", "IN", "#,##0.0000"), B_([["Move to Position", "servo.pb_move_to_position", "cal1615/btn-start"]])], 400);
    cardsPage(`${MV}/Servo Drives`, [flexCard("os", servo("os", "Operator Side Servo"), "400px"), flexCard("ds", servo("ds", "Drive Side Servo"), "400px"), flexCard("positioning", pos, "400px")]);
    pages["/servo-drives"] = `${MV}/Servo Drives`;

    // I/O: one card per module, one row per point, labelled with the PLC I/O comment.
    const mods = (Array.isArray(TAGMAP["io.modules"]) ? TAGMAP["io.modules"] : []).filter((m) => m.data_base && /^(DI|DO|AI|AO|AI-TC)$/.test(m.kind));
    const pointPath = (m, k) => { const pat = m.point_pattern || ""; if (/\{n\}/.test(pat)) return pat.replace(/\{n\}/g, String(k)); if (/^A/.test(m.kind)) return `${m.data_base.replace(/Ch\d+Data$/, "")}Ch${k}Data`; return `${m.data_base}.${k}`; };
    const racks = [];
    mods.forEach((m, i) => {
      nameSeq = 0;
      const rows = [];
      if (m.fault_tag) rows.push(lampRow("fault", "Module Fault", tagOf(m.fault_tag, "BOOL"), "#FF2020", "#00E000", false));
      for (let k = 0; k < Math.min(+m.points || 16, 32); k++) {
        const text = `${k}  ${(m.labels || {})[k] || ""}`.trim();
        rows.push(/^D/.test(m.kind) ? lampRow(`p${k}`, text, tagOf(pointPath(m, k), "BOOL"), m.kind === "DO" ? "#FFA000" : "#00E000", "#D0D0D0", false)
          : valueRow(`p${k}`, text, tagOf(pointPath(m, k), m.kind === "AI-TC" ? "REAL" : "INT"), "", "#,##0.0"));
      }
      const rack = m.rack.replace(/\s*\(.*\)$/, "");
      const vp = `Components/IO/${rack}/Slot ${m.slot} ${m.catalog.replace(/\//g, "-")}`;
      const hh = cardView(vp, `Slot ${m.slot} · ${m.catalog} · ${m.kind}`, rows, 360);
      let rk = racks.find((x) => x.name === rack); if (!rk) racks.push((rk = { name: rack, cards: [] }));
      rk.cards.push({ path: vp, h: hh });
    });
    cardsPage(`${MV}/IO`, racks.flatMap((rk, ri) => [
      label(`rack${ri}`, rk.name, { style: { fontSize: "20px", fontWeight: "bold", borderBottomStyle: "solid", borderBottomWidth: "2px", borderBottomColor: "var(--callToAction)" } }, { basis: "100%", grow: 1, shrink: 0 }),
      ...rk.cards.map((c, i) => flexCard(`r${ri}m${i}`, c, "360px")),
    ]));
    pages["/io"] = `${MV}/IO`;

    // PM schedule: table from the cal1615.pm script (tasks in memory tag HMI/pm_tasks) + task form.
    const act = (nm, text, enabled, script, cls = "cal1615/btn") => ({ type: "ia.input.button", meta: { name: nm }, position: { basis: "44px", shrink: 0 }, props: { text, style: { classes: cls } },
      propConfig: { "props.enabled": expr(enabled) }, events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script: script + "\n\tself.view.custom.rev += 1" } } } } });
    const sel = `${canOperate} && {view.custom.selected} >= 0`;
    writeView(`${MV}/PM Schedule`, view({ size: { width: PAGE_W, height: PAGE_H }, custom: { selected: -1, task: "", interval: 0, rev: 0 },
      root: flex("root", [
        flex("schedule", [
          label("title", "Preventive Maintenance Schedule", { style: { fontSize: "22px", fontWeight: "bold", textAlign: "center" } }, { basis: "40px", shrink: 0 }),
          label("runTime", "", { style: { textAlign: "center" } }, { basis: "24px", shrink: 0 }, { propConfig: { "props.text": tagBind(T("pm.run_time") || T("line.run_time_hrs"),
            { transforms: [{ type: "expression", expression: '"Run Time: " + numberFormat({value}, "#,##0") + " hours"' }] }) } }),
          { type: "ia.display.table", meta: { name: "table" }, position: { grow: 1, basis: "300px" },
            props: { selection: { mode: "single" }, columns: [{ field: "Task", header: { title: "Task" }, width: 360 }, { field: "Remaining", header: { title: "Remaining" }, width: 120, justify: "right" },
              { field: "Interval", header: { title: "Interval" }, width: 120, justify: "right" }, { field: "Units", header: { title: "Units" }, width: 100 }] },
            propConfig: { "props.data": expr("toMillis(now(10000)) + {view.custom.rev}", [{ type: "script", code: "\treturn cal1615.pm.rows()" }]) },
            events: { component: { onRowClick: { type: "script", scope: "G", config: { script: "\tself.view.custom.selected = event.rowIndex\n\tself.view.custom.task = event.value['Task']\n\tself.view.custom.interval = event.value['Interval']" } } } } },
        ], { direction: "column", style: { classes: "cal1615/card", padding: "8px", margin: "4px", gap: "4px" } }, { grow: 3, shrink: 0, basis: "600px" }),
        flex("task", [
          label("title", "Maintenance Task", { style: { fontSize: "18px", fontWeight: "bold", textAlign: "center" } }, { basis: "36px", shrink: 0 }),
          { type: "ia.input.text-field", meta: { name: "taskName" }, position: { basis: "34px", shrink: 0 }, props: { placeholder: "task" },
            propConfig: { "props.text": { binding: { type: "property", config: { path: "view.custom.task", bidirectional: true } } } } },
          flex("intervalRow", [label("l", "Interval (hours)", {}, { grow: 1, basis: "0" }),
            { type: "ia.input.numeric-entry-field", meta: { name: "interval" }, position: { basis: "110px", shrink: 0 }, props: { format: "#,##0", style: { classes: "cal1615/entry" } },
              propConfig: { "props.value": { binding: { type: "property", config: { path: "view.custom.interval", bidirectional: true } } } } }], { direction: "row", alignItems: "stretch" }, { basis: "30px", shrink: 0 }),
          act("create", "Create", `${canOperate} && len(trim({view.custom.task})) > 0 && {view.custom.interval} > 0`, "\tcal1615.pm.add(self.view.custom.task.strip(), self.view.custom.interval)"),
          act("modify", "Modify", sel, "\tcal1615.pm.update(self.view.custom.selected, self.view.custom.task.strip(), self.view.custom.interval)"),
          act("delete", "Delete", sel, "\tcal1615.pm.delete(self.view.custom.selected)\n\tself.view.custom.selected = -1", "cal1615/btn-stop"),
          act("reset", "Reset", sel, "\tcal1615.pm.reset(self.view.custom.selected)", "cal1615/btn-start"),
        ], { direction: "column", style: { classes: "cal1615/card", padding: "10px", margin: "4px", gap: "8px" } }, { grow: 1, shrink: 0, basis: "260px" }),
      ], { direction: "row", wrap: "wrap", alignContent: "flex-start", alignItems: "flex-start", style: { padding: "6px" } }) }));
    pages["/pm-schedule"] = `${MV}/PM Schedule`;
  }

  // ---------------------------------------------------------------- Trending: oven trend (preset pens, tag browser on)
  {
    const tv = chart("chart", [["Zone 1 Temp", "zone1.temp"], ["Zone 1 SP", "zone1.temp_sp"], ["Zone 2 Temp", "zone2.temp"], ["Zone 2 SP", "zone2.temp_sp"],
      ["Zone 3 Temp", "zone3.temp"], ["Zone 3 SP", "zone3.temp_sp"], ["Roll Cooling Temp", "cooling.temp"], ["Splice Platen Temp", "splice.temp"]], { grow: 1, basis: "400px" }, true);
    writeView(`${FV}/Trending/Oven Trend`, view({ size: { width: PAGE_W, height: PAGE_H }, root: flex("root", [tv], { direction: "column", style: { padding: "6px" } }) }));
    pages["/oven-trend"] = `${FV}/Trending/Oven Trend`;
  }
  return { pages };
};
