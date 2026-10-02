// Trend page (AdHocTrends): simple template bar - Template [dropdown] Load Update Delete | [name] Store New.
// Replaces Ad Hoc Trends' own Load/Save-to-DB panels (hidden). Logic is in the project script cal1615.trends.
// Run: node trend_bar.js   (idempotent)
const fs = require("fs");
const F = "E:/aaa_projects/ParkTemp/1615/cal1615_std/com.inductiveautomation.perspective/views/MainViews/Feature Views/Trending/AdHocTrends/view.json";
const v = JSON.parse(fs.readFileSync(F, "utf8"));

const AUTH = "{session.props.auth.authenticated}";
const SEL = "!isNull({../Templates.props.value})";
const expr = (expression) => ({ binding: { type: "expr", config: { expression } } });
const script = (code) => ({ component: { onActionPerformed: { type: "script", scope: "G", config: { script: code } } } });
const button = (name, text, basis, enabled, code, primary = false) => ({
  type: "ia.input.button", meta: { name }, position: { basis, shrink: 0 },
  props: { text, primary, style: { fontSize: "13px" } },
  propConfig: { "props.enabled": expr(enabled) }, events: script(code) });
const USER = "\tuser = self.session.props.auth.user.userName\n";
const ID = "\tid = self.getSibling('Templates').props.value\n";
const REFRESH = "\tself.view.custom.templateRefresh += 1\n";

const bar = {
  type: "ia.container.flex", meta: { name: "TemplateBar" }, position: { shrink: 0, basis: "44px" },
  props: { direction: "row", alignItems: "center", style: { gap: "6px", padding: "4px 10px", borderBottom: "1px solid var(--neutral-30)" } },
  children: [
    { type: "ia.display.label", meta: { name: "Label" }, position: { basis: "70px", shrink: 0 }, props: { text: "Template", style: { fontWeight: "bold", fontSize: "13px" } } },
    { type: "ia.input.dropdown", meta: { name: "Templates" }, position: { basis: "320px", shrink: 0 },
      props: { value: null, placeholder: { text: "Select a saved trend..." }, search: { enabled: true }, style: { fontSize: "13px" } },
      propConfig: { "props.options": { binding: { type: "expr", config: { expression: "{view.custom.templateRefresh}" },
        transforms: [{ type: "script", code: "\treturn cal1615.trends.options()" }] } } } },
    button("Load", "Load", "80px", SEL,
      ID + "\tcfg = cal1615.trends.load(id)\n\tif cfg:\n\t\tself.view.rootContainer.loadFromFile(cfg, True, True)\n\t\tself.view.custom.templateMsg = 'Loaded.'\n\telse:\n\t\tself.view.custom.templateMsg = 'Nothing stored for that trend.'", true),
    button("Update", "Update", "80px", `${AUTH} && ${SEL}`,
      USER + ID + "\tcfg = self.view.rootContainer.getConfigJson(True, True)\n\tself.view.custom.templateMsg = cal1615.trends.update(id, cfg, user)"),
    button("Delete", "Delete", "80px", `${AUTH} && ${SEL}`,
      USER + ID + "\tself.view.custom.templateMsg = cal1615.trends.delete(id, user)\n\tif self.view.custom.templateMsg.startswith('Deleted'):\n\t\tself.getSibling('Templates').props.value = None\n" + REFRESH),
    { type: "ia.display.label", meta: { name: "Message" }, position: { grow: 1, basis: "0" },
      props: { text: "", style: { fontSize: "12px", color: "var(--neutral-70)", paddingLeft: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } },
      propConfig: { "props.text": { binding: { type: "property", config: { path: "view.custom.templateMsg" } } } } },
    { type: "ia.input.text-field", meta: { name: "NewName" }, position: { basis: "220px", shrink: 0 },
      props: { text: "", placeholder: "new trend name", deferUpdates: false, style: { fontSize: "13px" } }, propConfig: { "props.enabled": expr(AUTH) } },
    button("Store", "Store New", "110px", `${AUTH} && len(trim({../NewName.props.text})) > 0`,
      USER + "\tname = self.getSibling('NewName').props.text.strip()\n\tif name:\n\t\tself.view.rootContainer.setTitle(name)  # chart title = trend name\n\tcfg = self.view.rootContainer.getConfigJson(True, True)\n\tid, msg = cal1615.trends.store(name, cfg, user)\n\tself.view.custom.templateMsg = msg\n\tif id is not None:\n\t\tself.getSibling('NewName').props.text = ''\n" + REFRESH + "\t\tself.getSibling('Templates').props.value = id"),
  ],
};
// fix indentation of the last two lines of Store (inside the if)
bar.children[bar.children.length - 1].events.component.onActionPerformed.config.script =
  bar.children[bar.children.length - 1].events.component.onActionPerformed.config.script.replace("\tself.view.custom.templateRefresh += 1\n\t\tself", "\t\tself.view.custom.templateRefresh += 1\n\t\tself");

v.custom = { ...v.custom, templateRefresh: 0, templateMsg: "" };
v.root.children = v.root.children.filter((c) => c.meta.name !== "TemplateBar");
v.root.children.splice(v.root.children.findIndex((c) => c.meta.name === "MainTopControls") + 1, 0, bar);

// hide Ad Hoc Trends' own database buttons (replaced by the bar)
let hidden = 0;
(function w(c, p) {
  if (/^(ConfigureDatabases|LoadFromDb|SaveToDb|DbSpacer)$/.test(c.meta.name) && /Controls$/.test(p)) {
    if (c.propConfig) delete c.propConfig["position.display"];
    c.position = { ...(c.position || {}), display: false }; hidden++;
  }
  (c.children || []).forEach((k) => w(k, p + "/" + c.meta.name));
})(v.root, "");
fs.writeFileSync(F, JSON.stringify(v, null, 2));
console.log("template bar added; ad hoc DB buttons hidden:", hidden);
