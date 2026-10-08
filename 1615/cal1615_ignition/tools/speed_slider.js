// Spring conveyor speed offset slider (-5..+5 %) for the top-left corner of the Overview (the original program had one there).
//   Components/Main/Line Speed Slider: title, slider, the chosen offset, the PLC value, and a Set button that appears when the slider differs from the
//   PLC value. Nothing is written until Set is pressed. Reads and writes [cal1615]p23r17_spd_adj (adjusted speed = selected x (1 + adj/100 - 0.02)).
// Run: node speed_slider.js   (idempotent: replaces the slider on the Overview)
const fs = require("fs"), path = require("path");
const MAX = 5, STEP = 0.1;            // +/- limit in percent
const R = "E:/aaa_projects/ParkTemp/1615";
const V = R + "/cal1615_std/com.inductiveautomation.perspective/views";
const RESOURCE = fs.readFileSync(`${V}/MainViews/Feature Views/Ovens/RTO - Large/resource.json`, "utf8");
const AUTH = "{session.props.auth.authenticated}";
const SP = "{[cal1615]p23r17_spd_adj}";
const expr = (expression) => ({ binding: { type: "expr", config: { expression } } });
const lbl = (name, text, position, style, propConfig) => ({ type: "ia.display.label", meta: { name }, position, props: { text, style }, ...(propConfig ? { propConfig } : {}) });

const bidir = { binding: { type: "property", config: { path: "view.custom.sel", bidirectional: true } } };
const view = {
  custom: { sel: 0 }, params: {},
  // sel follows the PLC value; the slider and the entry box both edit it locally until the PLC value changes
  propConfig: { "custom.sel": expr(`coalesce(${SP}, 0)`) },
  props: { defaultSize: { width: 490, height: 52 } },
  root: { type: "ia.container.flex", meta: { name: "root" }, position: {}, props: { direction: "row", alignItems: "center", style: { classes: "cal1615/card", gap: "10px", paddingLeft: "12px", paddingRight: "12px" } },
    children: [
      lbl("title", "Spring Conv.", { basis: "92px", shrink: 0 }, { fontSize: "14px", fontWeight: "bold", textAlign: "left" }),
      { type: "ia.input.slider", meta: { name: "slider" }, position: { grow: 1, basis: "0" },
        props: { min: -MAX, max: MAX, step: STEP, value: 0 },
        propConfig: { "props.value": bidir, "props.enabled": expr(AUTH) } },
      { type: "ia.input.numeric-entry-field", meta: { name: "entry" }, position: { basis: "64px", shrink: 0 },
        props: { format: "0.0", spinner: { enabled: false }, style: { classes: "cal1615/entry" } },
        propConfig: { "props.value": bidir, "props.enabled": expr(AUTH) } },
      lbl("pct", "%", { basis: "14px", shrink: 0 }, { fontSize: "14px", fontWeight: "bold" }),
      { type: "ia.input.button", meta: { name: "set" }, position: { basis: "46px", shrink: 0 },
        props: { text: "Set", primary: true, style: { fontSize: "13px" } },
        propConfig: { "position.display": expr(`abs({view.custom.sel} - coalesce(${SP}, 0)) > 0.05`), "props.enabled": expr(AUTH) },
        events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script:
          "\tsystem.tag.writeBlocking(['[cal1615]p23r17_spd_adj'], [max(-" + MAX + ".0, min(" + MAX + ".0, float(self.view.custom.sel)))])" } } } } },
      lbl("actual", "", { basis: "66px", shrink: 0 }, { fontSize: "11px", opacity: "0.75", textAlign: "right", whiteSpace: "nowrap" },
        { "props.text": expr(`'PLC ' + numberFormat(coalesce(${SP}, 0), '0.0')`) }),
    ] },
};
const dir = `${V}/Components/Main/Line Speed Slider`;
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(`${dir}/view.json`, JSON.stringify(view, null, 2));
fs.writeFileSync(`${dir}/resource.json`, RESOURCE);

const of = `${V}/MainViews/Feature Views/Home/Overview - Large/view.json`;
const ov = JSON.parse(fs.readFileSync(of, "utf8"));
ov.root.children = ov.root.children.filter((c) => c.meta.name !== "speedSlider");
ov.root.children.push({ type: "ia.display.view", meta: { name: "speedSlider" }, position: { x: 16, y: 7, width: 490, height: 52 }, props: { path: "Components/Main/Line Speed Slider", params: {} } });
fs.writeFileSync(of, JSON.stringify(ov, null, 2));
console.log("Line Speed Slider written and placed at the top left of the Overview");
