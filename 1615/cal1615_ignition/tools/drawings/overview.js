// The whole line, left (let-off) to right (winder / rewind), in the pixel space of the original line_overview.png (1510 x 452).
// Layer order: floor, fabric web (behind the machines), machines, idlers (in front).
const FLOOR = 447;
module.exports = function overview(k) {
  const c = k.c;
  const W = 1510, H = 452;
  let s = "";
  s += k.floor(26, 1500, FLOOR, 4);
  // ---- fabric web, behind the machines
  const web = [
    [[130, 350], [202, 340], [226, 432], [274, 432], [298, 340]],     // let-off roll -> splice press V
    [[298, 340], [334, 432], [398, 432], [456, 432]],                 // to the accumulator
    [[456, 432], [458, 70], [489, 66], [520, 70], [524, 305], [556, 311], [560, 436]],   // up the left, over the top, down the right
    [[560, 436], [636, 436], [676, 436], [690, 334], [712, 334]],     // to the impregnator
    [[728, 304], [775, 302], [1108, 302], [1160, 296], [1190, 286], [1245, 300], [1300, 300]],   // oven and exit idlers
    [[1300, 300], [1335, 304], [1380, 330], [1425, 342]],             // winder to rewind
  ];
  for (const w of web) s += k.web(w, { sw: 1.8 });
  // ---- machines
  s += k.g(78, FLOOR, k.letoff({ rollR: 34 }), 0.9);
  s += k.g(250, FLOOR, k.splicePress({ h: 205 }), 1);
  s += k.g(318, FLOOR, k.bench({ w: 72, h: 24 }), 1);
  s += k.g(346, FLOOR, k.dancer({ h: 112 }), 1);
  // feed station: motor on a column at the foot of the accumulator
  s += k.rect(402, FLOOR - 160, 26, 160, { fill: "url(#gBodyH)" }) + k.rect(384, FLOOR - 108, 24, 26, { fill: "url(#gBlue)", stroke: c.accent2, rx: 3 }) + k.rect(408, FLOOR - 140, 14, 26, { fill: "url(#gBody)" });
  s += k.g(489, FLOOR, k.accumulator({ w: 112, h: 436 }), 1);
  s += k.g(550, FLOOR - 76, k.rollerBox({ w: 36, h: 76 }), 1);
  s += k.g(590, FLOOR, k.dancer({ h: 112 }), 1);
  s += k.g(636, FLOOR, k.bench({ w: 84, h: 24 }), 1);
  s += k.g(710, FLOOR, k.impregnator({ w: 92, h: 150 }), 1);
  s += k.g(775, FLOOR, k.oven({ w: 333, h: 202, cols: 14, zones: 3 }), 1);
  s += k.g(1165, FLOOR, k.winder({ w: 206 }), 1);
  s += k.g(1458, FLOOR, k.letoff({ rollR: 30 }), 0.82, true);
  // ---- idlers on the path
  for (const [x, y, r] of [[202, 340, 5], [298, 340, 5], [226, 432, 5], [274, 432, 5], [334, 432, 4], [398, 432, 5], [456, 432, 4], [560, 436, 5], [676, 436, 4], [1160, 296, 5], [1190, 286, 5], [1245, 300, 5], [1425, 342, 5]]) s += k.idler(x, y, r);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${k.defs()}${s}</svg>`;
};
module.exports.size = [1510, 452];
