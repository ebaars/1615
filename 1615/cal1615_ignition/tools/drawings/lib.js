// Vector drawing kit for the cal1615 HMI: machine components drawn in a flat, slightly shaded style, used by build.js to make the
// line drawings as SVG (sharp at any size, a light and a dark version). Everything is positioned in the pixel space of the
// original PNGs, so the overlay cards on the pages stay where they are.
// Local coordinates of a component: x = 0 at its centre line, y = 0 on the floor, negative y is up.
const LIGHT = {
  ground: "#3c4754", groundSoft: "#aab4c0",
  body1: "#f4f7fa", body2: "#cdd7e2", bodyLine: "#7d8b9b", dark1: "#4b5866", dark2: "#27303a",
  steel1: "#dfe5ec", steel2: "#9aa6b4", rod: "#2b343e", ram1: "#c5ced8", ram2: "#8896a6",
  fab1: "#ffb36b", fab2: "#ec7a1e", fabLine: "#b85a0c", web: "#f08a3c", webSoft: "#f7b680",
  accent: "#2f7fc1", accent2: "#1d5f98", yellow1: "#ffe27a", yellow2: "#e6b422", green1: "#6fcf97", green2: "#2f9e5f", red: "#d64545",
  oven1: "#fbf6e2", oven2: "#efe5bd", ovenLine: "#a39a76", glass: "#b9d4ea", text: "#26313c",
};
const DARK = {
  ground: "#d3dbe5", groundSoft: "#556272",
  body1: "#566474", body2: "#3a4654", bodyLine: "#9fb1c6", dark1: "#2a333e", dark2: "#12171d",
  steel1: "#6c7b8d", steel2: "#3b4756", rod: "#3d4a5a", ram1: "#7d8c9f", ram2: "#4d5b6c",
  fab1: "#ffb36b", fab2: "#e8741c", fabLine: "#ffcf9e", web: "#ff9a4d", webSoft: "#b7743c",
  accent: "#4aa3e8", accent2: "#2f7fc1", yellow1: "#ffe27a", yellow2: "#d9a81c", green1: "#6fcf97", green2: "#2f9e5f", red: "#ff6b6b",
  oven1: "#5a5744", oven2: "#47452f", ovenLine: "#b5ac86", glass: "#46647d", text: "#e6edf5",
};

