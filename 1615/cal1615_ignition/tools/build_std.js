// One-time conversion: build the cal1615 project from the cal2016 project (template) with standard
// Perspective components. Output: 1615/cal1615_std (gateway project cal1615_std). After this, maintain
// the project in the Designer.
//   node build_std.js <cal2016 project dir>
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SRC = process.argv[2];
const OUT = path.resolve(__dirname, "../../cal1615_std");
const P = path.join(OUT, "com.inductiveautomation.perspective");
const V = path.join(P, "views");
const PROVIDER = "cal1615";
const NOW = "2026-09-29T00:00:00Z";
const IMG = "/system/images/Custom/cal1615";

// ------------------------------------------------------------------ tag maps (from the earlier work)
const TAGMAP = {};
for (const f of fs.readdirSync(__dirname).filter((f) => /^tagmap.*\.json$/.test(f))) Object.assign(TAGMAP, JSON.parse(fs.readFileSync(path.join(__dirname, f))));
// Same tag naming as the imported tag file: PLC path mirrored as folders ([n] -> _n_, bit .n -> bit_n).
const plcSegments = (plc) => {
  const m = /^Program:(\w+)\.(.*)$/.exec(plc);
  const segs = (m ? m[2] : plc).split(".").map((s) => s.replace(/\[(\d+)\]/g, "_$1_").replace(/:/g, "_")).map((s) => (/^\d+$/.test(s) ? "bit_" + s : s));
  return m ? ["Program_" + m[1], ...segs] : segs;
};
const tagOf = (plc, type) => {
  if (!plc) return "";
  const segs = plcSegments(plc);
  if (type === "STRING") segs.push(segs[segs.length - 1]);
  return `[${PROVIDER}]${segs.join("/")}`;
};
const T = (id) => (TAGMAP[id] && TAGMAP[id].tag ? tagOf(TAGMAP[id].tag, TAGMAP[id].type) : "");
const TW = (id) => (TAGMAP[id] && (TAGMAP[id].write || TAGMAP[id].tag) ? tagOf(TAGMAP[id].write || TAGMAP[id].tag, TAGMAP[id].type) : "");
// Zone tags differ per zone (and are not symmetric: zone 1 p11_ai_exh_rpm, zone 2 p12_ai_exhaust_rpm), so
// each zone's paths live in the project script cal1615.zones (PATHS[zone][field]). Views get them via
// custom.t = runScript("cal1615.zones.paths", 0, {view.params.zone}) and bind indirectly to {view.custom.t.<field>}.
// Z(field) returns markers that tagBind/pyPath turn into those references.
const ZONE_PATHS = { 1: {}, 2: {}, 3: {} };
const zoneField = (f) => {
  let separateWrite = false;
  for (const n of [1, 2, 3]) {
    const r = T(`z${n}.${f}`) || T(`zone${n}.${f}`), w = TW(`z${n}.${f}`) || TW(`zone${n}.${f}`);
    ZONE_PATHS[n][f] = r;
    if (w && w !== r) { ZONE_PATHS[n][f + "_w"] = w; separateWrite = true; }
  }
  return { read: `@z:${f}`, write: separateWrite ? `@z:${f}_w` : `@z:${f}` };
};

// ------------------------------------------------------------------ resource helpers
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2)); };
const resource = (files, extra = {}) => ({ scope: "G", version: 1, restricted: false, overridable: true, files, attributes: { lastModification: { actor: "claude", timestamp: NOW }, ...extra } });
const writeView = (vpath, v) => { write(path.join(V, vpath, "view.json"), v); write(path.join(V, vpath, "resource.json"), resource(["view.json"])); };
const writeStyle = (name, style) => { write(path.join(P, "style-classes", name, "style.json"), style); write(path.join(P, "style-classes", name, "resource.json"), resource(["style.json"])); };
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });
const copyDir = (a, b) => fs.cpSync(a, b, { recursive: true });

// ------------------------------------------------------------------ component helpers (standard Perspective)
const inParams = (params) => Object.fromEntries(Object.keys(params).map((k) => ["params." + k, { paramDirection: "input", persistent: true }]));
const view = ({ params = {}, size, root, custom = {}, propConfig = {} }) => ({ custom, params, propConfig: { ...inParams(params), ...propConfig }, props: size ? { defaultSize: size } : {}, root });
const flex = (name, children, props = {}, position = {}, extra = {}) => ({ type: "ia.container.flex", meta: { name }, position, props, children, ...extra });
const label = (name, text, props = {}, position = {}, extra = {}) => ({ type: "ia.display.label", meta: { name }, position, props: { text, ...props }, ...extra });
const expr = (e, transforms) => ({ binding: { type: "expr", config: { expression: e }, ...(transforms ? { transforms } : {}) } });
// Tag binding: a fixed path, or a zone pattern resolved from {view.params.zone}.
const tagBind = (p, { bidirectional = false, transforms } = {}) => {
  if (!p) return undefined;
  const config = p.startsWith("@z:")
    ? { fallbackDelay: 2.5, mode: "indirect", references: { "0": `{view.custom.t.${p.slice(3)}}` }, tagPath: "{0}", bidirectional }
    : { fallbackDelay: 2.5, mode: "direct", tagPath: p, bidirectional };
  return { binding: { type: "tag", config, ...(transforms ? { transforms } : {}) } };
};
// Zone views: custom.t holds this zone's tag paths (from the cal1615.zones script).
const zoneCustom = { custom: { t: {} }, propConfig: { "custom.t": expr('runScript("cal1615.zones.paths", 0, {view.params.zone})') } };
// Hide a row when this zone has no tag for it (zone 3 has no burner, LFL or pressure).
const hideIfMissing = (p) => (p && p.startsWith("@z:") ? { "position.display": expr(`len({view.custom.t.${p.slice(3)}}) > 0`) } : {});
const fmt = (f) => ({ type: "format", formatType: "numeric", formatValue: f });
const mapT = (outputType, mappings, fallback) => ({ type: "map", inputType: "scalar", outputType, mappings: mappings.map(([input, output]) => ({ input, output })), fallback });
// Resolve a pattern path in scripts: '[cal1615]p1{0}_x'.replace('{0}', str(self.view.params.zone)).
const pyPath = (p) => (p.startsWith("@z:") ? `self.view.custom.t['${p.slice(3)}']` : `'${p}'`);
const canOperate = "{session.props.auth.authenticated}";

