// Generator for the cal1615_ignition Perspective project.
// Usage: node gen.js <outDir> <tagmap.json>
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2];
// Field -> PLC tag maps: the named file plus any other tagmap*.json beside it.
const TAGMAP = {};
if (fs.existsSync(process.argv[3] || "")) {
  const dir = path.dirname(path.resolve(process.argv[3]));
  const files = [path.resolve(process.argv[3]), ...fs.readdirSync(dir).filter((f) => /^tagmap.+\.json$/.test(f)).map((f) => path.join(dir, f))];
  for (const f of files) Object.assign(TAGMAP, JSON.parse(fs.readFileSync(f)));
}
const HISTORY_PROVIDER = "mySQL";
const GATEWAY_NAME = "ignition-4d950438c38c";
const IMG = path.join(__dirname, "img");
const PROVIDER = "cal1615";
// Fixed resource timestamp so regenerating only changes files whose content changed.
const NOW = process.env.GEN_TIMESTAMP || "2026-09-28T00:00:00Z";
const P = path.join(OUT, "com.inductiveautomation.perspective");

// ---------------------------------------------------------------- helpers
const dataUri = (f) => "data:image/png;base64," + fs.readFileSync(path.join(IMG, f)).toString("base64");
const write = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
};
const resource = (files, extra = {}) => ({
  scope: "G", version: 1, restricted: false, overridable: true, files,
  attributes: { lastModification: { actor: "claude", timestamp: NOW } }, ...extra,
});
const writeView = (vpath, view) => {
  write(path.join(P, "views", vpath, "view.json"), view);
  write(path.join(P, "views", vpath, "resource.json"), resource(["view.json"]));
};
const writeStyle = (name, style) => {
  write(path.join(P, "style-classes", name, "style.json"), style);
  write(path.join(P, "style-classes", name, "resource.json"), resource(["style.json"]));
};
const writeScript = (name, code) => {
  write(path.join(OUT, "ignition/script-python", name, "code.py"), code);
  write(path.join(OUT, "ignition/script-python", name, "resource.json"),
    { ...resource(["code.py"]), scope: "A", attributes: { lastModification: { actor: "claude", timestamp: NOW }, hintScope: 2 } });
};
const expr = (e, transforms) => ({ binding: { type: "expr", config: { expression: e }, ...(transforms ? { transforms } : {}) } });
const prop = (p, transforms) => ({ binding: { type: "property", config: { path: p }, ...(transforms ? { transforms } : {}) } });
const tagIndirect = (ref, bidirectional = false) => ({
  binding: { type: "tag", config: { bidirectional, fallbackDelay: 2.5, mode: "indirect", references: { "0": ref }, tagPath: "{0}" } },
});
const scriptT = (code) => ({ type: "script", code });
const inParams = (params) => Object.fromEntries(Object.keys(params).map((k) => ["params." + k, { paramDirection: "input", persistent: true }]));
const view = ({ params = {}, custom, propConfig = {}, size, root, props = {} }) => ({
  custom: custom || {}, params,
  propConfig: { ...inParams(params), ...propConfig },
  props: { ...(size ? { defaultSize: size } : {}), ...props },
  root,
});
const flex = (name, children, props = {}, position = {}, extra = {}) =>
  ({ type: "ia.container.flex", meta: { name }, position, props, children, ...extra });
const label = (name, text, props = {}, position = {}, extra = {}) =>
  ({ type: "ia.display.label", meta: { name }, position, props: { text, ...props }, ...extra });
const embed = (name, vpath, params, position = {}, props = {}) =>
  ({ type: "ia.display.view", meta: { name }, position, props: { path: vpath, params, ...props } });

// ---------------------------------------------------------------- tags
// Tags follow the site's browsed export (0400 HMI/tags.json): OPC UA connection "cal1615" to the
// FactoryTalk Linx Gateway, and folders mirroring the PLC path. "a.b[6].4" becomes a/b_6_/bit_4
// ("[n]" -> "_n_" as in the export); a STRING "a.name" becomes a/name/name.
const OPC_SERVER = "cal1615";
const OPC_PREFIX = "nsu=FTLGW_Server_Namespace;s=[PLC]";
const plcSegments = (plc) => {
  const m = /^Program:(\w+)\.(.*)$/.exec(plc);
  const segs = (m ? m[2] : plc).split(".").map((s) => s.replace(/\[(\d+)\]/g, "_$1_").replace(/:/g, "_")).map((s) => (/^\d+$/.test(s) ? "bit_" + s : s));
  return m ? ["Program_" + m[1], ...segs] : segs;
};
const DTYPE = { REAL: "Float4", DINT: "Int4", INT: "Int2", SINT: "Int1", BOOL: "Boolean", STRING: "String" };
const usedTags = new Map();
// tagFor(plc) -> "[cal1615]a/b/c" for a mapped field, or "" when unmapped.
// A "memory:" tag lives only in Ignition (e.g. values the old HMI kept in its own memory).
const tagFor = (plc, type, opts = {}) => {
  if (!plc) return "";
  const memory = plc.startsWith("memory:");
  const segs = memory ? ["HMI", plc.slice(7)] : plcSegments(plc);
  if (!memory && type === "STRING") segs.push(segs[segs.length - 1]);
  const key = segs.join("/");
  const prev = usedTags.get(key) || {};
  usedTags.set(key, { segs, plc: memory ? null : plc, type, history: prev.history || !!opts.history, value: opts.value ?? prev.value });
  return `[${PROVIDER}]${key}`;
};
// Tag with history enabled (for trends), and a tag path's Power Chart pen source.
const TH = (id) => { const e = TAGMAP[id]; return e && e.tag ? tagFor(e.tag, e.type || "REAL", { history: true }) : ""; };
const penSource = (tagPath) => `histprov:${HISTORY_PROVIDER}:/drv:${GATEWAY_NAME}:${PROVIDER}:/tag:${tagPath.replace(/^\[[^\]]+\]/, "").toLowerCase()}`;
const T = (id) => { const e = TAGMAP[id]; return e ? tagFor(e.tag, e.type || "REAL") : ""; };
// Write tag for an entry field: its own `write` path when the PLC reads it back from elsewhere.
const TW = (id) => { const e = TAGMAP[id]; return e ? tagFor(e.write || e.tag, e.type || "REAL") : ""; };
const ENUM = (id) => (TAGMAP[id] && TAGMAP[id].enum) || {};

