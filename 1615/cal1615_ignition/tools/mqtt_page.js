// MQTT page for cal1615_std: Maintenance/MQTT (route /mqtt). Shows what the AWS IoT link (tools/mqtt_tick.py) is doing, the last messages sent and
// received, the Publish now button and the settings (endpoint, topic, client id, which tags incoming messages may write).
// Project script: cal1615.mqtt (ignition/script-python/cal1615/mqtt). Run: node mqtt_page.js
const fs = require("fs"), path = require("path");
const R = "E:/aaa_projects/ParkTemp/1615";
const P = R + "/cal1615_std/com.inductiveautomation.perspective";
const V = P + "/views";
const rd = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
const RESOURCE = fs.readFileSync(`${V}/MainViews/Feature Views/Ovens/RTO - Large/resource.json`, "utf8");
const writeView = (vp, v) => { wr(`${V}/${vp}/view.json`, v); fs.writeFileSync(`${V}/${vp}/resource.json`, RESOURCE); };

const AUTH = "{session.props.auth.authenticated}";
const expr = (expression) => ({ binding: { type: "expr", config: { expression } } });
const lbl = (name, text, cls, position, propConfig, style) => ({ type: "ia.display.label", meta: { name }, position, props: { text, style: { classes: cls, ...(style || {}) } }, ...(propConfig ? { propConfig } : {}) });
const card = (name, header, children, position) => ({ type: "ia.container.flex", meta: { name }, position,
  props: { direction: "column", style: { classes: "cal1615/card", paddingBottom: "4px" } },
  children: [lbl("header", header, "cal1615/card-header", { basis: "26px", shrink: 0 }), ...children] });
const textLbl = (name, e, style = {}) => ({ type: "ia.display.label", meta: { name }, position: { basis: "auto", shrink: 0 },
  props: { text: "", style: { fontSize: "12px", padding: "2px 8px", textAlign: "left", whiteSpace: "pre-wrap", ...style } }, propConfig: { "props.text": expr(e) } });
const tagVal = (t) => `{[cal1615]HMI/MQTT/${t}}`;
const publishNow = { type: "ia.input.button", meta: { name: "publishNow" }, position: { basis: "150px", shrink: 0 },
  props: { text: "Publish now", primary: true, style: { fontSize: "14px" } }, propConfig: { "props.enabled": expr(`${AUTH} && ${tagVal("connected")}`) },
  events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script: "\tsystem.tag.writeBlocking(['[cal1615]HMI/MQTT/publish_now'], [True])" } } } } };

// settings: a label above a text field (the values are long); keys and labels come from cal1615.mqtt.SETTINGS, keep in step
const SETTINGS = [["enabled", "MQTT on (1 = on, 0 = off)"], ["format", "Format: sparkplug (MachineIQ) or json (one plain topic)"], ["endpoint", "AWS IoT endpoint (xxxx-ats.iot.<region>.amazonaws.com)"],
  ["port", "Port"], ["group_id", "Sparkplug group = customer"], ["edge_node_id", "Sparkplug edge node = machine"], ["device_id", "Sparkplug device = location"],
  ["topic", "Topic (json format only)"], ["client_id", "Client id (must be allowed by the AWS IoT policy)"], ["publish_s", "Check for changes every (seconds)"],
  ["float_tol", "A float is sent only when it moved more than"], ["critical_s", "Critical metrics are re-sent every (seconds)"], ["qos", "QoS (0 or 1)"],
  ["write_tags", "Metrics / tags that incoming commands may write (comma list, empty = none)"], ["publish_tags", "Tags to publish (json format only; empty = all logged process values)"]];
const SAVE = (key, from) => `	ok, msg = cal1615.mqtt.set_cfg('${key}', ${from}.props.text, self.session.props.auth.user.userName)
	self.view.custom.msg = '${key}: ' + msg`;
