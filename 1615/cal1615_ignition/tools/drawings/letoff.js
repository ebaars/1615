// Let-off and splice press, in the pixel space of the original line_letoff.png (910 x 405).
module.exports = function letoff(k) {
  const c = k.c;
  const W = 910, H = 405, FLOOR = 399;
  let s = "";
  s += k.floor(32, 880, FLOOR, 4);
  const sx = 590, ss = 1.2;
  const sp = (lx, ly) => [sx + lx * ss, FLOOR + ly * ss];     // a point in splice-press local coordinates
  const topL = sp(-48, -107), baseL = sp(-24, -14), baseR = sp(24, -14);
  // web: off the roll, down the splice press V, out to the accumulator
  s += k.web([[318, 262], topL, baseL, baseR, [720, FLOOR - 18], [850, FLOOR - 21]], { sw: 2 });
  s += k.g(215, FLOOR, k.letoff({ rollR: 33 }), 1.35);
  s += k.text(150, 295, "B", { size: 22, weight: 800, fill: c.red, anchor: "middle" });
  s += k.text(258, 295, "A", { size: 22, weight: 800, fill: c.red, anchor: "middle" });
  s += k.g(sx, FLOOR, k.splicePress({ h: 205 }), ss);
  s += k.g(655, FLOOR, k.bench({ w: 70, h: 26 }), 1.1);
  s += k.g(722, FLOOR, k.dancer({ h: 165 }), 1);
  for (const p of [topL, baseL, baseR]) s += k.idler(p[0], p[1], 6);
  s += k.arrow(740, FLOOR - 21, 864, { fill: c.text });
  s += k.text(790, 332, "Fiber to", { size: 15 }) + k.text(790, 352, "Accumulator", { size: 15 });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${k.defs()}${s}</svg>`;
};
module.exports.size = [910, 405];
