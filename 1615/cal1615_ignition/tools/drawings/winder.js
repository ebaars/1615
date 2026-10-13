// Cooling / winder / rewind, in the pixel space of the original line_winder.png (935 x 435).
module.exports = function winder(k) {
  const c = k.c;
  const W = 935, H = 435, FLOOR = 428;
  let s = "";
  s += k.floor(40, 890, FLOOR, 4);
  const wx = 290, ws = 1.25;
  const WAC = { cx: 640, w: 150, h: 395, deck: 150 };   // h = deck + tower                 // winder (exit) accumulator between the TS2 stand and the rewind winder
  const wacL = WAC.cx - WAC.w * 0.295, wacR = WAC.cx + WAC.w * 0.28, wacTop = FLOOR - WAC.h + 56, wacPeak = wacTop - 10;      // the top pulley sits 56 below the top of the tower: the web goes over it
  const wp = (lx, ly) => [wx + lx * ws, FLOOR + ly * ws];
  const idl = [wp(-6, -165), wp(42, -178), wp(70, -113), wp(110, -108)];
  s += k.web([[78, 235], [210, 232], [idl[0][0], idl[0][1]], [idl[1][0], idl[1][1]], [idl[2][0], idl[2][1]], [idl[3][0], idl[3][1]], wp(150, -108), wp(200, -118)], { sw: 2 });
  s += k.web([wp(200, -118), [wacL, wp(200, -118)[1]], [wacL, wacTop], [WAC.cx, wacPeak], [wacR, wacTop], [wacR, FLOOR - WAC.deck - 12], [724, 302], [770, 308]], { sw: 1.8 });
  s += k.g(wx, FLOOR, k.winder({ w: 206 }), ws);
  s += k.g(WAC.cx - WAC.w / 2 - 12, FLOOR, k.mezzanine({ w: WAC.w + 70, h: WAC.deck }), 1);          // the tower stands on a mezzanine
  s += k.g(WAC.cx, FLOOR - WAC.deck, k.accumulator({ w: WAC.w, h: WAC.h - WAC.deck }), 1);
  s += k.g(wacR + 20, FLOOR - WAC.deck - 70, k.rollerBox({ w: 56, h: 84 }), 1);
  s += k.g(838, FLOOR, k.letoff({ rollR: 30 }), 1.1, true);
  for (const p of idl) s += k.idler(p[0], p[1], 7);
  s += k.idler(210, 232, 7);
  s += k.arrow(30, 235, 80, { fill: c.text });
  s += k.text(14, 196, "Fiber from", { size: 15 }) + k.text(14, 216, "Oven", { size: 15 });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${k.defs()}${s}</svg>`;
};
module.exports.size = [935, 435];
