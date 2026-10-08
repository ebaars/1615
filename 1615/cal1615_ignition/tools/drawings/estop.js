// The whole line, squat version for the Emergency Stops page, in the pixel space of the original line_estop.png (1490 x 295).
module.exports = function estop(k) {
  const c = k.c;
  const W = 1490, H = 295, FLOOR = 288;
  let s = "";
  s += k.floor(8, 1484, FLOOR, 3.5);
  s += k.web([[100, 232], [150, 226], [172, 280], [200, 280], [226, 226], [262, 282], [318, 282], [350, 282]], { sw: 1.5 });
  s += k.web([[350, 282], [352, 60], [362, 56], [374, 60], [376, 190], [402, 196], [415, 250], [418, 282], [520, 282], [545, 270], [560, 252]], { sw: 1.4, stroke: c.webSoft });
  s += k.web([[575, 205], [580, 203], [1035, 203], [1085, 200], [1130, 192], [1176, 200], [1215, 200], [1340, 232], [1362, 238]], { sw: 1.4 });
  s += k.g(66, FLOOR, k.letoff({ rollR: 30 }), 0.58);
  s += k.g(162, FLOOR, k.splicePress({ h: 205 }), 0.64);
  s += k.g(226, FLOOR, k.bench({ w: 70, h: 24 }), 0.62);
  s += k.g(262, FLOOR, k.dancer({ h: 112 }), 0.62);
  s += k.rect(300, FLOOR - 110, 16, 110, { fill: "url(#gBodyH)" }) + k.rect(286, FLOOR - 76, 14, 16, { fill: "url(#gBlue)", stroke: c.accent2, rx: 2 });
  s += k.g(362, FLOOR, k.accumulator({ w: 112, h: 436 }), 0.64);
  s += k.g(402, FLOOR - 62, k.rollerBox({ w: 24, h: 52 }), 1);
  s += k.g(436, FLOOR, k.dancer({ h: 72 }), 1);
  s += k.g(482, FLOOR, k.bench({ w: 70, h: 20 }), 0.9);
  s += k.g(541, FLOOR, k.impregnator({ w: 92, h: 150 }), 0.7);
  s += k.g(580, FLOOR, k.oven({ w: 455, h: 155, cols: 18, zones: 3 }), 1);
  s += k.g(1085, FLOOR, k.winder({ w: 206 }), 0.66);
  s += k.g(1366, FLOOR, k.letoff({ rollR: 30 }), 0.6, true);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${k.defs()}${s}</svg>`;
};
module.exports.size = [1490, 295];