// Row: title label | value | units, 28px tall with a 22px value box.
const ROW_H = 28;
const row = (name, title, valueComp, units = "", p = "") => flex(name, [
  label("title", title, { style: { classes: "cal1615/row-label" } }, { grow: 1, basis: "0" }),
  valueComp,
  ...(units === null ? [] : [label("units", units, { style: { classes: "cal1615/units" } }, { basis: "34px", shrink: 0 })]),
], { direction: "row", alignItems: "stretch", style: { paddingLeft: "6px", paddingRight: "6px", paddingTop: "3px", paddingBottom: "3px", gap: "4px" } }, { basis: ROW_H + "px", shrink: 0 }, { propConfig: hideIfMissing(p) });
// Read-only value: Label with a tag binding and a numeric format transform.
const valueRow = (name, title, p, units = "", format = "#,##0.0") => row(name, title,
  label("value", "---", { style: { classes: "cal1615/value" } }, { basis: "100px", shrink: 0 }, p ? { propConfig: { "props.text": tagBind(p, { transforms: [fmt(format)] }) } } : {}), units, p);
// Setpoint: Numeric Entry Field. Same read/write tag -> bidirectional binding; otherwise the entry
// writes the write tag on commit (onActionPerformed).
const entryRow = (name, title, rp, wp, units = "", format = "#,##0.0") => {
  const same = !wp || wp === rp;
  return row(name, title, {
    type: "ia.input.numeric-entry-field", meta: { name: "entry" }, position: { basis: "100px", shrink: 0 },
    props: { format, spinner: { enabled: false }, style: { classes: "cal1615/entry" } },
    propConfig: { "props.value": tagBind(rp, { bidirectional: same }), "props.enabled": expr(canOperate) },
    ...(same ? {} : { events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script:
      `\t# Setpoint is read from ${rp.replace(/^\[[^\]]+\]/, "")} but written to the HMI input the PLC copies from.\n\tsystem.tag.writeBlocking([${pyPath(wp)}], [self.props.value])` } } } } }),
  }, units, rp);
};
// Status: Label whose text and colour come from Map transforms on the status tag.
const statusRow = (name, title, p, states) => row(name, title,
  label("status", "---", { style: { classes: "cal1615/status" } }, { basis: "100px", shrink: 0 }, p ? { propConfig: {
    "props.text": tagBind(p, { transforms: [mapT("scalar", states.map(([v, t]) => [v, t]), "---")] }),
    "props.style.backgroundColor": tagBind(p, { transforms: [mapT("color", states.map(([v, , c]) => [v, c]), "#FFFFFF")] }),
  } } : {}), "", p);
// Lamp: small label coloured by a boolean tag (Map transform); invert swaps the colours.
const lamp = (name, p, on = "#00E000", off = "#D0D0D0", invert = false, position = { basis: "34px", shrink: 0 }, text = "") =>
  label(name, text, { style: { classes: "cal1615/led" } }, position, p ? { propConfig: {
    "props.style.backgroundColor": tagBind(p, { transforms: [mapT("color", [[true, invert ? off : on], [false, invert ? on : off]], "#FF00FF")] }) } } : {});
const lampRow = (name, title, p, on, off, invert) => row(name, title,
  flex("box", [lamp("lamp", p, on, off, invert)], { direction: "row", justify: "flex-start" }, { basis: "100px", shrink: 0 }), "", p);
// Button writing a PLC pushbutton bit: 1, then back to 0 after 0.5 s.
const pulseScript = (p) => `\ttag = ${pyPath(p)}\n\tsystem.tag.writeBlocking([tag], [True])\n\tdef release(tag=tag):\n\t\timport time\n\t\ttime.sleep(0.5)\n\t\tsystem.tag.writeBlocking([tag], [False])\n\tsystem.util.invokeAsynchronous(release)`;
const button = (name, text, p, cls = "cal1615/btn") => ({
  type: "ia.input.button", meta: { name }, position: { grow: 1, basis: "0" }, props: { text, style: { classes: cls } },
  propConfig: { "props.enabled": expr(canOperate) },
  events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script: pulseScript(p) } } } },
});
const buttonRow = (name, buttons) => flex(name, buttons, { direction: "row", style: { gap: "6px", padding: "4px 6px" } }, { basis: "42px", shrink: 0 });
// Card: header label and rows. Height = header + rows, so it never clips.
const rowHeight = (r) => parseInt(r.position.basis, 10);
const card = (name, title, rows) => flex(name, [
  label("header", title, { style: { classes: "cal1615/card-header" } }, { basis: "26px", shrink: 0 }),
  ...rows,
], { direction: "column", style: { classes: "cal1615/card", paddingBottom: "4px" } }, {}, { height: 26 + rows.reduce((a, r) => a + rowHeight(r), 0) + 6 });
const cardView = (vpath, title, rows, width = 320, params = {}) => {
  const c = card("root", title, rows);
  const h = c.height; delete c.height;
  writeView(vpath, view({ params, size: { width, height: h }, root: c, ...(params.zone !== undefined ? zoneCustom : {}) }));
  return h;
};
const embed = (name, vpath, params, position, props = {}) => ({ type: "ia.display.view", meta: { name }, position, props: { path: vpath, params, ...props } });