const setRow = ([key, title]) => ({ type: "ia.container.flex", meta: { name: `s_${key}` }, position: { basis: "auto", shrink: 0 },
  props: { direction: "column", style: { padding: "3px 8px", gap: "2px" } },
  children: [lbl("title", title, "cal1615/row-label", { basis: "auto", shrink: 0 }, undefined, { fontSize: "11px", textAlign: "left" }),
    { type: "ia.container.flex", meta: { name: "line" }, position: { basis: "30px", shrink: 0 }, props: { direction: "row", alignItems: "center", style: { gap: "6px" } },
      children: [
        { type: "ia.input.text-field", meta: { name: "entry" }, position: { grow: 1, basis: "0" },
          props: { style: { classes: "cal1615/entry", fontSize: "13px", textAlign: "left" } },
          propConfig: { "props.text": expr(`{view.custom.cfg.${key}}`), "props.enabled": expr(AUTH) },
          events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script: SAVE(key, "self") } } } } },
        { type: "ia.input.button", meta: { name: "save" }, position: { basis: "60px", shrink: 0 },
          props: { text: "Save", style: { fontSize: "12px" } }, propConfig: { "props.enabled": expr(AUTH) },
          events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script: SAVE(key, "self.parent.getChild('entry')") } } } } }] }] });

// Register with PulseMQ: the gateway makes its own key and certificate request, the operator signs in with the PulseMQ (Cognito) email and password for this one
// request, MachineIQ issues the certificate, and the settings follow (cal1615.mqtt.register). Nothing typed here is stored.
const two = (path) => ({ binding: { type: "property", config: { path, bidirectional: true } } });
const regField = (name, title, kind, key, extra = {}) => ({ type: "ia.container.flex", meta: { name: `r_${name}` }, position: { basis: "auto", shrink: 0 },
  props: { direction: "column", style: { padding: "3px 8px", gap: "2px" } },
  children: [lbl("title", title, "cal1615/row-label", { basis: "auto", shrink: 0 }, undefined, { fontSize: "11px", textAlign: "left" }),
    { type: kind, meta: { name: "entry" }, position: { basis: "28px", shrink: 0 }, props: { style: { classes: "cal1615/entry", fontSize: "13px", textAlign: "left" }, ...extra },
      propConfig: { "props.text": two(`view.custom.reg.${key}`), "props.enabled": expr(AUTH) } }] });
const registerButton = { type: "ia.input.button", meta: { name: "register" }, position: { basis: "36px", shrink: 0 },
  props: { text: "Register with PulseMQ", primary: true, style: { fontSize: "14px", margin: "4px 8px" } }, propConfig: { "props.enabled": expr(AUTH) },
  events: { component: { onActionPerformed: { type: "script", scope: "G", config: { script:
    [
      "\treg = self.view.custom.reg",
      "\tself.view.custom.regmsg = 'Registering ...'",
      "\tok, msg = cal1615.mqtt.register(str(reg.customer), str(reg.machine), str(reg.serial), str(reg.email), str(reg.password), bool(reg.rotate))",
      "\tself.view.custom.reg.password = ''",
      "\tself.view.custom.regmsg = ('Done. ' if ok else 'Not registered. ') + msg",
    ].join("\n") } } } } };
const rotateBox = { type: "ia.input.checkbox", meta: { name: "rotate" }, position: { basis: "28px", shrink: 0 },
  props: { text: "Replace the existing certificate of this thing (revokes the old one)", style: { fontSize: "11px", margin: "0 8px" } },
  propConfig: { "props.selected": two("view.custom.reg.rotate"), "props.enabled": expr(AUTH) } };

const COLS = (defs) => defs.map(([field, title, width]) => ({ field, header: { title }, width }));
const msgTable = { type: "ia.display.table", meta: { name: "messages" }, position: { grow: 1, basis: "0" },
  props: { columns: COLS([["time", "Time", 110], ["kind", "Kind", 60], ["text", "Message", 560]]) },
  propConfig: { "props.data": expr('runScript("cal1615.mqtt.recent", 2000, 60)') } };

const HOW = "Sparkplug B for MachineIQ (default): on connect the gateway sends NBIRTH and DBIRTH (all 109 AJ line metrics, retained), then DDATA with what changed: a float only "
  + "when it moved more than the tolerance, critical metrics on any change and again every few minutes. Commands (NCMD, DCMD) can ask for a rebirth or write the metrics "
  + "listed under Metrics that incoming commands may write; anything else is refused. The json format sends the process values as one JSON message to a plain topic instead. "
  + "The certificate files go in the folder data/mqtt on the gateway (certificate.pem.crt, private.pem.key, AmazonRootCA1.pem), never in git.";

