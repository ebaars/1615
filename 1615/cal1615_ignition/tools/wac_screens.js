// Winder (exit) accumulator on the Main Overview and on Line 20 (Tension Stand 2 / Polys / Windup), following the new FactoryTalk screen prints
// (SCREEN PRINTS/New folder): the drawings got the accumulator tower (tools/drawings, node build.js line_overview line_winder), and here:
//   - tags:  Program_P31_WAC/{ai_tension, di_high_limit, di_low_limit, do_close_nip_sol, di_ss_acc_on}  (the card and the lamps read them)
//   - Components/Main/Winder Accumulator: Mode (On/Off), Position %, Tension LBS, Stored FT, Status
//   - Overview: the cards that sat where the tower now stands are moved beside it
//   - Line 20: Accumulator Full LS and Nip Open lamps, the cards beside the tower moved
// Run: node wac_screens.js   (idempotent)
const fs = require("fs");
const R = "E:/aaa_projects/ParkTemp/1615";
const V = R + "/cal1615_std/com.inductiveautomation.perspective/views";
const rd = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const wr = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));

// ---- tags
const TF = R + "/cal1615_ignition/tags/cal1615_tags.json";
const tj = rd(TF);
const wac = tj.tags.find((t) => t.name === "Program_P31_WAC");
const opc = (name, dataType) => ({ dataType, name, opcItemPath: `nsu=FTLGW_Server_Namespace;s=[PLC]Program:P31_WAC.${name}`, opcServer: "cal1615", tagType: "AtomicTag", valueSource: "opc" });
for (const [n, t] of [["ai_tension", "Float4"], ["di_high_limit", "Boolean"], ["di_low_limit", "Boolean"], ["do_close_nip_sol", "Boolean"], ["di_ss_acc_on", "Boolean"]]) {
  if (!wac.tags.some((x) => x.name === n)) wac.tags.push(opc(n, t));
}
fs.writeFileSync(TF, JSON.stringify(tj, null, 2) + "\n");

// ---- the card
const cf = `${V}/Components/Main/Winder Accumulator/view.json`;
const card = rd(cf);
const rows = Object.fromEntries(card.root.children.filter((c) => /^row\d$/.test(c.meta.name)).map((c) => [c.meta.name, c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const WAC = "[cal1615]Program_P31_WAC/";
const tension = clone(rows.row0);
tension.meta.name = "row_tension";
tension.children[0].props.text = "Tension";
tension.children[1].propConfig["props.text"].binding.config.tagPath = WAC + "ai_tension";
tension.children[2].props.text = "LBS";
const mode = clone(rows.row2);
mode.meta.name = "row_mode";
mode.children[0].props.text = "Mode";
const lab = mode.children[1];
const tagBinding = (transform) => ({ binding: { type: "tag", config: { fallbackDelay: 2.5, mode: "direct", tagPath: WAC + "di_ss_acc_on", bidirectional: false }, transforms: [transform] } });
lab.propConfig = {
  "props.text": tagBinding({ type: "map", inputType: "scalar", outputType: "scalar", mappings: [{ input: true, output: "On" }, { input: false, output: "Off" }], fallback: "---" }),
  "props.style.backgroundColor": tagBinding({ type: "map", inputType: "scalar", outputType: "color", mappings: [{ input: true, output: "#00E000" }, { input: false, output: "#E0E0E0" }], fallback: "#FFFFFF" }),
};
card.root.children = [card.root.children.find((c) => c.meta.name === "header"), mode, rows.row0, tension, rows.row1, rows.row2];
card.props.defaultSize.height = 26 + 5 * 28;
wr(cf, card);

// ---- Overview
const of = `${V}/MainViews/Feature Views/Home/Overview - Large/view.json`;
const ov = rd(of);
const place = (view, name, pos) => { const c = view.root.children.find((x) => x.meta.name === name); if (!c) throw new Error("no child " + name); c.position = { ...c.position, ...pos }; return c; };
place(ov, "winderAccumulator", { height: 26 + 5 * 28 });
place(ov, "upperPoly", { x: 1308, y: 250 });
place(ov, "winderFootage", { x: 1534, y: 204, width: 129 });
wr(of, ov);

// ---- Line 20
const lf = `${V}/MainViews/Feature Views/Line/TS2 Poly Windup - Large/view.json`;
const ln = rd(lf);
place(ln, "upper", { x: 380, y: 72 });
place(ln, "wfoot", { x: 850, y: 160 });
place(ln, "turret", { x: 866, y: 336, width: 170 }).props.params.text = "Turret in Position";
ln.root.children = ln.root.children.filter((c) => c.meta.name !== "fullLS" && c.meta.name !== "nipWac");
const lamp = (name, x, y, w, params) => ({ type: "ia.display.view", meta: { name }, position: { x, y, width: w, height: 32 }, props: { path: "Components/Common/Indicator", params } });
ln.root.children.push(lamp("fullLS", 830, 72, 200, { text: "Accumulator Full LS", tagPath: WAC + "di_high_limit", onColor: "#00E000", offColor: "#FFFF00", invert: false }));
ln.root.children.push(lamp("nipWac", 830, 112, 116, { text: "Nip Open", tagPath: WAC + "do_close_nip_sol", onColor: "#00E000", offColor: "#D0D0D0", invert: true }));
wr(lf, ln);
console.log("winder accumulator: tags, card, Overview and Line 20 updated");