// ------------------------------------------------------------------ 1) template copy and configuration
rmrf(OUT);
copyDir(SRC, OUT);
// Drop cal2016 machine content and modules this project does not use.
const DROP = [
  "com.inductiveautomation.reporting", "com.inductiveautomation.sqlbridge", "com.inductiveautomation.webdev", "com.inductiveautomation.vision",
  "ignition/named-query/Recipe Line", "ignition/named-query/Recipe Oven", "ignition/named-query/Reports", "ignition/named-query/Ignition 101",
  ...["Components/Line", "Components/Oven", "Components/Recipe", "Components/PID/PID Control", "Templates", "Embeded",
    "Framework/Dock Oven Control", "MainViews/Feature Views/Ovens", "MainViews/Feature Views/Settings", "MainViews/Feature Views/Home/Recipe - Large",
    "MainViews/Feature Views/Home/Recipe - Small", "MainViews/Feature Views/Home/Recipe - Main", "MainViews/Feature Views/Home/Splice Tracking",
    "MainViews/Feature Views/Home/Overview - Small", "MainViews/Feature Views/Home/OverviewCoordinate", "MainViews/Feature Views/Trending/Oven Trend 1",
    "MainViews/Feature Views/Trending/Oven Trend 2", "MainViews/Feature Views/Trending/Oven Trend 3", "MainViews/Feature Views/Trending/Oven Trend 4",
    "MainViews/Feature Views/Trending/Oven Trend 5", "MainViews/Feature Views/Trending/Misc Trend 1", "MainViews/Feature Views/Trending/Misc Trend 2",
    "MainViews/Feature Views/Trending/Misc Trend 3", "MainViews/Feature Views/Framework/Reports", "MainViews/Nav/Settings", "MainViews/Nav/Ovens",
  ].map((v) => "com.inductiveautomation.perspective/views/" + v),
];
DROP.forEach((d) => rmrf(path.join(OUT, d)));
// Tag provider [cal2016] -> [cal1615] in every remaining text resource.
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
let replaced = 0;
for (const f of walk(OUT).filter((f) => /\.(json|py|sql|css)$/.test(f))) {
  const s = fs.readFileSync(f, "utf8");
  if (s.includes("cal2016")) { replaced++; fs.writeFileSync(f, s.split("[cal2016]").join(`[${PROVIDER}]`)); }
}
write(path.join(OUT, "project.json"), { title: "cal1615", description: "Park cal1615 line HMI. Built from the cal2016 project template.", parent: "", enabled: true, inheritable: false });
// Project properties: default tag provider cal1615 (global-props is gzip'd binary; "cal2016" and
// "cal1615" have the same length, so the in-place swap keeps the structure intact).
{
  const f = path.join(OUT, "ignition/global-props/data.bin");
  const raw = zlib.gunzipSync(fs.readFileSync(f));
  const from = Buffer.from("cal2016"), to = Buffer.from(PROVIDER);
  let n = 0;
  for (let i = raw.indexOf(from); i >= 0; i = raw.indexOf(from, i + 1)) { to.copy(raw, i); n++; }
  fs.writeFileSync(f, zlib.gzipSync(raw));
  console.log("global-props: default tag provider occurrences replaced:", n);
}
// Perspective properties: identity provider "default".
{
  const f = path.join(P, "general-properties/data.bin");
  const gp = JSON.parse(fs.readFileSync(f, "utf8"));
  gp.idp = null; // null = the gateway default identity provider ("default"), as in cal2016
  gp.thumbnailPath = "Custom/LitzlerLogo.jpg";
  fs.writeFileSync(f, JSON.stringify(gp, null, 2));
}
console.log("files with cal2016 tag paths updated:", replaced);