const view = {
  custom: { msg: "", cfg: {}, regmsg: "", reg: { customer: "CUST07", machine: "MACH00", serial: "", email: "", password: "", rotate: false } },
  params: {},
  propConfig: { "custom.cfg": expr('runScript("cal1615.mqtt.get_cfg", 0)') },
  props: { defaultSize: { width: 1680, height: 1024 } },
  root: { type: "ia.container.flex", meta: { name: "root" }, position: {}, props: { direction: "column", style: { padding: "6px", gap: "8px", overflow: "hidden" } },
    children: [
      { type: "ia.container.flex", meta: { name: "topBar" }, position: { basis: "44px", shrink: 0 }, props: { direction: "row", alignItems: "center", style: { gap: "8px" } },
        children: [lbl("title", "MQTT", "cal1615/page-title", { basis: "160px", shrink: 0 }, undefined, { textAlign: "left" }), publishNow,
          { ...textLbl("status", `${tagVal("state")} + '   sent ' + toStr(${tagVal("count_out")}) + '   received ' + toStr(${tagVal("count_in")}) + '   refused ' + toStr(${tagVal("rejected")}) + '   ' + coalesce(${tagVal("msg")}, '')`, { fontSize: "14px", fontWeight: "bold" }), position: { grow: 1, basis: "0" } }] },
      { type: "ia.container.flex", meta: { name: "body" }, position: { grow: 1, basis: "0" }, props: { direction: "row", alignItems: "stretch", style: { gap: "8px" } },
        children: [
          card("messages", "Last messages (newest first)", [msgTable], { grow: 1, basis: "0" }),
          { type: "ia.container.flex", meta: { name: "side" }, position: { basis: "520px", shrink: 0 }, props: { direction: "column", style: { gap: "8px", overflowY: "auto" } },
            children: [
              card("settings", "Settings", [...SETTINGS.map(setRow), textLbl("msg", "coalesce({view.custom.msg}, '')", { color: "#B05000" })], { basis: "auto", shrink: 0 }),
              card("register", "Register this gateway with PulseMQ (own certificate)", [
                regField("customer", "Customer (the Sparkplug group)", "ia.input.text-field", "customer"),
                regField("machine", "Machine (the Sparkplug edge node)", "ia.input.text-field", "machine"),
                regField("serial", "Serial of this gateway (empty = made once and kept)", "ia.input.text-field", "serial"),
                regField("email", "PulseMQ email", "ia.input.text-field", "email"),
                regField("password", "PulseMQ password (used for this one request, not stored)", "ia.input.password-field", "password"),
                rotateBox, registerButton, textLbl("regmsg", "coalesce({view.custom.regmsg}, '')", { color: "#B05000" })], { basis: "auto", shrink: 0 }),
              card("how", "How it works", [textLbl("t", "'" + HOW.replace(/'/g, "''") + "'", { fontSize: "11px", color: "var(--neutral-70)" })], { basis: "auto", shrink: 0 }),
            ] },
        ] },
    ] },
};
writeView("MainViews/Feature Views/Maintenance/MQTT", view);

// navigation: page route, Maintenance menu entry after Rolls, header highlight
const pcf = `${P}/page-config/config.json`;
const pc = rd(pcf);
pc.pages["/mqtt"] = { ...pc.pages["/zone-setup"], viewPath: "MainViews/Feature Views/Maintenance/MQTT" };
wr(pcf, pc);
const navf = `${V}/MainViews/Nav/Maintenance/view.json`;
const nav = rd(navf);
const items = nav.root.children[0].props.items;
if (!items.some((i) => i.target === "/mqtt")) {
  const pt = items.find((i) => i.target === "/rolls") || items.find((i) => i.target === "/zone-setup");
  items.splice(items.indexOf(pt) + 1, 0, { ...JSON.parse(JSON.stringify(pt)), label: { ...pt.label, text: "MQTT" }, target: "/mqtt" });
  nav.props.defaultSize.height = Math.round(nav.props.defaultSize.height * items.length / (items.length - 1));
  wr(navf, nav);
}
const hf = `${V}/Framework/Header Main Nav/view.json`;
let hs = fs.readFileSync(hf, "utf8");
if (!hs.includes('\\"/mqtt\\"')) { hs = hs.split('{page.props.path} = \\"/rolls\\"').join('{page.props.path} = \\"/rolls\\" || {page.props.path} = \\"/mqtt\\"'); fs.writeFileSync(hf, hs); }
console.log("MQTT page, script cal1615.mqtt, route /mqtt, Maintenance menu entry done");
