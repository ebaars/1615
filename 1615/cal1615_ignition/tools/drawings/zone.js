// One oven zone (cross-section), in the pixel space of the original zone.png (902 x 470): the oven box with the nozzle rows and the web,
// the exhaust fan and its duct, the recirculation fan, the combustion blower and the gas train. The live lamps and fan status boxes are
// overlays on the page; the red status circles of the old picture are static art and are not redrawn.
module.exports = function zone(k) {
  const c = k.c;
  const W = 902, H = 470, FLOOR = 463;
  let s = "";
  s += k.floor(8, 898, FLOOR, 4);
  // ---- oven box
  s += k.rect(68, 140, 794, FLOOR - 140, { fill: "url(#gOven)", stroke: c.ovenLine, rx: 3, sw: 1.6 });
  s += k.rect(78, 150, 774, FLOOR - 160, { fill: "none", stroke: c.ovenLine, rx: 2, dash: "2 6" });
  // ---- web through the zone
  s += k.line(30, 236, 880, 236, { stroke: c.web, sw: 2 });
  s += k.line(30, 236, 68, 236, { stroke: c.web, sw: 2 });
  // ---- nozzle boxes: two staggered rows above and below the web
  for (let i = 0; i < 12; i++) {
    const x = 142 + i * 62;
    s += k.rect(x, 211, 26, 23, { fill: "url(#gBody)", stroke: c.bodyLine, rx: 2 });
    s += k.rect(x - 30, 238, 26, 23, { fill: "url(#gBody)", stroke: c.bodyLine, rx: 2 });
  }
  // ---- exhaust fan on the roof, duct down into the box
  s += k.pipe([[247, 6], [247, 40]], 16);
  s += k.pipe([[285, 72], [380, 72], [400, 90], [400, 140]], 18);
  s += k.flange(400, 98, 26, 8);
  s += k.fan(247, 72, 36);
  s += k.text(340, 26, "Exhaust Fan", { size: 15, anchor: "middle" });
  // ---- recirculation fan inside the box, outlet to the right
  s += k.pipe([[440, 330], [472, 330]], 14);
  s += k.flange(474, 330, 8, 22);
  s += k.fan(405, 330, 36);
  s += k.text(415, 384, "Recirculation Fan", { size: 15, anchor: "middle" });
  // ---- combustion blower and the damper symbols
  s += k.fan(203, 297, 22);
  s += k.pipe([[203, 320], [203, 352]], 10);
  s += k.damper(66, 177, 26);
  s += k.damper(468, 282, 28);
  // ---- gas train: pipe in from the left with the S / L / H taps (the lamps are overlays on the page), valves, elbow up to the burner
  s += k.pipe([[8, 398], [100, 398]], 14);
  s += k.pipe([[165, 398], [190, 398], [200, 388], [200, 372]], 14);
  s += k.pipe([[47, 398], [47, 340]], 8) + k.pipe([[90, 398], [90, 372]], 8);
  s += k.gateValve(118, 398);
  s += k.pipe([[130, 398], [150, 398]], 14);
  s += k.controlValve(158, 398);
  s += k.rect(178, 322, 44, 52, { fill: "url(#gSteel)", rx: 8 });   // burner housing
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${k.defs()}${s}</svg>`;
};
module.exports.size = [902, 470];