class Kit {
  constructor(c) { this.c = c; this.uid = 0; }
  id(p) { return `${p}${++this.uid}`; }
  defs() {
    const c = this.c;
    return `<defs>
<linearGradient id="gBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.body1}"/><stop offset="1" stop-color="${c.body2}"/></linearGradient>
<linearGradient id="gBodyH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.body2}"/><stop offset="0.35" stop-color="${c.body1}"/><stop offset="1" stop-color="${c.body2}"/></linearGradient>
<linearGradient id="gSteel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.steel2}"/><stop offset="0.4" stop-color="${c.steel1}"/><stop offset="1" stop-color="${c.steel2}"/></linearGradient>
<linearGradient id="gRam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.ram2}"/><stop offset="0.45" stop-color="${c.ram1}"/><stop offset="1" stop-color="${c.ram2}"/></linearGradient>
<linearGradient id="gDark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.dark2}"/><stop offset="0.5" stop-color="${c.dark1}"/><stop offset="1" stop-color="${c.dark2}"/></linearGradient>
<linearGradient id="gOven" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.oven1}"/><stop offset="1" stop-color="${c.oven2}"/></linearGradient>
<linearGradient id="gYellow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.yellow2}"/><stop offset="0.45" stop-color="${c.yellow1}"/><stop offset="1" stop-color="${c.yellow2}"/></linearGradient>
<linearGradient id="gGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.green1}"/><stop offset="1" stop-color="${c.green2}"/></linearGradient>
<linearGradient id="gBlue" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.accent2}"/><stop offset="0.45" stop-color="${c.accent}"/><stop offset="1" stop-color="${c.accent2}"/></linearGradient>
<radialGradient id="gFab" cx="0.38" cy="0.35" r="0.8"><stop offset="0" stop-color="${c.fab1}"/><stop offset="1" stop-color="${c.fab2}"/></radialGradient>
</defs>`;
  }
  // ---------------------------------------------------------------- primitives
  rect(x, y, w, h, o = {}) {
    const c = this.c;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 1.5}" fill="${o.fill || "url(#gBody)"}" stroke="${o.stroke || c.bodyLine}" stroke-width="${o.sw ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;
  }
  poly(pts, o = {}) {
    const c = this.c;
    return `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${o.fill || "url(#gBody)"}" stroke="${o.stroke || c.bodyLine}" stroke-width="${o.sw ?? 1}" stroke-linejoin="round"/>`;
  }
  circle(cx, cy, r, o = {}) {
    const c = this.c;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.fill || "url(#gSteel)"}" stroke="${o.stroke || c.bodyLine}" stroke-width="${o.sw ?? 1}"/>`;
  }
  line(x1, y1, x2, y2, o = {}) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke || this.c.bodyLine}" stroke-width="${o.sw ?? 1}" stroke-linecap="${o.cap || "round"}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;
  }
  g(x, y, inner, s = 1, flipX = false) {
    return `<g transform="translate(${x} ${y}) scale(${flipX ? -s : s} ${s})">${inner}</g>`;
  }
  text(x, y, str, o = {}) {
    return `<text x="${x}" y="${y}" font-family="Segoe UI, Noto Sans, Arial, sans-serif" font-size="${o.size || 14}" font-weight="${o.weight || 600}" fill="${o.fill || this.c.text}" text-anchor="${o.anchor || "start"}">${str}</text>`;
  }
  // a fabric roll (orange disc with a core)
  roll(cx, cy, r, o = {}) {
    const c = this.c;
    const core = Math.max(3, r * 0.3);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gFab)" stroke="${c.fabLine}" stroke-width="1"/>` +
      (r > 12 ? `<circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="none" stroke="${c.fabLine}" stroke-opacity="0.35" stroke-width="1"/>` : "") +
      `<circle cx="${cx}" cy="${cy}" r="${core}" fill="url(#gSteel)" stroke="${c.bodyLine}" stroke-width="1"/>` +
      (o.arrow ? `<path d="M ${cx - r * 0.55} ${cy - r * 0.15} A ${r * 0.56} ${r * 0.56} 0 0 1 ${cx + r * 0.2} ${cy - r * 0.52}" fill="none" stroke="${c.fabLine}" stroke-width="1.4" marker-end="url(#none)"/>` : "");
  }
  // a web roller / idler the fabric wraps around
  idler(cx, cy, r = 5) {
    const c = this.c;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gFab)" stroke="${c.fabLine}" stroke-width="0.9"/><circle cx="${cx}" cy="${cy}" r="${Math.max(1.2, r * 0.28)}" fill="${c.dark1}"/>`;
  }
  web(pts, o = {}) {
    return `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${o.stroke || this.c.web}" stroke-width="${o.sw ?? 2}" stroke-linejoin="round" stroke-linecap="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;
  }
  arrow(x1, y, x2, o = {}) {
    const c = this.c, col = o.fill || c.text, d = x2 > x1 ? 1 : -1;
    return this.line(x1, y, x2 - d * 9, y, { stroke: col, sw: o.sw ?? 2.5 }) + `<polygon points="${x2},${y} ${x2 - d * 13},${y - 5.5} ${x2 - d * 13},${y + 5.5}" fill="${col}"/>`;
  }
  floor(x1, x2, y = 0, sw = 4) {
    return this.line(x1, y, x2, y, { stroke: this.c.ground, sw, cap: "butt" });
  }
  // ---------------------------------------------------------------- machines
  // letoff stand: column, control head with a screen, double-ended turret arm, a roll on the A side. s = scale; rollR = roll radius
  letoff({ rollR = 34, screen = true } = {}) {
    const c = this.c;
    let s = "";
    s += this.poly([[-46, 0], [-34, -14], [34, -14], [46, 0]], { fill: "url(#gDark)", stroke: c.dark2 });
    s += this.rect(-13, -170, 26, 158, { fill: "url(#gBodyH)" });
    s += this.rect(-24, -178, 48, 56, { fill: "url(#gBody)" });
    if (screen) s += this.rect(-52, -176, 34, 48, { fill: "url(#gBody)" }) + this.rect(-47, -171, 24, 28, { fill: this.c.glass, stroke: c.bodyLine, rx: 1 }) + this.circle(-35, -134, 3, { fill: c.accent });
    // turret arm (horizontal drum) with end caps B (left) and A (right)
    s += this.rect(-46, -100, 92, 30, { fill: "url(#gBodyH)", rx: 6 });
    s += this.rect(-58, -97, 14, 24, { fill: "url(#gSteel)", rx: 7 }) + this.rect(44, -97, 14, 24, { fill: "url(#gSteel)", rx: 7 });
    // the roll on A
    s += this.roll(50 + rollR * 0.35, -85, rollR, { arrow: true });
    return s;
  }
  // splice press: mast with platen head, cylinder on top, web guide roll pair at the base
  splicePress({ h = 205 } = {}) {
    const c = this.c;
    let s = "";
    s += this.poly([[-42, 0], [-32, -12], [32, -12], [42, 0]], { fill: "url(#gDark)", stroke: c.dark2 });
    s += this.rect(-9, -h + 18, 18, h - 28, { fill: "url(#gBodyH)" });
    s += this.rect(-16, -h, 32, 34, { fill: "url(#gBody)" });                      // press head
    s += this.rect(-5, -h - 26, 10, 28, { fill: "url(#gRam)" });                   // cylinder
    s += this.rect(-34, -h + 88, 68, 14, { fill: "url(#gBody)" });                 // platen
    s += this.rect(-46, -h + 100, 92, 10, { fill: "url(#gSteel)", rx: 2 });        // cutter bar
    s += this.circle(11, -h + 8, 2.5, { fill: c.red, stroke: c.red });
    // side guides
    s += this.rect(-50, -h + 84, 5, 40, { fill: "url(#gSteel)" }) + this.rect(45, -h + 84, 5, 40, { fill: "url(#gSteel)" });
    // base idlers + web
    s += this.web([[-48, -h + 98], [-24, -14], [-5, -14]]) + this.web([[5, -14], [24, -14], [48, -h + 98]]);
    s += this.idler(-48, -h + 98, 5) + this.idler(48, -h + 98, 5) + this.idler(-24, -14, 5.5) + this.idler(24, -14, 5.5);
    return s;
  }
  // dancer / compensator post: a slim yellow arm on a small base
  dancer({ h = 110 } = {}) {
    const c = this.c;
    let s = "";
    s += this.rect(-10, -8, 20, 8, { fill: "url(#gDark)", stroke: c.dark2 });
    s += this.rect(-2.5, -h, 5, h - 6, { fill: "url(#gYellow)", stroke: c.yellow2, rx: 2 });
    s += this.circle(0, -h, 4, { fill: c.yellow1, stroke: c.yellow2 });
    return s;
  }
  // bench / table the web runs over
  bench({ w = 70, h = 22 } = {}) {
    const c = this.c;
    let s = "";
    s += this.rect(-w / 2, -h, w, 7, { fill: "url(#gBody)" });
    for (const x of [-w / 2 + 8, w / 2 - 12]) s += this.rect(x, -h + 7, 4, h - 7, { fill: "url(#gSteel)" });
    s += this.rect(-w / 2 + 4, -h - 9, 22, 9, { fill: "url(#gBody)" });
    return s;
  }
  // accumulator tower: two posts, top beam, cross brace, rods, ram, bottom carriage with rollers
  accumulator({ w = 112, h = 436 } = {}) {
    const c = this.c;
    let s = "";
    const L = -w / 2, R = w / 2;
    s += this.rect(L, -h, 15, h, { fill: "url(#gBodyH)", rx: 1 }) + this.rect(R - 15, -h, 15, h, { fill: "url(#gBodyH)", rx: 1 });
    s += this.rect(L, -h, w, 16, { fill: "url(#gBody)" });
    s += this.rect(L + 15, -h * 0.52, w - 30, 14, { fill: "url(#gBody)" });
    s += this.poly([[L + 15, -h * 0.52], [L + 15, -h * 0.52 - 20], [L + 38, -h * 0.52]], { fill: "url(#gBody)" }) + this.poly([[R - 15, -h * 0.52], [R - 15, -h * 0.52 - 20], [R - 38, -h * 0.52]], { fill: "url(#gBody)" });
    // guide rods and the ram
    s += this.rect(L + 33, -h + 16, 7, h - 30, { fill: "url(#gDark)", stroke: c.dark2, rx: 1 }) + this.rect(R - 40, -h + 16, 7, h - 30, { fill: "url(#gDark)", stroke: c.dark2, rx: 1 });
    s += this.rect(-5, -h + 10, 10, 66, { fill: "url(#gRam)", stroke: c.bodyLine, rx: 2 });
    s += this.rect(-4, -h * 0.5, 8, h * 0.5 - 24, { fill: "url(#gRam)", stroke: c.ram2, rx: 1 });
    // top pulley block
    s += this.circle(0, -h + 56, 8, { fill: "url(#gFab)", stroke: c.fabLine });
    // bottom carriage
    s += this.rect(L + 15, -30, w - 30, 14, { fill: "url(#gYellow)", stroke: c.yellow2 });
    for (const x of [-34, -17, 0, 17, 34]) s += this.idler(x, -14 + (Math.abs(x) % 2 ? 4 : 0), 6);
    s += this.rect(L - 2, -12, 22, 12, { fill: "url(#gDark)", stroke: c.dark2 }) + this.rect(R - 20, -12, 22, 12, { fill: "url(#gDark)", stroke: c.dark2 });
    return s;
  }
  // roller box next to the tower (web turn rolls)
  rollerBox({ w = 38, h = 78 } = {}) {
    const c = this.c;
    return this.rect(0, -h, w, h, { fill: "none", stroke: c.bodyLine, dash: "3 2", rx: 2 }) + this.idler(11, -h + 16, 7) + this.idler(26, -h + 30, 7) + this.idler(14, -h + 48, 7) + this.idler(28, -h + 64, 5);
  }
  // impregnation head: frame, nip pair, squeeze rolls, small cylinders, green tank at the base
  impregnator({ w = 92, h = 150 } = {}) {
    const c = this.c;
    let s = "";
    s += this.rect(-w / 2, -h, w, h - 22, { fill: "url(#gBody)", rx: 3 });
    s += this.rect(-w / 2 + 6, -h + 8, 16, 60, { fill: "url(#gSteel)" }) + this.rect(w / 2 - 22, -h + 8, 16, 60, { fill: "url(#gSteel)" });
    s += this.rect(-w / 2 + 6, -h + 74, 14, 22, { fill: "url(#gRam)" }) + this.rect(w / 2 - 20, -h + 74, 14, 22, { fill: "url(#gRam)" });
    s += this.roll(-4, -h + 24, 15) + this.roll(23, -h + 24, 14) + this.roll(-4, -h + 52, 14);
    s += this.rect(-w / 2 + 4, -h + 100, w - 8, 12, { fill: "url(#gSteel)" });
    s += this.idler(-w / 2 + 14, -h + 118, 5) + this.idler(-w / 2 + 28, -h + 124, 5) + this.idler(-w / 2 + 38, -h + 112, 5);
    // tank
    s += this.rect(-w / 2 + 8, -22, w - 16, 16, { fill: "url(#gGreen)", stroke: c.green2, rx: 3 });
    s += this.rect(-w / 2 + 14, -8, 14, 8, { fill: "url(#gDark)", stroke: c.dark2 }) + this.rect(w / 2 - 28, -8, 14, 8, { fill: "url(#gDark)", stroke: c.dark2 });
    return s;
  }
  // oven: an insulated box with panel seams and a row of nozzle boxes
  oven({ w = 333, h = 202, cols = 12, zones = 3 } = {}) {
    const c = this.c;
    let s = "";
    s += this.rect(0, -h, w, h, { fill: "url(#gOven)", stroke: c.ovenLine, rx: 3, sw: 1.4 });
    // zone seams
    for (let z = 1; z < zones; z++) s += this.line(w * z / zones, -h, w * z / zones, 0, { stroke: c.ovenLine, sw: 1.3 });
    // top plenum band + nozzle boxes
    s += this.line(0, -h + 26, w, -h + 26, { stroke: c.ovenLine, dash: "9 5" });
    const step = (w - 20) / cols;
    for (let i = 0; i < cols; i++) {
      s += this.rect(14 + i * step, -h + 44, step - 8, 10, { fill: "url(#gBody)", stroke: c.ovenLine, rx: 1 });
      s += this.rect(14 + i * step + 5, -h + 64, step - 8, 10, { fill: "url(#gBody)", stroke: c.ovenLine, rx: 1 });
    }
    s += this.line(0, -h + 86, w, -h + 86, { stroke: c.ovenLine, dash: "9 5" });
    // web path through the oven
    s += this.line(0, -h + 84, w, -h + 84, { stroke: c.web, sw: 2 });
    s += this.line(0, -26, w, -26, { stroke: c.ovenLine, dash: "9 5" });
    // legs
    s += this.rect(8, -8, 30, 8, { fill: "url(#gDark)", stroke: c.dark2 }) + this.rect(w - 38, -8, 30, 8, { fill: "url(#gDark)", stroke: c.dark2 });
    return s;
  }
  // winder block: frame, deck, two winding positions with big rolls on carts, idlers
  winder({ w = 206 } = {}) {
    const c = this.c;
    let s = "";
    s += this.rect(0, -190, 16, 190, { fill: "url(#gBodyH)" });                                // entry post
    s += this.rect(-4, -194, 24, 8, { fill: "url(#gBody)" });
    s += this.rect(16, -100, 160, 14, { fill: "url(#gBody)" });                                // deck
    s += this.rect(168, -100, 16, 100, { fill: "url(#gBodyH)" });                              // exit post
    s += this.rect(112, -176, 8, 74, { fill: "url(#gSteel)" }) + this.rect(166, -176, 8, 74, { fill: "url(#gSteel)" });
    s += this.roll(116, -150, 24) + this.roll(170, -152, 24);                                  // upper winding rolls
    s += this.roll(70, -54, 22) + this.roll(121, -50, 26) + this.roll(174, -50, 26);           // lower rolls
    for (const x of [108, 160]) s += this.rect(x, -14, 28, 9, { fill: "url(#gDark)", stroke: c.dark2, rx: 2 }) + this.circle(x + 5, -4, 4, { fill: c.dark1, stroke: c.dark2 }) + this.circle(x + 23, -4, 4, { fill: c.dark1, stroke: c.dark2 });
    s += this.rect(22, -150, 32, 46, { fill: "url(#gBody)" }) + this.rect(30, -142, 16, 28, { fill: c.glass, stroke: c.bodyLine, rx: 2 }); // drive
    s += this.rect(30, -82, 26, 30, { fill: "url(#gBody)" });
    return s;
  }
  // ---------------------------------------------------------------- oven zone parts
  // centrifugal fan: round housing with a four-blade wheel
  fan(cx, cy, r) {
    const c = this.c;
    let s = this.circle(cx, cy, r, { fill: "url(#gSteel)", sw: 1.4 });
    s += this.circle(cx, cy, r * 0.8, { fill: c.body1, stroke: c.bodyLine });
    for (let a = 0; a < 4; a++) {
      s += `<g transform="translate(${cx} ${cy}) rotate(${a * 90 + 20})"><path d="M 0 0 C ${r * 0.1} ${-r * 0.2} ${r * 0.28} ${-r * 0.62} ${r * 0.08} ${-r * 0.7} C ${-r * 0.1} ${-r * 0.5} ${-r * 0.1} ${-r * 0.2} 0 0 Z" fill="${c.dark1}" stroke="${c.dark2}" stroke-width="0.8"/></g>`;
    }
    return s + this.circle(cx, cy, r * 0.14, { fill: c.steel1, stroke: c.dark2 });
  }
  // a pipe (round duct) following a path of points; w = outside diameter
  pipe(pts, w = 14, o = {}) {
    const c = this.c;
    const d = "M " + pts.map((p) => p.join(" ")).join(" L ");
    return `<path d="${d}" fill="none" stroke="${c.bodyLine}" stroke-width="${w + 2}" stroke-linejoin="round" stroke-linecap="${o.cap || "butt"}"/>` +
      `<path d="${d}" fill="none" stroke="url(#gSteel)" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="${o.cap || "butt"}"/>` +
      `<path d="${d}" fill="none" stroke="${c.body1}" stroke-opacity="0.65" stroke-width="${w * 0.28}" stroke-linejoin="round" stroke-linecap="${o.cap || "butt"}" transform="translate(${-w * 0.14} ${-w * 0.14})"/>`;
  }
  flange(x, y, w, h) {
    return this.rect(x - w / 2, y - h / 2, w, h, { fill: "url(#gBlue)", stroke: this.c.accent2, rx: 1.5 });
  }
  // control valve: globe body on the pipe line (cy = pipe centre), stem and a blue pneumatic actuator above
  controlValve(cx, cy) {
    const c = this.c;
    let s = this.rect(cx - 3, cy - 40, 6, 32, { fill: "url(#gSteel)" });
    s += this.rect(cx - 14, cy - 62, 28, 24, { fill: "url(#gBlue)", stroke: c.accent2, rx: 8 });
    s += this.rect(cx - 8, cy - 72, 16, 12, { fill: "url(#gBlue)", stroke: c.accent2, rx: 3 });
    s += this.rect(cx - 8, cy - 12, 16, 6, { fill: "url(#gDark)", stroke: c.dark2, rx: 2 });
    s += this.rect(cx - 17, cy - 8, 34, 22, { fill: "url(#gSteel)", rx: 8 });
    s += this.rect(cx - 22, cy - 9, 6, 24, { fill: "url(#gBlue)", stroke: c.accent2, rx: 1 }) + this.rect(cx + 16, cy - 9, 6, 24, { fill: "url(#gBlue)", stroke: c.accent2, rx: 1 });
    return s;
  }
  // gate / ball valve in a pipe: body with a handwheel
  gateValve(cx, cy) {
    const c = this.c;
    return this.rect(cx - 10, cy - 12, 20, 24, { fill: "url(#gSteel)", rx: 4 }) + this.rect(cx - 2, cy - 24, 4, 14, { fill: "url(#gSteel)" }) + this.rect(cx - 9, cy - 28, 18, 5, { fill: c.dark1, stroke: c.dark2, rx: 2 });
  }
  // a damper symbol: square with crossed vanes
  damper(x, y, w = 26) {
    const c = this.c;
    return this.rect(x, y, w, w, { fill: "none", stroke: c.bodyLine, rx: 1.5 }) + this.line(x + 3, y + 5, x + w - 3, y + w / 2, { sw: 1.2 }) + this.line(x + 3, y + w - 5, x + w - 3, y + w / 2, { sw: 1.2 });
  }
}
module.exports = { Kit, LIGHT, DARK };
