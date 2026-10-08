// Builds the line drawings as SVG into cal1615_std_images/cal1615/<name>.svg/ (Ignition Image Management folders), a light and a dark
// version of each (the pages pick one from the theme). Run:  node build.js [name ...]   (no names = all)
const fs = require("fs"), path = require("path");
const { Kit, LIGHT, DARK } = require("./lib");
const OUT = "E:/aaa_projects/ParkTemp/1615/cal1615_std_images/cal1615";
const DRAWINGS = { line_overview: "./overview", zone: "./zone", line_letoff: "./letoff", line_accum: "./accum", line_winder: "./winder", line_estop: "./estop" };
const want = process.argv.slice(2);
for (const [name, mod] of Object.entries(DRAWINGS)) {
  if (want.length && !want.includes(name)) continue;
  const draw = require(mod);
  for (const [suffix, pal] of [["", LIGHT], ["_dark", DARK]]) {
    const file = `${name}${suffix}.svg`;
    const dir = path.join(OUT, file);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), draw(new Kit(pal)));
    fs.writeFileSync(path.join(dir, "resource.json"), JSON.stringify({ scope: "A", version: 1, restricted: false, overridable: true, files: [file],
      attributes: { format: "SVG", lastModification: { actor: "claude", timestamp: new Date().toISOString().slice(0, 19) + "Z" } } }, null, 2));
    console.log("wrote " + file);
  }
}
