// Accumulator and impregnation head, in the pixel space of the original line_accum.png (930 x 605).
module.exports = function accum(k) {
  const c = k.c;
  const W = 930, H = 605, FLOOR = 598;
  let s = "";
  s += k.floor(45, 905, FLOOR, 4);
  // web, behind the machines
  s += k.web([[78, FLOOR - 20], [240, FLOOR - 20], [296, FLOOR - 18]], { sw: 2 });
  s += k.web([[296, FLOOR - 18], [298, 70], [371, 64], [444, 70], [446, 430], [486, 440], [520, 450], [522, FLOOR - 20], [700, FLOOR - 20], [735, FLOOR - 16]], { sw: 1.8, stroke: c.webSoft });
  s += k.web([[740, FLOOR - 30], [745, 470], [800, 470], [848, 424], [868, 405]], { sw: 2 });
  // machines
  s += k.rect(243, FLOOR - 224, 20, 224, { fill: "url(#gBodyH)" });                       // feed station column
  s += k.rect(176, FLOOR - 140, 52, 24, { fill: "url(#gBlue)", stroke: c.accent2, rx: 4 }) + k.rect(224, FLOOR - 150, 22, 40, { fill: "url(#gGreen)", stroke: c.green2, rx: 3 });
  s += k.g(371, FLOOR, k.accumulator({ w: 167, h: 588 }), 1);
  s += k.g(456, FLOOR - 126, k.rollerBox({ w: 60, h: 90 }), 1);
  s += k.g(612, FLOOR, k.dancer({ h: 160 }), 1);
  s += k.g(668, FLOOR, k.bench({ w: 100, h: 28 }), 1);
  s += k.g(795, FLOOR, k.impregnator({ w: 125, h: 200 }), 1);
  for (const [x, y, r] of [[240, FLOOR - 20, 6], [296, FLOOR - 18, 6], [520, 450, 6], [522, FLOOR - 20, 6], [700, FLOOR - 20, 5]]) s += k.idler(x, y, r);
  // labels
  s += k.arrow(30, FLOOR - 20, 80, { fill: c.text });
  s += k.text(8, 526, "Fiber from", { size: 15 }) + k.text(8, 546, "Splice Press", { size: 15 });
  s += k.arrow(838, 405, 876, { fill: c.text });
  s += k.text(866, 372, "Fiber to", { size: 15 }) + k.text(866, 392, "Oven", { size: 15 });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${k.defs()}${s}</svg>`;
};
module.exports.size = [930, 605];