// ---------------------------------------------------------------- styles
const S = {
  "cal1615/card": { base: { style: { overflow: "hidden", backgroundColor: "var(--neutral-20)", borderColor: "var(--neutral-50)", borderStyle: "solid", borderWidth: "1px", borderRadius: "4px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" } } },
  "cal1615/card-header": { base: { style: { backgroundColor: "var(--callToAction)", color: "#FFFFFF", fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", textAlign: "center", lineHeight: "24px" } } },
  "cal1615/row-label": { base: { style: { fontFamily: "Arial", fontSize: "13px", color: "var(--neutral-90)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } } },
  "cal1615/value": { base: { style: { height: "22px", minHeight: "0", lineHeight: "20px", boxSizing: "border-box", paddingTop: "0", paddingBottom: "0", paddingLeft: "2px", overflow: "hidden", whiteSpace: "nowrap", backgroundColor: "var(--neutral-10)", borderColor: "var(--neutral-60)", borderStyle: "solid", borderWidth: "1px", borderRadius: "2px", fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", textAlign: "right", paddingRight: "4px", color: "var(--neutral-100)" } } },
  "cal1615/entry": { base: { style: { height: "22px", minHeight: "0", lineHeight: "20px", boxSizing: "border-box", paddingTop: "0", paddingBottom: "0", paddingLeft: "3px", paddingRight: "3px", textOverflow: "clip", overflow: "hidden", whiteSpace: "nowrap", backgroundColor: "#B8F4FF", color: "#000000", borderColor: "#0097A7", borderStyle: "solid", borderWidth: "1px", borderRadius: "2px", fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", textAlign: "right" } } },
  "cal1615/status": { base: { style: { height: "22px", minHeight: "0", lineHeight: "20px", boxSizing: "border-box", paddingTop: "0", paddingBottom: "0", overflow: "hidden", whiteSpace: "nowrap", borderColor: "var(--neutral-60)", borderStyle: "solid", borderWidth: "1px", borderRadius: "2px", fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", textAlign: "center", color: "#000000" } } },
  "cal1615/units": { base: { style: { whiteSpace: "nowrap", minWidth: "26px", fontFamily: "Arial", fontSize: "12px", color: "var(--neutral-70)", paddingLeft: "3px" } } },
  "cal1615/led": { base: { style: { borderColor: "var(--neutral-70)", borderStyle: "solid", borderWidth: "1px", borderRadius: "10px", fontFamily: "Arial", fontSize: "12px", textAlign: "center", color: "#000000", whiteSpace: "nowrap", overflow: "hidden" } } },
  "cal1615/indicator": { base: { style: { backgroundColor: "var(--neutral-10)", borderColor: "var(--neutral-60)", borderStyle: "solid", borderWidth: "1px", borderRadius: "3px", fontFamily: "Arial", fontSize: "12px", paddingLeft: "4px", paddingRight: "4px", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" } } },
  "cal1615/banner": { base: { style: { backgroundColor: "var(--neutral-20)", borderColor: "var(--neutral-50)", borderStyle: "solid", borderWidth: "1px", borderRadius: "4px", fontFamily: "Arial", fontSize: "20px", fontWeight: "bold", paddingLeft: "10px", paddingRight: "10px" } } },
  "cal1615/drawing": { base: { style: { backgroundColor: "#FFFFFF", borderRadius: "4px" } } },
  "cal1615/btn": { base: { style: { fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", borderRadius: "3px", margin: "3px" } } },
  "cal1615/btn-stop": { base: { style: { backgroundColor: "#D32F2F", color: "#FFFFFF", borderColor: "#8E0000", fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", borderRadius: "3px", margin: "3px" } }, variants: [{ pseudo: "hover", style: { backgroundColor: "#B71C1C" } }, { pseudo: "disabled", style: { opacity: 0.45, cursor: "not-allowed" } }] },
  "cal1615/btn-start": { base: { style: { backgroundColor: "#2E7D32", color: "#FFFFFF", borderColor: "#1B5E20", fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", borderRadius: "3px", margin: "3px" } }, variants: [{ pseudo: "hover", style: { backgroundColor: "#1B5E20" } }, { pseudo: "disabled", style: { opacity: 0.45, cursor: "not-allowed" } }] },
  "cal1615/tab": { base: { style: { fontFamily: "Arial", fontSize: "13px", borderRadius: "3px", backgroundColor: "var(--neutral-30)", color: "var(--neutral-100)", borderStyle: "none", whiteSpace: "normal", textAlign: "left", paddingLeft: "10px" } }, variants: [{ pseudo: "hover", style: { backgroundColor: "var(--neutral-50)" } }] },
  "cal1615/tab-selected": { base: { style: { fontFamily: "Arial", fontSize: "13px", fontWeight: "bold", borderRadius: "3px", backgroundColor: "var(--callToAction)", color: "#FFFFFF", borderStyle: "none", whiteSpace: "normal", textAlign: "left", paddingLeft: "10px" } } },
  "cal1615/nav-top": { base: { style: { fontWeight: "500", textAlign: "start" } } },
  "cal1615/nav-top-selected": { base: { style: { boxShadow: "inset 0 -3px var(--info)", color: "#1B79EC", fontWeight: "bold", textAlign: "start" } } },
  "cal1615/sidebar-items": { base: { style: { fontSize: "14px", paddingLeft: "1rem!important", borderBottomColor: "var(--neutral-40)", borderBottomStyle: "solid", borderBottomWidth: "1px" } },
    variants: [{ pseudo: "hover", style: { backgroundColor: "var(--callToActionHighlight)", color: "var(--neutral-100)", cursor: "pointer" } }] },
  "cal1615/sidebar-items-selected": { base: { style: { backgroundColor: "var(--neutral-50)", color: "#FFFFFF", fontSize: "14px", fontWeight: "bold", paddingLeft: "1rem!important",
    boxShadow: "inset 4px 0 var(--info)", borderBottomColor: "var(--neutral-40)", borderBottomStyle: "solid", borderBottomWidth: "1px" } },
    variants: [{ pseudo: "hover", style: { backgroundColor: "var(--callToActionHighlight)", color: "var(--neutral-100)", cursor: "pointer" } }] },
  "cal1615/sidebar-heading": { base: { style: { backgroundColor: "var(--neutral-30)", fontSize: "14px", fontWeight: "bold", paddingLeft: "1rem", lineHeight: "40px",
    borderBottomColor: "var(--neutral-50)", borderBottomStyle: "solid", borderBottomWidth: "1px" } } },
  "cal1615/page": { base: { style: { backgroundColor: "var(--neutral-10)" } } },
  "cal1615/nav-header": { base: { style: { fontWeight: "bold", fontSize: "14px" } } },
  "cal1615/nav-item": { base: { style: { fontSize: "14px", paddingLeft: "1rem!important" } }, variants: [{ pseudo: "hover", style: { backgroundColor: "var(--callToActionHighlight)", cursor: "pointer" } }] },
  "cal1615/header": { base: { style: { backgroundColor: "var(--neutral-20)", borderBottomColor: "var(--neutral-50)", borderBottomStyle: "solid", borderBottomWidth: "1px" } } },
  "cal1615/header-icon": { base: { style: { color: "var(--neutral-90)", cursor: "pointer" } } },
  "cal1615/alarm-active": { base: { style: { color: "#D32F2F", fill: "#D32F2F", fontWeight: "bold" } } },
  "cal1615/placeholder": { base: { style: { fontFamily: "Arial", fontSize: "16px", color: "var(--neutral-70)", textAlign: "center" } } },
};

// ---------------------------------------------------------------- reusable components
// Row heights used when a Card computes its own height.
// Rows get a few px of slack over the 22px boxes so fonts and borders never overflow.
const ROW_H = { flat: 28, stacked: 48, buttons: 42 };
const rowHeight = (r) => (r.kind === "buttons" ? ROW_H.buttons : r.stacked ? ROW_H.stacked : ROW_H.flat);
const HEADER_H = 26;
const cardHeight = (rows) => HEADER_H + rows.reduce((a, r) => a + rowHeight(r), 0) + 8;

// Entry fields read `tag` and write operator edits to `writeTag` (recipe setpoints are read from
// p01_recipe_active but must be written to p02_recipe_from_hmi, which the PLC copies every scan).
const ENTRY_WRITE =
  "\tif origin not in ('Browser', 'BindingWriteback'):\n\t\treturn\n" +
  "\tif currentValue is None or (previousValue is not None and currentValue.value == previousValue.value):\n\t\treturn\n" +
  "\tp = self.view.params\n" +
  "\ttarget = p.writeTag or p.tag\n" +
  "\tif target:\n\t\tsystem.tag.writeBlocking([target], [currentValue.value])\n";
const ROW_PARAMS = { compact: false, label: "", tag: "", writeTag: "", units: "", kind: "value", format: "#,##0.0", stacked: false, map: {}, leds: [], buttons: [], labelWidth: "" };

function buildComponents() {
  // Row: dispatches to a kind-specific row view so each kind only binds what it needs.
  writeView("Components/Common/Row", view({
    params: { ...ROW_PARAMS },
    size: { width: 240, height: 26 },
    root: flex("root", [
      {
        type: "ia.display.view", meta: { name: "row" }, position: { grow: 1, basis: "0" },
        props: { path: "", params: {} },
        propConfig: {
          "props.path": expr('"Components/Common/Rows/" + {view.params.kind}'),
          ...Object.fromEntries(Object.keys(ROW_PARAMS).map((k) => ["props.params." + k, prop("view.params." + k)])),
        },
      },
    ], { direction: "row" }),
  }));

  // Layout of one row: label and value side by side, or label above value when stacked.
  const rowRoot = (valueChildren) => flex("root", [
    label("lbl", "", { style: { classes: "cal1615/row-label" } }, { grow: 1, shrink: 1, basis: "0" }, {
      propConfig: {
        "props.text": prop("view.params.label"),
        "props.style.textAlign": expr('if({view.params.stacked}, "center", "left")'),
        "position.display": expr('len({view.params.label}) > 0'),
        "position.basis": expr('if({view.params.stacked}, "18px", if(len({view.params.labelWidth}) > 0, {view.params.labelWidth}, "0"))'),
        "position.grow": expr('if({view.params.stacked} || len({view.params.labelWidth}) > 0, 0, 1)'),
      },
    }),
    // Row mode: sized to its content beside the label. Stacked: a 22px line under the label.
    flex("val", valueChildren, { direction: "row", justify: "center", alignItems: "center" }, { grow: 0, shrink: 0, basis: "auto" }, {
      propConfig: {
        "position.basis": expr('if({view.params.stacked}, "22px", if({view.params.compact}, "34px", if({view.params.kind} = "value" || {view.params.kind} = "entry", "auto", "55%")))'),
        "position.grow": expr('if(!{view.params.stacked} && len({view.params.label}) = 0, 1, 0)'),
      },
    }),
  ], { direction: "row", alignItems: "center", style: { paddingLeft: "4px", paddingRight: "4px" } }, {}, {
    propConfig: {
      "props.direction": expr('if({view.params.stacked}, "column", "row")'),
      "props.alignItems": expr('if({view.params.stacked}, "stretch", "center")'),
    },
  });
  const unitsLbl = () => label("units", "", { style: { classes: "cal1615/units" } }, { basis: "auto", shrink: 0 }, {
    // Always present (even when empty) so entry boxes line up down a card.
    propConfig: { "props.text": prop("view.params.units"), "position.display": expr('!{view.params.stacked} || len({view.params.units}) > 0') },
  });

  writeView("Components/Common/Rows/value", view({
    params: { ...ROW_PARAMS },
    size: { width: 240, height: 26 },
    custom: { v: null },
    propConfig: { "custom.v": tagIndirect("{view.params.tag}") },
    root: rowRoot([
      label("value", "", { style: { classes: "cal1615/value" } }, { basis: "74px", shrink: 0 }, {
        propConfig: { "props.text": expr('if(isNull({view.custom.v}), "---", numberFormat({view.custom.v}, {view.params.format}))') },
      }),
      unitsLbl(),
    ]),
  }));

  writeView("Components/Common/Rows/entry", view({
    params: { ...ROW_PARAMS },
    size: { width: 240, height: 26 },
    root: rowRoot([
      {
        type: "ia.input.numeric-entry-field", meta: { name: "entry" }, position: { basis: "74px", shrink: 0 },
        props: { value: null, format: "#,##0.0", spinner: { enabled: false }, style: { classes: "cal1615/entry" } },
        propConfig: {
          "props.value": { ...tagIndirect("{view.params.tag}"), onChange: { enabled: null, script: ENTRY_WRITE } },
          "props.format": prop("view.params.format"),
          "props.enabled": expr("{session.custom.canOperate}"),
        },
      },
      unitsLbl(),
    ]),
  }));

  writeView("Components/Common/Rows/textentry", view({
    params: { ...ROW_PARAMS },
    size: { width: 240, height: 26 },
    root: rowRoot([
      {
        type: "ia.input.text-field", meta: { name: "entry" }, position: { grow: 1, basis: "90px" },
        props: { text: "", style: { classes: "cal1615/entry", textAlign: "center" } },
        propConfig: {
          "props.text": { ...tagIndirect("{view.params.tag}"), onChange: { enabled: null, script: ENTRY_WRITE } },
          "props.enabled": expr("{session.custom.canOperate}"),
        },
      },
    ]),
  }));

  const mapLookup = (key) => scriptT(
    "\tm = self.view.params.map\n" +
    "\ttry:\n\t\tk = str(int(value))\n\texcept:\n\t\tk = str(value)\n" +
    "\ttry:\n\t\te = m[k]\n\texcept:\n\t\te = None\n" +
    (key === "text"
      ? "\tif e is None:\n\t\treturn '---' if value is None else k\n\ttry:\n\t\treturn e['text']\n\texcept:\n\t\treturn str(e)\n"
      : "\tif e is None:\n\t\treturn '#FFFFFF'\n\ttry:\n\t\treturn e['color']\n\texcept:\n\t\treturn '#FFFFFF'\n"));
  writeView("Components/Common/Rows/status", view({
    params: { ...ROW_PARAMS },
    size: { width: 240, height: 26 },
    custom: { v: null },
    propConfig: { "custom.v": tagIndirect("{view.params.tag}") },
    root: rowRoot([
      label("status", "", { style: { classes: "cal1615/status" } }, { grow: 1, basis: "90px" }, {
        propConfig: {
          "props.text": prop("view.custom.v", [mapLookup("text")]),
          "props.style.backgroundColor": prop("view.custom.v", [mapLookup("color")]),
        },
      }),
    ]),
  }));

  writeView("Components/Common/Rows/text", view({
    params: { ...ROW_PARAMS },
    size: { width: 240, height: 26 },
    custom: { v: null },
    propConfig: { "custom.v": tagIndirect("{view.params.tag}") },
    root: rowRoot([
      label("text", "", { style: { classes: "cal1615/value", textAlign: "center", backgroundColor: "#B8F4FF", color: "#000000" } }, { grow: 1, basis: "90px" }, {
        propConfig: { "props.text": expr('if(isNull({view.custom.v}), "---", toStr({view.custom.v}))') },
      }),
    ]),
  }));

  writeView("Components/Common/Rows/leds", view({
    params: { ...ROW_PARAMS },
    size: { width: 240, height: 26 },
    root: rowRoot([
      {
        type: "ia.display.flex-repeater", meta: { name: "leds" }, position: { grow: 1, basis: "100px" },
        props: { useDefaultViewWidth: false, useDefaultViewHeight: false, path: "Components/Common/LED", direction: "row", elementPosition: { grow: 1, shrink: 1, basis: "0" }, instances: [] },
        propConfig: { "props.instances": prop("view.params.leds") },
      },
    ]),
  }));

  writeView("Components/Common/Rows/buttons", view({
    params: { ...ROW_PARAMS },
    size: { width: 240, height: 42 },
    root: flex("root", [
      {
        type: "ia.display.flex-repeater", meta: { name: "buttons" }, position: { grow: 1, basis: "0" },
        props: { useDefaultViewWidth: false, useDefaultViewHeight: false, path: "Components/Common/Command Button", direction: "row", justify: "center", elementPosition: { grow: 1, shrink: 1, basis: "0" }, instances: [] },
        propConfig: { "props.instances": prop("view.params.buttons") },
      },
    ], { direction: "row", style: { paddingLeft: "4px", paddingRight: "4px" } }),
  }));

  // LED pill: coloured when the bit is on (or off when invert is set).
  writeView("Components/Common/LED", view({
    params: { text: "", tag: "", onColor: "#00E000", offColor: "#D0D0D0", invert: false },
    size: { width: 16, height: 20 },
    custom: { v: null },
    propConfig: { "custom.v": tagIndirect("{view.params.tag}") },
    root: flex("root", [
      label("led", "", { style: { classes: "cal1615/led" } }, { grow: 1, basis: "0" }, {
        propConfig: {
          "props.text": prop("view.params.text"),
          "props.style.backgroundColor": expr('if(isNull({view.custom.v}), "#FF00FF", if(toBoolean({view.custom.v}) != {view.params.invert}, {view.params.onColor}, {view.params.offColor}))'),
        },
      }),
    ], { direction: "row", alignItems: "stretch", style: { padding: "2px 2px", minHeight: "18px" } }),
  }));

  // Standalone indicator box ("Full LS [o]") used over the machine drawing.
  writeView("Components/Common/Indicator", view({
    params: { text: "", tag: "", onColor: "#00E000", offColor: "#FFFF00", invert: false },
    size: { width: 110, height: 30 },
    custom: { v: null },
    propConfig: { "custom.v": tagIndirect("{view.params.tag}") },
    root: flex("root", [
      label("text", "", { style: { fontFamily: "Arial", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden" } }, { grow: 1, basis: "0" }, {
        propConfig: { "props.text": prop("view.params.text") },
      }),
      label("lamp", "", { style: { borderRadius: "4px", borderStyle: "solid", borderWidth: "1px", borderColor: "#555555", height: "18px", minWidth: "18px" } }, { basis: "18px", shrink: 0 }, {
        propConfig: {
          "props.style.backgroundColor": expr('if(isNull({view.custom.v}), "#FF00FF", if(toBoolean({view.custom.v}) != {view.params.invert}, {view.params.onColor}, {view.params.offColor}))'),
        },
      }),
    ], { direction: "row", alignItems: "center", style: { classes: "cal1615/indicator", height: "100%", gap: "4px" } }),
  }));

  // Command button: writes `value` to `tag` (optionally pulsing it back to 0), or navigates to `page`.
  // With `hold` it is a jog button: 1 while pressed, 0 on release or when the pointer leaves it.
  const holdWrite = (v) => ({ type: "script", scope: "G", config: { script:
    "\tp = self.view.params\n\tif p.hold and p.tag and self.view.session.custom.canOperate:\n\t\tsystem.tag.writeBlocking([p.tag], [" + v + "])\n" } });
  writeView("Components/Common/Command Button", view({
    params: { text: "", tag: "", value: 1, pulse: true, hold: false, page: "", styleClass: "cal1615/btn", confirm: "" },
    size: { width: 110, height: 36 },
    root: flex("root", [
      {
        type: "ia.input.button", meta: { name: "btn" }, position: { grow: 1, basis: "0" },
        props: { text: "", style: { classes: "cal1615/btn" } },
        propConfig: {
          "props.text": prop("view.params.text"),
          "props.style.classes": prop("view.params.styleClass"),
          "props.enabled": expr('len({view.params.page}) > 0 || (len({view.params.tag}) > 0 && {session.custom.canOperate})'),
        },
        events: {
          component: {
            onActionPerformed: {
              type: "script", scope: "G",
              config: {
                script:
                  "\tp = self.view.params\n" +
                  "\tif p.page:\n\t\tsystem.perspective.navigate(page=p.page)\n\t\treturn\n" +
                  "\tif not p.tag or p.hold:\n\t\treturn\n" +
                  "\ttag = p.tag\n" +
                  "\tsystem.tag.writeBlocking([tag], [p.value])\n" +
                  "\tif p.pulse:\n" +
                  "\t\tdef release(tag=tag):\n\t\t\timport time\n\t\t\ttime.sleep(0.5)\n\t\t\tsystem.tag.writeBlocking([tag], [0])\n" +
                  "\t\tsystem.util.invokeAsynchronous(release)\n",
              },
            },
          },
          dom: {
            onMouseDown: holdWrite(1), onTouchStart: holdWrite(1),
            onMouseUp: holdWrite(0), onMouseLeave: holdWrite(0), onTouchEnd: holdWrite(0),
          },
        },
      },
    ], { direction: "row" }),
  }));

  // Card: titled panel whose rows are Row instances (see ROW_PARAMS for the row keys).
  writeView("Components/Common/Card", view({
    params: { title: "", rows: [] },
    size: { width: 240, height: 140 },
    root: flex("root", [
      label("title", "", { style: { classes: "cal1615/card-header" } }, { basis: HEADER_H + "px", shrink: 0 }, {
        propConfig: { "props.text": prop("view.params.title"), "position.display": expr('len({view.params.title}) > 0') },
      }),
      {
        type: "ia.display.flex-repeater", meta: { name: "rows" }, position: { grow: 1, basis: "0" },
        props: { useDefaultViewWidth: false, useDefaultViewHeight: false, path: "Components/Common/Row", direction: "column", elementPosition: { grow: 0, shrink: 0, basis: "26px" }, instances: [], style: { paddingTop: "4px" } },
        propConfig: { "props.instances": prop("view.params.rows") },
      },
    ], { direction: "column", style: { classes: "cal1615/card" } }),
  }));
}

// Row builders used by the screen definitions.
const R = {
  value: (label, id, units = "", o = {}) => ({ kind: "value", label, tag: T(id), units, format: "#,##0.0", ...o }),
  entry: (label, id, units = "", o = {}) => ({ kind: "entry", label, tag: T(id), writeTag: TW(id), units, format: "#,##0.0", ...o }),
  textentry: (label, id, o = {}) => ({ kind: "textentry", label, tag: T(id), writeTag: TW(id), ...o }),
  status: (label, id, map, o = {}) => ({ kind: "status", label, tag: T(id), map: map || ENUM(id), ...o }),
  text: (label, id, o = {}) => ({ kind: "text", label, tag: T(id), ...o }),
  // A lone LED without text is drawn as a small lamp at the end of the row.
  leds: (label, leds, o = {}) => ({ kind: "leds", label, leds, compact: leds.length === 1 && !leds[0].text, ...o }),
  buttons: (buttons) => ({ kind: "buttons", buttons }),
};
const led = (text, id, o = {}) => ({ text, tag: T(id), onColor: "#00E000", offColor: "#D0D0D0", invert: false, ...o });
const btn = (text, id, o = {}) => ({ text, tag: T(id), value: 1, pulse: true, hold: false, page: "", styleClass: "cal1615/btn", confirm: "", ...o });
// A Row instance carries its own height for the flex repeater.
const withPos = (rows) => rows.map((r) => ({ ...ROW_PARAMS, ...r, instancePosition: { basis: rowHeight(r) + "px", grow: 0, shrink: 0 } }));
const card = (title, rows) => ({ title, rows: withPos(rows) });

// ---------------------------------------------------------------- 1615 screen content
// Status enumerations traced from the PLC sequencers (SYS_ENC status = lowest active state).
const C = { off: "#D0D0D0", idle: "#FFFFFF", busy: "#FFFF80", ok: "#00E000", stop: "#FFB060", manual: "#FFA040", cool: "#9FD8FF" };
const en = (pairs) => Object.fromEntries(pairs.map(([k, text, color]) => [String(k), { text, color }]));
const E = {
  line: en([[1, "Idle", C.idle], [2, "Initiate Start", C.busy], [3, "Pre-Run Warning", C.busy], [4, "Ramp to Slow Speed", C.busy], [5, "Accel to SP (Stretch)", C.busy], [6, "Switch to Tension", C.busy], [7, "Run", C.ok], [8, "Normal Stop", C.stop], [9, "Cycle Complete", C.idle]]),
  zone12: en([[1, "Off", C.off], [2, "Idle", C.idle], [3, "Start Recirc Fan", C.busy], [4, "Start Exhaust Fan", C.busy], [5, "Wait for Safeties", C.busy], [6, "Safeties Made", C.busy], [7, "Purge", C.busy], [8, "Burner Lit", C.busy], [9, "Heat to SP", C.busy], [10, "Control to SP", C.ok], [11, "Cooldown", C.cool], [12, "Cooldown Fans", C.cool], [13, "Complete", C.idle], [31, "Manual", C.manual]]),
  zone3: en([[1, "Off", C.off], [2, "Idle", C.idle], [3, "Start Recirc", C.busy], [4, "Start Exhaust", C.busy], [5, "Control to SP", C.ok], [6, "Complete", C.idle], [31, "Manual", C.manual]]),
  entryAcc: en([[1, "Control to Low", C.idle], [2, "Fill Request", C.busy], [3, "Ramp Tension Prs", C.busy], [4, "Fill to Full", C.busy], [5, "Control to Top", C.ok], [6, "Payout Request", C.busy], [7, "Payout to Empty", C.busy], [8, "Lower Limit", C.stop], [9, "Complete", C.idle], [10, "Position Fill Req", C.busy]]),
  splice: en([[1, "Idle", C.idle], [2, "Enable Sequence", C.busy], [3, "Close Exit Clamp", C.busy], [4, "Close Inlet Clamp", C.busy], [5, "Closing Platen", C.busy], [6, "Cure in Progress", C.ok], [7, "Cure Done", C.busy], [8, "Platen Open", C.busy], [9, "Inlet Clamp Open", C.busy], [10, "Exit Clamp Open", C.busy], [11, "Complete", C.idle]]),
  tsMode: en([[0, "---", C.off], [1, "Jog", C.busy], [2, "Run", C.ok], [3, "Thread", C.busy]]),
  wac: en([[1, "Idle", C.idle], [2, "Filling", C.busy], [3, "Paying Out", C.busy], [4, "Alarm", "#FF6060"], [5, "Warning", C.stop], [6, "Full", C.busy], [7, "Empty", C.stop]]),
  fillMode: en([[1, "Auto", C.ok], [0, "Manual", C.manual]]),
  letoffAB: en([[1, "A", C.idle], [0, "B", C.idle]]),
};

function mainCards() {
  const z = (n) => `zone${n}`;
  return {
    entryAcc: card("Entry Accumulator", [
      R.value("Position", "entry_acc.position_pct", "%"),
      R.value("Time Until Empty", "entry_acc.time_until_empty", "Sec", { format: "#,##0" }),
      R.status("Fill Mode", "entry_acc.fill_mode_auto", E.fillMode),
      R.status("Sequencer", "entry_acc.status", E.entryAcc),
      R.buttons([btn("Toggle Mode", "entry_acc.fill_mode_toggle_pb")]),
    ]),
    winderAcc: card("Winder Accumulator", [
      R.value("Position", "wac.position_pct", "%"),
      R.value("Stored", "wac.stored_ft", "FT", { format: "#,##0" }),
      R.status("Status", "wac.status", E.wac),
    ]),
    letoffFootage: card("Let-Off Footage", [
      R.value("A", "letoff.footage_a", "FT", { format: "#,##0", labelWidth: "18px" }),
      R.value("B", "letoff.footage_b", "FT", { format: "#,##0", labelWidth: "18px" }),
    ]),
    winderFootage: card("Winder Footage", [
      R.value("A", "winder.footage_a", "FT", { format: "#,##0", labelWidth: "18px" }),
      R.value("B", "winder.footage_b", "FT", { format: "#,##0", labelWidth: "18px" }),
    ]),
    slitter: card("Slitter", [
      R.value("Speed", "slitter.speed", "FPM", { stacked: true, format: "#,##0.00" }),
      R.entry("Speed SP", "slitter.speed_sp", "%", { stacked: true, format: "#,##0.00" }),
    ]),
    upperPoly: card("Upper Poly", [
      R.value("Diameter A", "upper_poly.dia_a", "IN", { stacked: true }),
      R.value("Diameter B", "upper_poly.dia_b", "IN", { stacked: true }),
    ]),
    lowerPoly: card("Lower Poly", [
      R.value("Diameter A", "lower_poly.dia_a", "IN", { stacked: true }),
      R.value("Diameter B", "lower_poly.dia_b", "IN", { stacked: true }),
    ]),
    letoff: card("Let-Off", [
      R.value("Tension", "letoff.tension", "LBS", { stacked: true }),
      R.entry("Tension SP", "letoff.tension_sp", "LBS", { stacked: true }),
      R.status("Active Let-Off", "letoff.active_a", E.letoffAB, { stacked: true }),
    ]),
    splice: card("Splice Press", [
      R.value("Temperature", "splice.temp", "F"),
      R.entry("Temperature SP", "splice.temp_sp", "F"),
      R.value("Cure Time Remaining", "splice.cure_remaining", "Sec"),
      R.entry("Cure Time SP", "splice.cure_time_sp", "Sec"),
      R.status("Sequencer", "splice.status", E.splice, { stacked: true }),
    ]),
    ts1: card("Tension Stand 1", [
      R.value("Tension", "ts1.tension", "LBS", { stacked: true }),
      R.entry("Tension SP", "ts1.tension_sp", "LBS", { stacked: true }),
      R.status("Mode", "ts1.mode", E.tsMode, { stacked: true }),
    ]),
    impreg: card("Impregnation", [
      R.value("Speed", "impreg.speed", "FPM", { stacked: true }),
      R.value("Speed SP", "impreg.speed_sp", "FPM", { stacked: true }),
      R.leds("Tank Level", [led("Low", "impreg.tank_level_low"), led("High", "impreg.tank_level_high")], { stacked: true }),
      R.leds("Trough Level", [led("Low", "impreg.trough_level_low")], { stacked: true }),
    ]),
    cooling: card("Cooling Rolls", [
      R.value("Temperature", "cooling.temp", "F", { stacked: true }),
      R.entry("Temperature SP", "cooling.temp_sp", "F", { stacked: true }),
    ]),
    ts2: card("Tension Stand 2", [
      R.value("Speed", "ts2.speed", "FPM", { stacked: true }),
      R.value("Speed SP", "ts2.speed_sp", "FPM", { stacked: true }),
      R.status("Mode", "ts2.mode", E.tsMode, { stacked: true }),
    ]),
    winder: card("Winder", [
      R.value("Tension", "winder.tension", "LBS", { stacked: true }),
      R.entry("Tension SP", "winder.tension_sp", "LBS", { stacked: true }),
      R.leds("Active Winder", [led("A", "winder.active_a"), led("B", "winder.active_b")], { stacked: true }),
    ]),
    ovenControl: card("Oven Control", [
      R.buttons([btn("Start Oven", "btn.start_oven", { styleClass: "cal1615/btn-start" }), btn("Stop Oven", "btn.stop_oven", { styleClass: "cal1615/btn-stop" })]),
      R.status("Zone 1 Status", "zone1.status", E.zone12),
      R.status("Zone 2 Status", "zone2.status", E.zone12),
      R.status("Zone 3 Status", "zone3.status", E.zone3),
    ]),
    lineControl: card("Line Control", [
      R.buttons([btn("Start Line", "btn.start_line", { styleClass: "cal1615/btn-start" }), btn("Stop Line", "btn.stop_line", { styleClass: "cal1615/btn-stop" })]),
      R.status("Line Status", "line.status", E.line),
      R.value("Run Time", "line.run_time_hrs", "HRS", { format: "#,##0" }),
    ]),
    lineSpeed: card("Line Speed", [
      R.value("Line Speed", "line.speed", "FPM", { format: "#,##0.00" }),
      R.entry("Setpoint", "line.speed_sp", "FPM", { format: "#,##0.00" }),
      R.entry("Jog Speed", "line.jog_speed", "FPM", { format: "#,##0.00" }),
    ]),
    production: card("Production", [
      R.buttons([btn("Comments", "", { page: "/active-recipe" }), btn("Reports", "", { page: "/trend" })]),
      R.textentry("Shop Order Number", "line.shop_order", { stacked: true }),
    ]),
    zones: [1, 2, 3].map((n) => card(`Zone ${n}`, [
      R.value("Temperature", `${z(n)}.temp`, "F"),
      R.entry("Temperature SP", `${z(n)}.temp_sp`, "F"),
      ...(n < 3 ? [R.value("LFL Level", `${z(n)}.lfl`, "%"), R.value("Pressure", `${z(n)}.pressure`, '"wc', { format: "#,##0.000" })] : []),
      R.status("Status", `${z(n)}.status`, n < 3 ? E.zone12 : E.zone3),
    ])),
  };
}


// Zone table: the three-column oven summary that sits over the oven drawing.
function buildZoneTable() {
  const rows = [
    ["Temp.", "temp", "F", "#,##0.0", false],
    ["Temp.SP", "temp_sp", "F", "#,##0.0", true],
    ["LFL Level", "lfl", "%", "#,##0.0", false],
    ["Pressure", "pressure", '"wc', "#,##0.000", false],
  ];
  const cell = (n, key, units, format, entry) => flex(`z${n}`, [
    entry
      ? { type: "ia.input.numeric-entry-field", meta: { name: "v" }, position: { grow: 1, basis: "0" },
          props: { format, spinner: { enabled: false }, style: { classes: "cal1615/entry" } },
          propConfig: { "props.value": T(`zone${n}.${key}`) ? { binding: { type: "tag", config: { fallbackDelay: 2.5, mode: "direct", tagPath: T(`zone${n}.${key}`) } },
            onChange: { enabled: null, script: "\tif origin != 'Browser' or currentValue is None:\n\t\treturn\n\tsystem.tag.writeBlocking(['" + TW(`zone${n}.${key}`) + "'], [currentValue.value])\n" } } : undefined, "props.enabled": expr("{session.custom.canOperate}") } }
      : label("v", "---", { style: { classes: "cal1615/value" } }, { grow: 1, basis: "0" }, {
          propConfig: T(`zone${n}.${key}`) ? { "props.text": { binding: { type: "tag", config: { fallbackDelay: 2.5, mode: "direct", tagPath: T(`zone${n}.${key}`) }, transforms: [{ type: "expression", expression: `if(isNull({value}), "---", numberFormat({value}, "${format}"))` }] } } } : {},
        }),
    label("u", units, { style: { classes: "cal1615/units" } }, { basis: "26px", shrink: 0 }),
  ], { direction: "row", alignItems: "center" }, { grow: 1, basis: "0" });
  const clean = (o) => JSON.parse(JSON.stringify(o));
  writeView("Components/Oven/Zone Table", view({
    size: { width: 366, height: 152 },
    root: flex("root", [
      flex("head", [label("h0", "", {}, { basis: "70px", shrink: 0 }), ...[1, 2, 3].map((n) => label(`h${n}`, `Zone ${n}`, { style: { classes: "cal1615/card-header" } }, { grow: 1, basis: "0" }))],
        { direction: "row", style: { backgroundColor: "var(--callToAction)" } }, { basis: HEADER_H + "px", shrink: 0 }),
      ...rows.map(([lbl, key, units, format, entry]) => clean(flex(`r_${key}`, [
        label("l", lbl, { style: { classes: "cal1615/row-label" } }, { basis: "70px", shrink: 0 }),
        ...[1, 2, 3].map((n) => cell(n, key, units, format, entry)),
      ], { direction: "row", alignItems: "center", style: { paddingLeft: "4px", paddingRight: "4px", gap: "4px" } }, { basis: "28px", shrink: 0 }))),
    ], { direction: "column", style: { classes: "cal1615/card", gap: "2px" } }),
  }));
}

// Safety pins strip shown on the oven drawing.
function buildSafetyPins() {
  const leds = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => led(String(n), `pins.pin_${n}`, { onColor: "#00E000", offColor: "#FF2020" }));
  writeView("Components/Oven/Safety Pins", view({
    size: { width: 212, height: 60 },
    root: flex("root", [
      label("title", "Safety Pins", { style: { classes: "cal1615/row-label", textAlign: "center", fontWeight: "bold" } }, { basis: "20px", shrink: 0 }),
      { type: "ia.display.flex-repeater", meta: { name: "pins" }, position: { grow: 1, basis: "0" },
        props: { useDefaultViewWidth: false, useDefaultViewHeight: false, path: "Components/Common/LED", direction: "row", elementPosition: { grow: 1, shrink: 1, basis: "0" }, instances: leds } },
    ], { direction: "column", style: { classes: "cal1615/indicator", padding: "2px 4px" } }),
  }));
}

// Recipe banner across the top of the overview.
function buildRecipeBanner() {
  const t = T("line.recipe_name");
  writeView("Components/Common/Recipe Banner", view({
    size: { width: 677, height: 32 },
    root: flex("root", [
      label("lbl", "Active Recipe:", {}, { basis: "170px", shrink: 0 }),
      label("name", "---", {}, { grow: 1, basis: "0" }, t ? { propConfig: { "props.text": { binding: { type: "tag", config: { fallbackDelay: 2.5, mode: "direct", tagPath: t } }, transforms: [{ type: "expression", expression: 'if(isNull({value}), "---", {value})' }] } } } : {}),
    ], { direction: "row", alignItems: "center", style: { classes: "cal1615/banner" } }),
  }));
}

// ---------------------------------------------------------------- main screen
// Desktop pages are laid out for 1920x1080 minus the header and side nav (1740x1024) in a fixed-mode coordinate
// container. Positions from the RSView screens are scaled uniformly and centred; cards, lamps and text
// boxes keep their real content height so nothing is clipped. Drawings scale in both directions.
const SCREEN_W = 1920, SCREEN_H = 1080, HEADER_H_PX = 56, SIDE_NAV_W = 180;
const PAGE_W = SCREEN_W - SIDE_NAV_W, PAGE_H = SCREEN_H - HEADER_H_PX, LARGE_BREAKPOINT = 1200;
function fixedLayout(W, H) {
  const s = Math.min(PAGE_W / W, PAGE_H / H), ox = (PAGE_W - W * s) / 2, r = Math.round;
  const pct = (x, y, w, h) => ({ x: r(ox + x * s), y: r(y * s), width: r(w * s), height: r(h) });
  const img = (x, y, w, h) => ({ x: r(ox + x * s), y: r(y * s), width: r(w * s), height: r(h * s) });
  return { s, pct, img, size: { width: PAGE_W, height: PAGE_H }, props: { mode: "fixed", style: { classes: "cal1615/page", overflow: "auto" } } };
}
const MAIN_W = 1512, MAIN_H = 940;
function buildMain() {
  const c = mainCards();
  const L = fixedLayout(MAIN_W, MAIN_H), pct = L.pct;
  const cardAt = (name, cd, x, y, w) => embed(name, "Components/Common/Card", cd, pct(x, y, w, cardHeight(cd.rows)));
  const ind = (name, text, id, x, y, w, h = 32, o = {}) =>
    embed(name, "Components/Common/Indicator", { text, tag: T(id), onColor: "#00E000", offColor: "#FFFF00", invert: false, ...o }, pct(x, y, w, h));

  // Desktop: coordinate container in percent mode laid out like the RSView Main screen.
  const large = [
    { type: "ia.display.image", meta: { name: "lineDrawing" }, position: L.img(0, 70, 1510, 452),
      props: { source: dataUri("line_overview.png"), fit: { mode: "fill" }, style: { classes: "cal1615/drawing" } } },
    embed("recipeBanner", "Components/Common/Recipe Banner", {}, pct(455, 12, 677, 34)),
    cardAt("entryAccumulator", c.entryAcc, 205, 70, 226),
    cardAt("winderAccumulator", c.winderAcc, 1172, 70, 214),
    ind("accFullLS", "Full LS", "entry_acc.full_ls", 458, 152, 92),
    ind("accEmptyLS", "Empty LS", "entry_acc.empty_ls", 458, 425, 92),
    cardAt("letoffFootage", c.letoffFootage, 20, 255, 128),
    ind("feedRollNipOpen", "Nip Open", "nip.feedroll_closed", 347, 313, 86, 32, { invert: true, onColor: "#00E000", offColor: "#D0D0D0" }),
    ind("ts1NipOpen", "Nip Open", "nip.ts1_closed", 552, 313, 88, 32, { invert: true, onColor: "#00E000", offColor: "#D0D0D0" }),
    embed("zoneTable", "Components/Oven/Zone Table", {}, pct(759, 158, 366, 152)),
    cardAt("slitter", c.slitter, 1172, 200, 106),
    cardAt("upperPoly", c.upperPoly, 1280, 200, 106),
    cardAt("winderFootage", c.winderFootage, 1387, 255, 124),
    ind("letoffTurret", "Turret in Position", "letoff.turret_in_position", 20, 443, 128),
    ind("platenClosed", "Platen Closed", "splice.platen_closed", 190, 443, 120, 32, { invert: true }),
    ind("tankUp", "Tank Up", "impreg.tank_up", 668, 465, 84),
    embed("safetyPins", "Components/Oven/Safety Pins", {}, pct(837, 424, 212, 60)),
    ind("winderTurret", "Turret in Position", "winder.turret_in_position", 1386, 443, 125),
    cardAt("letoff", c.letoff, 20, 530, 125),
    cardAt("splicePress", c.splice, 150, 530, 245),
    cardAt("tensionStand1", c.ts1, 499, 530, 125),
    cardAt("impregnation", c.impreg, 648, 530, 125),
    cardAt("coolingRolls", c.cooling, 1034, 530, 118),
    cardAt("tensionStand2", c.ts2, 1156, 530, 118),
    cardAt("lowerPoly", c.lowerPoly, 1278, 530, 110),
    cardAt("winder", c.winder, 1392, 530, 119),
    cardAt("ovenControl", c.ovenControl, 135, 770, 300),
    cardAt("lineControl", c.lineControl, 445, 770, 260),
    cardAt("lineSpeed", c.lineSpeed, 715, 770, 260),
    cardAt("production", c.production, 985, 770, 250),
    embed("faultReset", "Components/Common/Command Button", btn("Fault Reset", "btn.fault_reset", { styleClass: "cal1615/btn-stop" }), pct(1300, 780, 200, 60)),
  ];
  writeView("Main/Overview - Large", view({
    size: L.size,
    root: { type: "ia.container.coord", meta: { name: "root" }, props: L.props, children: large },
  }));

  // Mobile: the same cards stacked, wrapping to two or three columns on tablets.
  const m = (name, cd) => embed(name, "Components/Common/Card", cd, { grow: 1, shrink: 0, basis: "300px" }, { style: { height: cardHeight(cd.rows) + "px", margin: "4px" } });
  const statusCard = card("Line Status", [
    R.leds("Let-Off Turret", [led("In Position", "letoff.turret_in_position", { offColor: "#FFFF00" })]),
    R.leds("Splice Platen", [led("Closed", "splice.platen_closed", { offColor: "#FFFF00", invert: true })]),
    R.leds("Accumulator", [led("Full", "entry_acc.full_ls", { offColor: "#FFFF00" }), led("Empty", "entry_acc.empty_ls", { offColor: "#FFFF00" })]),
    R.leds("Nips", [led("Feed Roll Open", "nip.feedroll_closed", { invert: true }), led("TS1 Open", "nip.ts1_closed", { invert: true })]),
    R.leds("Impreg Tank", [led("Up", "impreg.tank_up", { offColor: "#FFFF00" })]),
    R.leds("Winder Turret", [led("In Position", "winder.turret_in_position", { offColor: "#FFFF00" })]),
  ]);
  const pinsCard = card("Safety Pins", [R.leds("", [1, 2, 3, 4, 5, 6, 7, 8].map((n) => led(String(n), `pins.pin_${n}`, { offColor: "#FF2020" })))]);
  const small = [
    embed("recipeBanner", "Components/Common/Recipe Banner", {}, { grow: 1, shrink: 0, basis: "100%" }, { style: { height: "40px", margin: "4px" } }),
    m("lineControl", c.lineControl), m("lineSpeed", c.lineSpeed), m("ovenControl", c.ovenControl),
    ...c.zones.map((zc, i) => m(`zone${i + 1}`, zc)),
    m("letoff", c.letoff), m("letoffFootage", c.letoffFootage), m("splicePress", c.splice),
    m("entryAccumulator", c.entryAcc), m("tensionStand1", c.ts1), m("impregnation", c.impreg),
    m("coolingRolls", c.cooling), m("tensionStand2", c.ts2), m("slitter", c.slitter),
    m("upperPoly", c.upperPoly), m("lowerPoly", c.lowerPoly), m("winderAccumulator", c.winderAcc),
    m("winder", c.winder), m("winderFootage", c.winderFootage), m("production", c.production),
    m("lineStatus", statusCard), m("safetyPins", pinsCard),
    embed("faultReset", "Components/Common/Command Button", btn("Fault Reset", "btn.fault_reset", { styleClass: "cal1615/btn-stop" }), { grow: 1, shrink: 0, basis: "100%" }, { style: { height: "56px", margin: "4px" } }),
  ];
  writeView("Main/Overview - Small", view({
    size: { width: 400, height: 2400 },
    root: flex("root", small, { direction: "row", wrap: "wrap", alignContent: "flex-start", alignItems: "flex-start", style: { classes: "cal1615/page", padding: "4px", overflowY: "auto" } }),
  }));

  // Breakpoint: coordinate layout on wide screens, stacked cards on phones and small tablets.
  writeView("Main/Overview", view({
    root: {
      type: "ia.container.breakpt", meta: { name: "root" }, props: { breakpoint: LARGE_BREAKPOINT },
      children: [
        embed("Overview - Small", "Main/Overview - Small", {}, {}, { style: { overflowY: "auto" } }),
        // Desktop view keeps its designed size (the page scrolls) instead of being squeezed by the breakpoint container.
        { ...embed("Overview - Large", "Main/Overview - Large", {}, {}, { useDefaultViewWidth: true, useDefaultViewHeight: true }), position: { size: "large" } },
      ],
    },
  }));
}

// ---------------------------------------------------------------- emergency stops
function buildEstops() {
  const W = 1512, H = 940;
  const L = fixedLayout(W, H), pct = L.pct;
  // Rope switch positions from the RSView Emergency Stops screen (content origin 8,120).
  const sw = [[1, 34, 290], [2, 131, 542], [3, 336, 130], [4, 500, 542], [5, 760, 253], [6, 1124, 290], [7, 1127, 542], [8, 1335, 290]];
  const children = [
    { type: "ia.display.image", meta: { name: "lineDrawing" }, position: L.img(22, 230, 1490, 295),
      props: { source: dataUri("line_estop.png"), fit: { mode: "fill" }, style: { classes: "cal1615/drawing" } } },
    ...sw.map(([n, x, y]) => embed(`ropeSwitch${n}`, "Components/Common/Indicator",
      { text: `Rope Switch ${n}`, tag: T(`estop.rope_${n}`), onColor: "#FF2020", offColor: "#00E000", invert: false }, pct(x, y, 130, 34))),
    embed("mainEstop", "Components/Common/Indicator",
      { text: "Main OP Station E-Stop", tag: T("estop.main_op"), onColor: "#FF2020", offColor: "#00E000", invert: false }, pct(690, 660, 190, 34)),
  ];
  writeView("Main/Emergency Stops - Large", view({
    size: L.size,
    root: { type: "ia.container.coord", meta: { name: "root" }, props: L.props, children },
  }));
  const rows = [...sw.map(([n]) => R.leds(`Rope Switch ${n}`, [led("Tripped", `estop.rope_${n}`, { onColor: "#FF2020", offColor: "#00E000" })])),
    R.leds("Main OP Station", [led("Tripped", "estop.main_op", { onColor: "#FF2020", offColor: "#00E000" })])];
  const cd = card("Emergency Stops", rows);
  writeView("Main/Emergency Stops - Small", view({
    size: { width: 400, height: 400 },
    root: flex("root", [embed("estops", "Components/Common/Card", cd, { basis: cardHeight(cd.rows) + "px", shrink: 0 })],
      { direction: "column", style: { classes: "cal1615/page", padding: "8px" } }),
  }));
  writeView("Main/Emergency Stops", view({
    root: { type: "ia.container.breakpt", meta: { name: "root" }, props: { breakpoint: LARGE_BREAKPOINT }, children: [
      embed("small", "Main/Emergency Stops - Small", {}),
      { ...embed("large", "Main/Emergency Stops - Large", {}, {}, { useDefaultViewWidth: true, useDefaultViewHeight: true }), position: { size: "large" } },
    ] },
  }));
}

// ---------------------------------------------------------------- alarms
function buildAlarms() {
  const table = (name, filters) => ({
    type: "ia.display.alarmstatustable", meta: { name }, position: { grow: 1, basis: "400px" },
    props: { filters: { active: filters } },
  });
  writeView("Alarms/Alarms", view({ root: flex("root", [table("alarms", { priorities: { diagnostic: false, low: false } })], { direction: "column", style: { classes: "cal1615/page" } }) }));
  writeView("Alarms/Warnings", view({ root: flex("root", [table("warnings", { priorities: { medium: false, high: false, critical: false } })], { direction: "column", style: { classes: "cal1615/page" } }) }));
  writeView("Alarms/History", view({ root: flex("root", [{ type: "ia.display.alarmjournaltable", meta: { name: "history" }, position: { grow: 1, basis: "400px" }, props: {} }], { direction: "column", style: { classes: "cal1615/page" } }) }));
}

// ---------------------------------------------------------------- navigation / framework
// Sections and pages, in the order of the RSView side buttons and top tabs.
const NAV = [
  { key: "main", text: "Main", icon: "material/home", pages: [
    ["Overview", "/overview", "Main/Overview", "00 Main 00"], ["Oven Control", "/oven-control", "Main/Oven Control", "00 Main 10"],
    ["Active Recipe", "/active-recipe", "Main/Active Recipe", "00 Main 20"], ["Recipe Editor", "/recipe-editor", "Main/Recipe Editor", "00 Main 30"],
    ["Emergency Stops", "/emergency-stops", "Main/Emergency Stops", "00 Main 60"]] },
  { key: "oven", text: "Oven Zones", icon: "material/whatshot", pages: [
    ["Zone 1", "/zone-1", "Oven/Zone 1", "10 Oven 00"], ["Zone 2", "/zone-2", "Oven/Zone 2", "10 Oven 00"], ["Zone 3", "/zone-3", "Oven/Zone 3", "10 Oven 00"],
    ["Advanced Cooling", "/advanced-cooling", "Oven/Advanced Cooling", "oven00"]] },
  { key: "line", text: "Line Drives", icon: "material/settings_input_component", pages: [
    ["Let-Off / Splice", "/letoff-splice", "Line/Letoff Splice", "20 Line 00"], ["Accumulator / Tension Stand 1", "/accumulator-ts1", "Line/Accumulator TS1", "20 Line 10"],
    ["Tension Stand 2 / Poly / Windup", "/ts2-poly-windup", "Line/TS2 Poly Windup", "20 Line 20"]] },
  { key: "maint", text: "Maintenance", icon: "material/build", pages: [
    ["I/O", "/io", "Maintenance/IO", "maint00"], ["Zone Setup", "/zone-setup", "Maintenance/Zone Setup", "30 Maint 10"], ["VFD Drives", "/vfd-drives", "Maintenance/VFD Drives", "maint20"],
    ["Servo Drives", "/servo-drives", "Maintenance/Servo Drives", "maint30"], ["PM Schedule", "/pm-schedule", "Maintenance/PM Schedule", "maint40"]] },
  { key: "trend", text: "Trends", icon: "material/show_chart", pages: [
    ["Oven Trend", "/oven-trend", "Trends/Oven Trend", "otrend00"], ["Trend", "/trend", "Trends/Trend", "trend00"]] },
  { key: "alarms", text: "Alarms", icon: "material/notifications", pages: [
    ["Alarms", "/alarms", "Alarms/Alarms", "alarm00"], ["Warnings", "/warnings", "Alarms/Warnings", "alarm10"],
    ["History", "/alarm-history", "Alarms/History", "alarm20"]] },
];

function buildFramework() {
  const park = dataUri("park_logo.png"), litzler = dataUri("litzler_logo.png");
  const alarmCount = {
    "custom.numAlarms": expr("now(5000)", [scriptT(
      "\treturn len(system.alarm.queryStatus(priority=['High', 'Critical'], state=['ActiveAcked', 'ActiveUnacked']))")]),
  };
  const loginScript = { dom: { onClick: { type: "script", scope: "G", config: { script: "\tif self.session.props.auth.authenticated:\n\t\tsystem.perspective.logout()\n\telse:\n\t\tsystem.perspective.login()" } } } };
  const icon = (name, p, position, extra = {}) => ({ type: "ia.display.icon", meta: { name }, position, props: { path: p, style: { classes: "cal1615/header-icon" } }, ...extra });
  const menuBtn = { type: "ia.input.button", meta: { name: "menuButton" }, position: { basis: "80px", shrink: 0 }, props: { text: "Menu", image: { icon: { path: "material/menu" } } },
    events: { component: { onActionPerformed: { type: "dock", scope: "C", config: { id: "nav", type: "toggle" } } } } };
  const alarms = (showText) => [
    icon("alarmIcon", "material/notifications", { basis: "26px", shrink: 0 }, {
      propConfig: { "props.style.classes": expr('if({../alarmCount.custom.numAlarms} > 0, "cal1615/alarm-active", "cal1615/header-icon")') },
      events: { dom: { onClick: { type: "nav", scope: "C", config: { page: "/alarms" } } } } }),
    label("alarmCount", "", { style: { cursor: "pointer" } }, { shrink: 0 }, {
      custom: { numAlarms: 0 },
      propConfig: { ...alarmCount,
        "props.text": expr(showText ? 'numberFormat({this.custom.numAlarms}, "#,##0") + if({this.custom.numAlarms} = 1, " alarm", " alarms")' : 'toStr({this.custom.numAlarms})'),
        "props.style.classes": expr('if({this.custom.numAlarms} > 0, "cal1615/alarm-active", "")') },
      events: { dom: { onClick: { type: "nav", scope: "C", config: { page: "/alarms" } } } } }),
  ];
  // Top bar: one tab per section (no dropdowns); the section's pages are in the side nav.
  const hmenuItems = NAV.map((s) => ({ label: s.text, icon: { path: "" }, enabled: true, target: s.pages[0][1], style: {}, items: [] }));

  writeView("Framework/Header Large", view({
    size: { width: 1280, height: 56 },
    root: flex("root", [
      menuBtn,
      { type: "ia.display.image", meta: { name: "parkLogo" }, position: { basis: "190px", shrink: 0 }, props: { source: park, fit: { mode: "contain" } },
        events: { dom: { onClick: { type: "nav", scope: "C", config: { page: "/" } } } } },
      { type: "ia.navigation.horizontalmenu", meta: { name: "sections" }, position: { grow: 1, basis: "500px" }, props: { items: hmenuItems, style: { border: "none" } },
        propConfig: Object.fromEntries(NAV.map((s) => [s, s.pages.map(([, u]) => u).concat(s.key === "main" ? ["/"] : [])]).map(([s, urls], i) => [`props.items[${i}].style.classes`,
          expr(`if(${urls.map((u) => `{page.props.path} = "${u}"`).join(" || ")}, "cal1615/nav-top-selected", "cal1615/nav-top")`)])) },
      icon("user", "material/person", { basis: "28px", shrink: 0 }, { events: loginScript }),
      label("userName", "", { style: { cursor: "pointer", paddingRight: "12px" } }, { shrink: 0 }, {
        propConfig: { "props.text": expr('if({session.props.auth.authenticated}, {session.props.auth.user.userName}, "Login")') }, events: loginScript }),
      ...alarms(true),
      { type: "ia.display.image", meta: { name: "litzlerLogo" }, position: { basis: "160px", shrink: 0 }, props: { source: litzler, fit: { mode: "contain" } } },
    ], { direction: "row", alignItems: "center", style: { classes: "cal1615/header", gap: "8px", paddingLeft: "6px", paddingRight: "6px" } }),
  }));
  writeView("Framework/Header Small", view({
    size: { width: 400, height: 56 },
    root: flex("root", [
      { type: "ia.display.image", meta: { name: "parkLogo" }, position: { basis: "150px", shrink: 1 }, props: { source: park, fit: { mode: "contain" } },
        events: { dom: { onClick: { type: "nav", scope: "C", config: { page: "/" } } } } },
      ...alarms(false),
      icon("user", "material/person", { basis: "28px", shrink: 0 }, { events: loginScript }),
      menuBtn,
    ], { direction: "row", alignItems: "center", style: { classes: "cal1615/header", gap: "8px", paddingLeft: "6px", paddingRight: "6px" } }),
  }));
  writeView("Framework/Header", view({
    size: { width: 1280, height: HEADER_H_PX },
    root: { type: "ia.container.breakpt", meta: { name: "root" }, props: { breakpoint: 900 }, children: [
      embed("small", "Framework/Header Small", {}),
      { ...embed("large", "Framework/Header Large", {}), position: { size: "large" } },
    ] },
  }));

  // Left dock menu (opened by the Menu button); same tree on desktop and mobile.
  const treeItems = NAV.map((s) => ({
    label: { text: s.text, icon: { path: s.icon } }, navIcon: { path: "material/chevron_right" }, target: "", enabled: true, visible: true, showHeader: true,
    style: { classes: "cal1615/nav-header" },
    items: s.pages.map(([t, url]) => ({ label: { text: t, icon: { path: "" } }, navIcon: { path: "" }, target: url, enabled: true, visible: true, showHeader: true, items: [], style: { classes: "" } })),
  }));
  writeView("Framework/Nav Menu", view({
    size: { width: 280, height: 800 },
    root: flex("root", [
      { type: "ia.navigation.menutree", meta: { name: "menu" }, position: { grow: 1, basis: "300px" },
        props: { items: treeItems, itemStyle: { classes: "cal1615/nav-item" }, headerStyle: { classes: "cal1615/nav-header" } } },
      flex("theme", [
        label("lbl", "Theme", {}, { basis: "60px", shrink: 0 }),
        { type: "ia.input.dropdown", meta: { name: "theme" }, position: { grow: 1, basis: "0" },
          props: { options: [{ label: "Light", value: "light" }, { label: "Dark", value: "dark" }, { label: "Light (Cool)", value: "light-cool" }, { label: "Dark (Cool)", value: "dark-cool" }] },
          propConfig: { "props.value": { binding: { type: "property", config: { path: "session.props.theme", bidirectional: true } } } } },
      ], { direction: "row", alignItems: "center", style: { padding: "8px" } }, { basis: "52px", shrink: 0 }),
    ], { direction: "column", style: { backgroundColor: "var(--neutral-20)" } }),
  }));

  // Section side nav (left dock), styled like cal2016's sidebar: a MenuTree of the section's pages with the
  // current page highlighted. On narrow screens, where the top tabs are hidden, the other sections follow.
  const navData = { titles: Object.fromEntries(NAV.map((s) => [s.key, s.text])),
    pages: Object.fromEntries(NAV.map((s) => [s.key, s.pages.map(([t, u]) => [t, u])])),
    sections: NAV.map((s) => [s.key, s.text, s.pages[0][1]]) };
  writeView("Framework/Section Nav", view({
    params: { section: "main" },
    size: { width: SIDE_NAV_W, height: 1000 },
    root: flex("root", [
      label("title", "", { style: { classes: "cal1615/sidebar-heading" } }, { basis: "40px", shrink: 0 }, {
        propConfig: { "props.text": prop("view.params.section", [scriptT("\treturn " + JSON.stringify(navData.titles) + ".get(value, '')")]) } }),
      { type: "ia.navigation.menutree", meta: { name: "menu" }, position: { grow: 1, basis: "0" },
        props: { items: [], itemStyle: { classes: "cal1615/sidebar-items" } },
        propConfig: { "props.items": expr('{view.params.section} + "|" + {page.props.path} + "|" + if({page.props.dimensions.viewport.width} < 900, "narrow", "wide")', [scriptT(
          "\tsection, path, width = value.split('|')\n" +
          "\tpages = " + JSON.stringify(navData.pages) + "\n" +
          "\tsections = " + JSON.stringify(navData.sections) + "\n" +
          "\tdef item(text, target, selected):\n" +
          "\t\treturn {'label': {'text': text, 'icon': {'path': ''}}, 'navIcon': {'path': ''}, 'target': target, 'enabled': True, 'visible': True,\n" +
          "\t\t\t'showHeader': True, 'items': [], 'style': {'classes': 'cal1615/sidebar-items-selected' if selected else 'cal1615/sidebar-items'}}\n" +
          "\tout = [item(t, u, path == u or (path == '/' and u == '/overview')) for t, u in pages.get(section, [])]\n" +
          "\tif width == 'narrow':\n" +
          "\t\tout += [item(text, target, key == section) for key, text, target in sections if key != section]\n" +
          "\treturn out")]) } },
    ], { direction: "column", style: { backgroundColor: "var(--neutral-20)", borderRightStyle: "solid", borderRightWidth: "1px", borderRightColor: "var(--neutral-50)" } }),
  }));

  // Placeholder for screens not built yet: names the RSView screen print to build from.
  writeView("Framework/Placeholder", view({
    params: { title: "", screenPrint: "" },
    root: flex("root", [
      label("title", "", { style: { classes: "cal1615/placeholder", fontSize: "24px", fontWeight: "bold" } }, { basis: "48px", shrink: 0 }, { propConfig: { "props.text": prop("view.params.title") } }),
      label("msg", "", { style: { classes: "cal1615/placeholder" } }, { basis: "60px", shrink: 0 }, {
        propConfig: { "props.text": expr('"Not built yet. Content reference: 1615/SCREEN PRINTS/" + {view.params.screenPrint} + ".bmp"') } }),
    ], { direction: "column", justify: "center", style: { classes: "cal1615/page" } }),
  }));
}

function buildPageConfig() {
  const docks = (section) => ({
    top: [
      { id: "header", viewPath: "Framework/Header", size: HEADER_H_PX, show: "visible", content: "push", anchor: "fixed", autoBreakpoint: 0, handle: "hide", modal: false, resizable: false, iconUrl: "", viewParams: {} },
    ],
    left: [
      { id: "nav", viewPath: "Framework/Section Nav", size: SIDE_NAV_W, show: "auto", content: "push", anchor: "fixed", autoBreakpoint: 1000, handle: "hide", modal: false, resizable: false, iconUrl: "", viewParams: { section } },
    ],
  });
  const pages = {};
  const placeholderViews = new Set();
  for (const s of NAV) {
    for (const [title, url, vpath, shot] of s.pages) {
      let v = vpath;
      if (!v) {
        v = `Placeholders/${s.text}/${title.replace(/\//g, "-")}`;
        writeView(v, view({ root: flex("root", [embed("placeholder", "Framework/Placeholder", { title, screenPrint: shot }, { grow: 1, basis: "0" })], { direction: "column" }) }));
        placeholderViews.add(v);
      }
      pages[url] = { title: `1615 ${title}`, viewPath: v, docks: docks(s.key) };
    }
  }
  pages["/"] = { ...pages["/overview"] };
  write(path.join(P, "page-config/config.json"), { pages, sharedDocks: { cornerPriority: "top-bottom" } });
  write(path.join(P, "page-config/resource.json"), resource(["config.json"]));
}

function buildSessionProps(cal2016SessionProps) {
  const sp = JSON.parse(fs.readFileSync(cal2016SessionProps));
  sp.custom = { ...(sp.custom || {}), canOperate: false, ...SESSION_CUSTOM };
  // One place to decide who may write setpoints and press command buttons.
  sp.propConfig = { ...(sp.propConfig || {}), "custom.canOperate": { binding: { type: "expr", config: { expression: "{session.props.auth.authenticated}" } } } };
  sp.props = { ...(sp.props || {}), theme: "light" };
  delete sp.props.address;
  write(path.join(P, "session-props/props.json"), sp);
  write(path.join(P, "session-props/resource.json"), resource(["props.json"]));
}

// ---------------------------------------------------------------- tag import file
function buildTags() {
  // Build the folder tree from each tag's path segments.
  const root = { name: "", tagType: "Provider", tags: [] };
  const folder = (parent, name) => {
    let f = parent.tags.find((x) => x.name === name && x.tagType === "Folder");
    if (!f) parent.tags.push((f = { name, tagType: "Folder", tags: [] }));
    return f;
  };
  for (const t of usedTags.values()) {
    const parent = t.segs.slice(0, -1).reduce(folder, root);
    const name = t.segs[t.segs.length - 1];
    parent.tags.push(t.plc
      ? { dataType: DTYPE[t.type] || "Float4", name, opcItemPath: OPC_PREFIX + t.plc, opcServer: OPC_SERVER, tagType: "AtomicTag", valueSource: "opc",
          ...(t.history ? { historyEnabled: true, historyProvider: HISTORY_PROVIDER } : {}) }
      : { dataType: DTYPE[t.type] || "Float4", name, tagType: "AtomicTag", valueSource: "memory", value: t.value ?? "" });
  }
  const sort = (n) => { if (n.tags) { n.tags.sort((a, b) => a.name.localeCompare(b.name)); n.tags.forEach(sort); } };
  sort(root);
  write(path.join(OUT, "tags", "cal1615_tags.json"), root);
  const unmapped = Object.entries(TAGMAP).filter(([, e]) => !e.tag).map(([k]) => k);
  return { count: usedTags.size, unmapped };
}

const SESSION_CUSTOM = {};
// ---------------------------------------------------------------- run
fs.rmSync(P, { recursive: true, force: true });
fs.rmSync(path.join(OUT, "ignition"), { recursive: true, force: true });
write(path.join(OUT, "project.json"), {
  title: "cal1615_ignition", description: "Park cal1615 prepreg treater HMI (Perspective). Framework from cal2016, content from the RSView screens.",
  parent: "", enabled: true, inheritable: false,
});
for (const [k, v] of Object.entries(S)) writeStyle(k, v);
buildComponents();
buildZoneTable();
buildSafetyPins();
buildRecipeBanner();
buildMain();
buildEstops();
buildAlarms();
// Remaining pages live in pages.js and share these helpers.
Object.assign(SESSION_CUSTOM, require("./pages.js")({
  fs, path, OUT, P, TAGMAP, T, TW, TH, tagFor, penSource, ENUM, E, C, en, R, led, btn, card, withPos, cardHeight,
  ROW_PARAMS, ROW_H, HEADER_H, view, flex, label, embed, expr, prop, tagIndirect, scriptT, writeView, writeScript, dataUri, PROVIDER,
  fixedLayout, LARGE_BREAKPOINT, NOW,
}) || {});
buildFramework();
buildPageConfig();
buildSessionProps(process.argv[4]);
const r = buildTags();
console.log("tags used:", r.count, "unmapped fields:", r.unmapped.join(", ") || "none");