// 1615 style classes (cards, rows, values) next to the cal2016 ones.
const S = {
  "cal1615/card": { base: { style: { backgroundColor: "var(--neutral-20)", borderColor: "var(--neutral-50)", borderStyle: "solid", borderWidth: "1px", borderRadius: "4px", overflow: "hidden" } } },
  "cal1615/card-header": { base: { style: { backgroundColor: "var(--callToAction)", color: "#FFFFFF", fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", textAlign: "center", lineHeight: "26px" } } },
  "cal1615/row-label": { base: { style: { fontFamily: "Arial", fontSize: "13px", color: "var(--neutral-90)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "22px" } } },
  "cal1615/value": { base: { style: { height: "22px", lineHeight: "20px", boxSizing: "border-box", padding: "0 3px", overflow: "hidden", whiteSpace: "nowrap", backgroundColor: "var(--neutral-10)", borderColor: "var(--neutral-60)", borderStyle: "solid", borderWidth: "1px", borderRadius: "2px", fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", textAlign: "right", color: "var(--neutral-100)" } } },
  "cal1615/entry": { base: { style: { height: "22px", lineHeight: "20px", boxSizing: "border-box", padding: "0 3px", overflow: "hidden", whiteSpace: "nowrap", backgroundColor: "#B8F4FF", color: "#000000", borderColor: "#0097A7", borderStyle: "solid", borderWidth: "1px", borderRadius: "2px", fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", textAlign: "right" } } },
  "cal1615/status": { base: { style: { height: "22px", lineHeight: "20px", boxSizing: "border-box", padding: "0 3px", overflow: "hidden", whiteSpace: "nowrap", borderColor: "var(--neutral-60)", borderStyle: "solid", borderWidth: "1px", borderRadius: "2px", fontFamily: "Arial", fontSize: "12px", fontWeight: "bold", textAlign: "center", color: "#000000" } } },
  "cal1615/units": { base: { style: { whiteSpace: "nowrap", minWidth: "26px", lineHeight: "22px", fontFamily: "Arial", fontSize: "12px", color: "var(--neutral-70)" } } },
  "cal1615/led": { base: { style: { borderColor: "var(--neutral-70)", borderStyle: "solid", borderWidth: "1px", borderRadius: "10px", fontFamily: "Arial", fontSize: "12px", textAlign: "center", color: "#000000" } } },
  "cal1615/btn": { base: { style: { fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", borderRadius: "3px" } } },
  "cal1615/btn-start": { base: { style: { backgroundColor: "#2E7D32", color: "#FFFFFF", fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", borderRadius: "3px" } }, variants: [{ pseudo: "disabled", style: { opacity: 0.45 } }] },
  "cal1615/btn-stop": { base: { style: { backgroundColor: "#D32F2F", color: "#FFFFFF", fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", borderRadius: "3px" } }, variants: [{ pseudo: "disabled", style: { opacity: 0.45 } }] },
  "cal1615/drawing": { base: { style: { backgroundColor: "#FFFFFF", borderRadius: "4px" } } },
  "cal1615/page-title": { base: { style: { fontFamily: "Arial", fontSize: "26px", fontWeight: "bold", textAlign: "center" } } },
};
for (const [k, v] of Object.entries(S)) writeStyle(k, v);

// ------------------------------------------------------------------ 2) navigation for 1615 (cal2016 structure)
const NAV = [
  { key: "Home", text: "Main", pages: [["Overview", "/overview"], ["Oven Control", "/oven-control"], ["Active Recipe", "/active-recipe"], ["Recipe", "/recipe"], ["Emergency Stops", "/emergency-stops"]] },
  { key: "Ovens", text: "Oven Zones", pages: [["Zone 1", "/zone/1"], ["Zone 2", "/zone/2"], ["Zone 3", "/zone/3"], ["Advanced Cooling", "/advanced-cooling"]] },
  { key: "Line", text: "Line Drives", pages: [["Let-Off / Splice", "/letoff-splice"], ["Accumulator / TS1", "/accumulator-ts1"], ["TS2 / Poly / Windup", "/ts2-poly-windup"]] },
  { key: "Maintenance", text: "Maintenance", pages: [["I/O", "/io"], ["Zone Setup", "/zone-setup"], ["VFD Drives", "/vfd-drives"], ["Servo Drives", "/servo-drives"], ["PM Schedule", "/pm-schedule"]] },
  { key: "Trending", text: "Trending", pages: [["Oven Trend", "/oven-trend"], ["Trend", "/trend"]] },
  { key: "Application", text: "Alarms", pages: [["Alarms", "/alarms"], ["Warnings", "/warnings"], ["History", "/history"]] },
];
const navItem = (text, target) => ({ backActionText: "", enabled: true, items: [], label: { icon: { path: "" }, text }, navIcon: { color: "", path: "" }, resetOnClick: false, showHeader: true, style: {}, target, visible: true });
// Selected-page highlight as in cal2016 (framework/sidebar-items-selected bound to page.props.path).
const selectedBinding = (target) => ({ binding: { type: "property", config: { path: "page.props.path" }, transforms: [{ type: "script",
  code: `\tif value == '${target}' or (value == '/' and '${target}' == '/overview'):\n\t\treturn 'framework/sidebar-items-selected'\n\treturn 'framework/sidebar-items'` }] } });
for (const s of NAV) {
  writeView(`MainViews/Nav/${s.key}`, view({ size: { width: 260, height: 46 * s.pages.length + 4 },
    root: flex("root", [{ type: "ia.navigation.menutree", meta: { name: "MenuTree" }, position: { basis: "100%", shrink: 0 },
      props: { itemStyle: { classes: "framework/sidebar-items" }, items: s.pages.map(([t, u]) => navItem(t, u)) },
      propConfig: Object.fromEntries(s.pages.map(([, u], i) => [`props.items[${i}].style.classes`, selectedBinding(u)])) }], { direction: "column" }) }));
}
// Sidebar accordion: one section per NAV group (cal2016 Sidebar Dock Nav, with its expand/collapse buttons).
{
  const f = path.join(V, "MainViews/Nav/Sidebar Dock Nav/view.json");
  const sd = JSON.parse(fs.readFileSync(f, "utf8"));
  const acc = sd.root.children[0];
  const tmpl = acc.props.items[0];
  acc.props.items = NAV.map((s, i) => ({ ...JSON.parse(JSON.stringify(tmpl)), expanded: i === 0,
    body: { ...tmpl.body, viewPath: `MainViews/Nav/${s.key}` }, header: { ...JSON.parse(JSON.stringify(tmpl.header)), content: { ...tmpl.header.content, text: s.text } } }));
  const allExpanded = (v) => "if(\n" + NAV.map((_, i) => `\t{.../Accordion.props.items[${i}].expanded} = ${v}`).join(" && \n") + ",\n\tfalse, true)";
  const pinButton = ({
    type: "ia.input.button", meta: { name: "btn-pin" }, position: { basis: "40px", shrink: 0 },
    props: { text: "", image: { height: 16, width: 16, icon: { path: "material/push_pin" } }, primary: false, style: {} },
    propConfig: {
      "props.primary": { binding: { type: "property", config: { path: "session.custom.navPinned" } } },
      "props.tooltip.text": expr('if({session.custom.navPinned}, "Unpin menu", "Pin menu open")'),
      "props.tooltip.enabled": expr("true"),
    },
    events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script:
      "\t# Pinned: the menu stays open and pushes the page. The docks are shared, so this carries across pages.\n" +
      "\tpinned = not self.session.custom.navPinned\n" +
      "\tself.session.custom.navPinned = pinned\n" +
      "\tif pinned:\n\t\tsystem.perspective.alterDock('Menu', {'show': 'visible', 'content': 'push'})\n" +
      "\telse:\n\t\tsystem.perspective.alterDock('Menu', {'show': 'onDemand', 'content': 'push'})\n\t\tsystem.perspective.closeDock('Menu')" } } } },
  });
  // Header row above the accordion: title and the pin button (cal2016's expand/collapse row stays as it was).
  sd.root.children.unshift(flex("pinRow", [
    label("title", "Navigation", { style: { fontWeight: "bold", paddingLeft: "0.5rem" } }, { grow: 1, basis: "0" }),
    pinButton,
  ], { direction: "row", alignItems: "center", style: { padding: "0.25rem 0.5rem", borderBottomStyle: "solid", borderBottomWidth: "1px", borderBottomColor: "var(--neutral-50)" } }, { basis: "44px", shrink: 0 }));
  for (const b of sd.root.children[2].children) {
    const v = b.meta.name === "btn-expand" ? "true" : "false";
    if (b.propConfig && b.propConfig["props.enabled"]) b.propConfig["props.enabled"].binding.config.expression = allExpanded(v);
  }
  fs.writeFileSync(f, JSON.stringify(sd, null, 2));
}
// Header: re-apply a pinned menu after every navigation (page changes reset docks to their configured state).
{
  const f = path.join(V, "Framework/Header/view.json");
  const hv = JSON.parse(fs.readFileSync(f, "utf8"));
  hv.custom = { ...(hv.custom || {}), navState: "" };
  hv.propConfig = { ...(hv.propConfig || {}), "custom.navState": {
    binding: { type: "expr", config: { expression: '{page.props.path} + "|" + {session.custom.navPinned}' } },
    // After a navigation the page re-applies its dock config; re-pin just after that.
    onChange: { enabled: null, script:
      "\tif not self.session.custom.navPinned:\n\t\treturn\n" +
      "\tpageId = self.page.props.pageId\n\tsessionId = self.session.props.id\n" +
      "\tdef pin():\n\t\timport time\n\t\ttime.sleep(0.4)\n" +
      "\t\tsystem.perspective.alterDock('Menu', {'show': 'visible', 'content': 'push'}, sessionId=sessionId, pageId=pageId)\n" +
      "\t\tsystem.perspective.openDock('Menu', sessionId=sessionId, pageId=pageId)\n" +
      "\t\tsystem.util.getLogger('cal1615.nav').debug('menu re-pinned for ' + str(pageId))\n" +
      "\tsystem.util.invokeAsynchronous(pin)" } } };
  fs.writeFileSync(f, JSON.stringify(hv, null, 2));
}
// Mobile dock menu (Dock Main Nav): same tree.
{
  const f = path.join(V, "Framework/Dock Main Nav/view.json");
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  const mt = d.root.children[0];
  const hdr = mt.props.items[0];
  mt.props.items = NAV.map((s) => ({ ...JSON.parse(JSON.stringify(hdr)), label: { ...hdr.label, text: s.text }, target: s.pages[0][1],
    items: s.pages.map(([t, u]) => ({ ...JSON.parse(JSON.stringify(hdr.items[0])), label: { ...hdr.items[0].label, text: t }, target: u })) }));
  fs.writeFileSync(f, JSON.stringify(d, null, 2));
}
// Header main nav (top): one item per section, underlined when the page is in it (cal2016 framework/header-selected).
{
  const f = path.join(V, "Framework/Header Main Nav/view.json");
  const h = JSON.parse(fs.readFileSync(f, "utf8"));
  const hm = h.root.children[0];
  const it = hm.props.items[0];
  hm.props.items = NAV.map((s) => ({ ...JSON.parse(JSON.stringify(it)), label: s.text, target: s.pages[0][1], items: [] }));
  hm.propConfig = Object.fromEntries(NAV.map((s, i) => [`props.items[${i}].style.classes`, { binding: { type: "expr", config: {
    expression: `if(${s.pages.map(([, u]) => `{page.props.path} = "${u}"`).concat(s.key === "Home" ? ['{page.props.path} = "/"'] : []).join(" || ")}, "framework/header-selected", "")` } } }]));
  fs.writeFileSync(f, JSON.stringify(h, null, 2));
}

// ------------------------------------------------------------------ 3) Zone pages (standard components)
const ZONE_STATUS = [[1, "Off", "#D0D0D0"], [2, "Idle", "#FFFFFF"], [3, "Start Recirc", "#FFFF80"], [4, "Start Exhaust", "#FFFF80"], [5, "Wait Safeties", "#FFFF80"],
  [6, "Safeties Made", "#FFFF80"], [7, "Purge", "#FFFF80"], [8, "Burner Lit", "#FFFF80"], [9, "Heat to SP", "#FFFF80"], [10, "Control to SP", "#00E000"],
  [11, "Cooldown", "#9FD8FF"], [12, "Cooldown Fans", "#9FD8FF"], [13, "Complete", "#FFFFFF"], [31, "Manual", "#FFA040"]];
const FAN_STATUS = [[1, "OK", "#00E000"], [2, "Running", "#00E000"], [3, "Stopped", "#D0D0D0"], [4, "Faulted", "#FF6060"], [5, "Default", "#D0D0D0"]];
const HEAT_STATUS = [[0, "---", "#D0D0D0"], [1, "Permissive OK", "#00E000"], [2, "Heat Requested", "#FFFF80"], [4, "Not Permissive", "#FF6060"], [7, "Burner Not Auto", "#FF6060"], [8, "Manual", "#FFA040"]];
const Z = (t) => zoneField(t);
const zp = { zone: 1 };
const ZC = "Components/Oven/Zone";
const hZoneStatus = cardView(`${ZC}/Zone Status`, "Zone", [
  lampRow("lflHighWarning", "Lower Flash Limit High Warning", Z("led_lfl_high_warning").read, "#FFFF00", "#00E000"),
  lampRow("lflAlarm", "Lower Flash Limit Alarm", Z("led_lfl_alarm").read, "#FF2020", "#00E000"),
  lampRow("zoneFaultsOk", "Zone Faults OK", Z("led_zone_faults_ok").read, "#00E000", "#FF2020"),
  lampRow("vfdsReady", "VFDs Ready", Z("led_vfds_ready").read, "#00E000", "#FF2020"),
  statusRow("heat", "Heat", Z("heat_status").read, HEAT_STATUS),
  buttonRow("buttons", [button("startHeat", "Start Heat", Z("pb_start_heat").read, "cal1615/btn-start"), button("stopHeat", "Stop Heat", Z("pb_stop_heat").read, "cal1615/btn-stop")]),
], 320, zp);
// The card title shows the zone number.
{
  const f = path.join(V, `${ZC}/Zone Status/view.json`); const j = JSON.parse(fs.readFileSync(f));
  j.root.children[0].propConfig = { "props.text": expr('"Zone " + {view.params.zone}') }; fs.writeFileSync(f, JSON.stringify(j, null, 2));
}
const hChamber = cardView(`${ZC}/Chamber Data`, "Chamber Data", [
  valueRow("pressure", "Zone Pressure", Z("pressure").read, '"wc', "#,##0.000"),
  valueRow("lfl", "Lower Flash Limit", Z("lfl").read, "%"),
], 300, zp);
const tempSp = Z("temp_sp");
const hTemps = cardView(`${ZC}/Temperature Data`, "Temperature Data", [
  valueRow("controlTemp", "Control Temperature", Z("temp").read, "F"),
  entryRow("tempSp", "Temperature Setpoint", tempSp.read, tempSp.write, "F"),
  valueRow("tc1", "Process Control Temp 1", Z("tc1").read, "F"),
  valueRow("tc2", "Process Control Temp 2", Z("tc2").read, "F"),
], 320, zp);
const hValve = cardView(`${ZC}/Control Valve`, "Control Valve", [
  valueRow("output", "Output", Z("cv_output").read, "%"),
  entryRow("manualSp", "Manual Setpoint", Z("cv_manual_sp").read, Z("cv_manual_sp").write, "%"),
  statusRow("mode", "Mode", Z("cv_auto").read, [[true, "Auto", "#00E000"], [false, "Manual", "#FFA040"]]),
  buttonRow("buttons", [button("auto", "Auto", Z("pb_cv_auto").read), button("manual", "Manual", Z("pb_cv_manual").read)]),
], 300, zp);
const hMotors = cardView(`${ZC}/Motor Data`, "Motor Data", [
  valueRow("exhRpm", "Exhaust Fan", Z("exh_rpm").read, "RPM", "#,##0"),
  entryRow("exhSp", "Exhaust Fan Setpoint", Z("exh_sp").read, Z("exh_sp").write, "RPM", "#,##0"),
  valueRow("recircRpm", "Recirculation Fan", Z("recirc_rpm").read, "RPM", "#,##0"),
  entryRow("recircSp", "Recirc Fan Setpoint", Z("recirc_sp").read, Z("recirc_sp").write, "RPM", "#,##0"),
], 340, zp);

// Carousel arrows: previous / next page within a section (wraps around). One reusable view.
const OVEN_SEQUENCE = ["/zone/1", "/zone/2", "/zone/3", "/advanced-cooling"];
const LINE_SEQUENCE = ["/letoff-splice", "/accumulator-ts1", "/ts2-poly-windup"];
writeView("Framework/Carousel Arrow", view({
  params: { direction: "next", sequence: [] }, size: { width: 36, height: 90 },
  root: flex("root", [{
    type: "ia.display.icon", meta: { name: "arrow" }, position: { grow: 1, basis: "0" },
    props: { path: "material/chevron_right", color: "var(--neutral-90)", style: { cursor: "pointer", backgroundColor: "rgba(128,128,128,0.18)", borderRadius: "6px" } },
    propConfig: { "props.path": expr('if({view.params.direction} = "prev", "material/chevron_left", "material/chevron_right")') },
    events: { dom: { onClick: { type: "script", scope: "G", config: { script:
      "\tseq = list(self.view.params.sequence)\n" +
      "\tpath = self.page.props.path\n" +
      "\ti = seq.index(path) if path in seq else 0\n" +
      "\tstep = -1 if self.view.params.direction == 'prev' else 1\n" +
      "\tsystem.perspective.navigate(page=seq[(i + step) % len(seq)])" } } } },
  }], { direction: "column", justify: "center" }),
}));
const carouselArrows = (sequence, place) => ["left", "right"].map((side) =>
  embed(`arrow_${side}`, "Framework/Carousel Arrow", { direction: side === "left" ? "prev" : "next", sequence }, place(side)));
// Zone detail, desktop: coordinate container (fixed, 1740x1024 = 1920x1080 minus header and sidebar).
// Positions follow the RSView Zone screen (design 1512x920), scaled 1.113 and centred.
// Page = 1920x1080 minus the 56px header and the 240px pinned menu (cal2016 dock sizes).
const PAGE_W = 1920 - 240, PAGE_H = 1080 - 56, DW = 1512, DH = 920;
const s = Math.min(PAGE_W / DW, PAGE_H / DH), ox = (PAGE_W - DW * s) / 2, r = Math.round;
const pos = (x, y, w, h, scaleH = false) => ({ x: r(ox + x * s), y: r(y * s), width: r(w * s), height: r(scaleH ? h * s : h) });
const dx = 8, dy = 50;
const zoneBind = { "props.params.zone": { binding: { type: "property", config: { path: "view.params.zone" } } } };
const zEmbed = (name, vpath, x, y, w, h) => ({ ...embed(name, vpath, { zone: 1 }, pos(x, y, w, h)), propConfig: zoneBind });
const overlayStatus = (name, p, states, x, y, w, stackedTitle) => flex(name, [
  ...(stackedTitle ? [label("title", stackedTitle, { style: { fontSize: "12px", textAlign: "center" } }, { basis: "18px", shrink: 0 })] : []),
  label("status", "---", { style: { classes: "cal1615/status" } }, { basis: "22px", shrink: 0 }, { propConfig: {
    "props.text": tagBind(p, { transforms: [mapT("scalar", states.map(([v, t]) => [v, t]), "---")] }),
    "props.style.backgroundColor": tagBind(p, { transforms: [mapT("color", states.map(([v, , c]) => [v, c]), "#FFFFFF")] }) } }),
], { direction: "column" }, pos(x, y, w, stackedTitle ? 40 : 22));
const burnerVisible = { "position.display": expr("{view.params.zone} < 3") };
const zoneLarge = [
  label("title", "", { style: { classes: "cal1615/page-title" } }, pos(456, 6, 600, 40), { propConfig: { "props.text": expr('"Zone " + {view.params.zone}') } }),
  { type: "ia.display.image", meta: { name: "drawing" }, position: pos(dx, dy, 902, 470, true), props: { source: `${IMG}/zone.png`, fit: { mode: "fill" }, style: { classes: "cal1615/drawing" } } },
  overlayStatus("exhaustStatus", Z("exh_status").read, FAN_STATUS, dx + 318, dy + 36, 128),
  overlayStatus("zoneStatus", Z("status").read, ZONE_STATUS, dx + 226, dy + 90, 128, "Status"),
  overlayStatus("recircStatus", Z("recirc_status").read, FAN_STATUS, dx + 356, dy + 391, 128),
  { ...lamp("lampS", Z("burner_safeties_ok").read, "#00E000", "#FF2020", false, pos(dx + 34, dy + 306, 26, 26), "S"), propConfig: { ...lamp("x", Z("burner_safeties_ok").read, "#00E000", "#FF2020").propConfig, ...burnerVisible } },
  { ...lamp("lampL", Z("flame_on").read, "#00E000", "#FF2020", false, pos(dx + 34, dy + 357, 26, 26), "L"), propConfig: { ...lamp("x", Z("flame_on").read, "#00E000", "#FF2020").propConfig, ...burnerVisible } },
  { ...lamp("lampH", Z("high_limit_ok").read, "#00E000", "#FF2020", false, pos(dx + 73, dy + 357, 26, 26), "H"), propConfig: { ...lamp("x", Z("high_limit_ok").read, "#00E000", "#FF2020").propConfig, ...burnerVisible } },
  { type: "ia.display.icon", meta: { name: "flame" }, position: pos(dx + 214, dy + 332, 60, 40, true), props: { path: "material/whatshot", color: "#FF6D00" },
    propConfig: { "position.display": tagBind(Z("flame_on").read, { transforms: [{ type: "expression", expression: "toBoolean({value}) && {view.params.zone} < 3" }] }) } },
  // Trend: Power Chart with the zone's control temperature and setpoint (pens built from the zone number).
  { type: "ia.chart.powerchart", meta: { name: "trend" }, position: pos(930, 50, 575, 470, true),
    props: { config: { measureOfTime: "hours", unitOfTime: 1 } },
    propConfig: { "props.pens": expr("{view.params.zone}", [{ type: "script", code:
      "\tdef pen(name, tag, color):\n" +
      "\t\tst = lambda o: {'fill': {'color': color, 'opacity': o}, 'stroke': {'color': color, 'dashArray': 0, 'opacity': o, 'width': 1.5}}\n" +
      "\t\treturn {'axis': '', 'name': name, 'plot': 0, 'enabled': True, 'selectable': True, 'visible': True,\n" +
      "\t\t\t'data': {'aggregateMode': 'default', 'source': 'histprov:mySQL:/drv:ignition-4d950438c38c:cal1615:/tag:' + tag},\n" +
      "\t\t\t'display': {'type': 'line', 'breakLine': True, 'interpolation': 'curveLinear', 'radius': 3, 'styles': {'normal': st(0.9), 'highlighted': st(1), 'muted': st(0.4), 'selected': st(1)}}}\n" +
      "\tt = cal1615.zones.paths(value)\n" +
      "\tstrip = lambda p: p.split(']', 1)[-1].lower()\n" +
      "\treturn [pen('Control Temp', strip(t['temp']), '#1F77B4'), pen('Control Setpoint', strip(t['temp_sp']), '#D62728')]" }]) } },
  ...carouselArrows(OVEN_SEQUENCE, (x) => ({ x: x === "left" ? 0 : PAGE_W - 36, y: 330, width: 36, height: 90 })),
  zEmbed("zoneStatus", `${ZC}/Zone Status`, 140, 530, 300, hZoneStatus),
  zEmbed("chamber", `${ZC}/Chamber Data`, 460, 530, 310, hChamber),
  zEmbed("temps", `${ZC}/Temperature Data`, 460, 530 + (hChamber + 10) / s, 310, hTemps),
  zEmbed("valve", `${ZC}/Control Valve`, 140, 530 + (hZoneStatus + 10) / s, 300, hValve),
  zEmbed("motors", `${ZC}/Motor Data`, 790, 530, 330, hMotors),
];
const ZV = "MainViews/Feature Views/Ovens";
writeView(`${ZV}/Zone - Large`, view({ params: { zone: 1 }, size: { width: PAGE_W, height: PAGE_H }, ...zoneCustom,
  root: { type: "ia.container.coord", meta: { name: "root" }, props: { mode: "fixed", style: { classes: "cal1615/page" } }, children: zoneLarge } }));
// Zone detail, mobile: the same cards stacked.
const sEmbed = (name, vpath, h) => ({ ...embed(name, vpath, { zone: 1 }, { basis: h + "px", shrink: 0 }), propConfig: zoneBind });
writeView(`${ZV}/Zone - Small`, view({ params: { zone: 1 }, size: { width: 400, height: 1200 },
  root: flex("root", [sEmbed("zoneStatus", `${ZC}/Zone Status`, hZoneStatus), sEmbed("temps", `${ZC}/Temperature Data`, hTemps), sEmbed("chamber", `${ZC}/Chamber Data`, hChamber),
    sEmbed("valve", `${ZC}/Control Valve`, hValve), sEmbed("motors", `${ZC}/Motor Data`, hMotors)], { direction: "column", style: { gap: "8px", padding: "6px", overflowY: "auto" } }) }));
// Zone - Main: breakpoint like cal2016's "- Main" views. The desktop view keeps its own size.
writeView(`${ZV}/Zone - Main`, view({ params: { zone: 1 },
  root: { type: "ia.container.breakpt", meta: { name: "root" }, props: { breakpoint: 1200 }, children: [
    { ...embed("small", `${ZV}/Zone - Small`, { zone: 1 }, {}), propConfig: zoneBind },
    { ...embed("large", `${ZV}/Zone - Large`, { zone: 1 }, { size: "large" }, { useDefaultViewWidth: true, useDefaultViewHeight: true }), propConfig: zoneBind },
  ] } }));

// ------------------------------------------------------------------ remaining pages
const EXTRA = require("./build_std_pages.js")({ carouselArrows, OVEN_SEQUENCE, LINE_SEQUENCE, fs, path, OUT, V, TAGMAP, T, TW, tagOf, Z, write, resource, writeView, view, flex, label, expr, tagBind, fmt, mapT, pyPath,
  canOperate, row, valueRow, entryRow, statusRow, lamp, lampRow, button, buttonRow, card, cardView, embed, zoneCustom, IMG, ZONE_STATUS, FAN_STATUS, HEAT_STATUS });
// Project script with each zone's tag paths (edit here if a PLC tag changes).
const writeZonesScript = () => {
  const lines = [1, 2, 3].map((n) => `\t${n}: {\n` + Object.entries(ZONE_PATHS[n]).map(([k, v]) => `\t\t'${k}': '${v}',`).join("\n") + "\n\t},").join("\n");
  const dir = path.join(OUT, "ignition/script-python/cal1615/zones");
  write(path.join(dir, "code.py"), `# Oven zone tag paths for the zone views (Components/Oven/Zone/*, Ovens/Zone - *).
# Views read these through custom.t = runScript("cal1615.zones.paths", 0, {view.params.zone}).
# Keys ending in _w are where setpoints are written (the PLC copies them into the live value each scan).
# An empty path hides that row (zone 3 has no burner, LFL or pressure).
PATHS = {
${lines}
}

def paths(zone):
	return PATHS.get(int(zone or 1), {})
`);
  write(path.join(dir, "resource.json"), { ...resource(["code.py"]), scope: "A", attributes: { lastModification: { actor: "claude", timestamp: NOW }, hintScope: 2 } });
};
writeZonesScript();

// ------------------------------------------------------------------ 4) page configuration (cal2016 docks)
{
  const f = path.join(P, "page-config/config.json");
  const pc = JSON.parse(fs.readFileSync(f, "utf8"));
  const tmplPage = pc.pages["/overview"];
  const page = (viewPath, title) => ({ ...JSON.parse(JSON.stringify(tmplPage)), viewPath, title });
  pc.pages = {
    "/": page(EXTRA.pages["/overview"], "cal1615"),
    ...Object.fromEntries(Object.entries(EXTRA.pages).map(([u, v]) => [u, page(v, "cal1615")])),
    "/zone/:zone": page(`${ZV}/Zone - Main`, "Zone"),
    "/alarms": pc.pages["/alarms"], "/warnings": pc.pages["/warnings"], "/history": pc.pages["/history"],
    "/trend": page("MainViews/Feature Views/Trending/AdHocTrends", "Trend"),
  };
  // Shared docks: every page uses the same header / menu / dock-nav, and their open/pinned state carries across pages.
  pc.sharedDocks = { cornerPriority: "top-bottom", ...JSON.parse(JSON.stringify(tmplPage.docks)) };
  for (const u of Object.keys(pc.pages)) delete pc.pages[u].docks;
  fs.writeFileSync(f, JSON.stringify(pc, null, 2));
  // Session custom property for the pin state.
  const spf = path.join(P, "session-props/props.json");
  const sp = JSON.parse(fs.readFileSync(spf, "utf8"));
  sp.custom = { ...(sp.custom || {}), navPinned: false };
  fs.writeFileSync(spf, JSON.stringify(sp, null, 2));
}

// ------------------------------------------------------------------ 5) images for Image Management (gateway)
{
  const src = path.join(__dirname, "img");
  const dst = path.join(OUT, "..", "cal1615_std_images", "cal1615");
  rmrf(path.dirname(dst));
  for (const f of ["zone.png", "line_overview.png", "line_estop.png", "line_letoff.png", "line_accum.png", "line_winder.png", "park_logo.png", "litzler_logo.png"]) {
    write(path.join(dst, f, f), fs.readFileSync(path.join(src, f)));
    write(path.join(dst, f, "resource.json"), { scope: "A", version: 1, restricted: false, overridable: true, files: [f], attributes: { format: "PNG", lastModification: { actor: "claude", timestamp: NOW } } });
  }
}
console.log("built", OUT);
