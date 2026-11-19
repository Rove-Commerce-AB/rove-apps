/**
 * Regenerates src/lib/radar/bulk/data/postnrToCounty.json from an open CSV
 * (no API signup). Default source:
 * https://raw.githubusercontent.com/Axelsson2000/data/master/Pnr-Ort-Kommun-KnKod-LnNamn-Lat-Long-GM_202409.csv
 *
 * Usage:
 *   node scripts/generate-postnr-to-county.mjs [path-or-url]
 */
import fs from "fs";
import path from "path";

const DEFAULT_URL =
  "https://raw.githubusercontent.com/Axelsson2000/data/master/Pnr-Ort-Kommun-KnKod-LnNamn-Lat-Long-GM_202409.csv";

const LAN_TO_COUNTY = {
  "Stockholms län": "Stockholm",
  "Uppsala län": "Uppsala",
  "Södermanlands län": "Södermanland",
  "Östergötlands län": "Östergötland",
  "Jönköpings län": "Jönköping",
  "Kronobergs län": "Kronoberg",
  "Kalmar län": "Kalmar",
  "Gotlands län": "Gotland",
  "Blekinge län": "Blekinge",
  "Skåne län": "Skåne",
  "Hallands län": "Halland",
  "Västra Götalands län": "Västra Götaland",
  "Värmlands län": "Värmland",
  "Örebro län": "Örebro",
  "Västmanlands län": "Västmanland",
  "Dalarnas län": "Dalarna",
  "Gävleborgs län": "Gävleborg",
  "Västernorrlands län": "Västernorrland",
  "Jämtlands län": "Jämtland",
  "Västerbottens län": "Västerbotten",
  "Norrbottens län": "Norrbotten",
};

const source = process.argv[2] || DEFAULT_URL;
let csvText;
if (/^https?:\/\//i.test(source)) {
  const res = await fetch(source);
  if (!res.ok) throw new Error(`Failed to download ${source}: ${res.status}`);
  csvText = await res.text();
} else {
  csvText = fs.readFileSync(source, "utf8");
}

const lines = csvText.split(/\r?\n/).filter(Boolean);
const header = lines[0].split(",").map((h) => h.trim());
const pnrI = header.indexOf("Postnummer");
const lanI = header.indexOf("LnNamn");
if (pnrI < 0 || lanI < 0) {
  throw new Error("CSV missing Postnummer or LnNamn columns");
}

const map = {};
const unknown = new Set();
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(",");
  const pnr = (parts[pnrI] || "").replace(/\D/g, "");
  const lanRaw = (parts[lanI] || "").trim();
  if (pnr.length !== 5) continue;
  const county = LAN_TO_COUNTY[lanRaw];
  if (!county) {
    unknown.add(lanRaw);
    continue;
  }
  map[pnr] = county;
}

if (unknown.size > 0) {
  console.warn("Unknown LnNamn values:", [...unknown]);
}

const outPath = path.join(
  "src",
  "lib",
  "radar",
  "bulk",
  "data",
  "postnrToCounty.json"
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(map));
console.log(`Wrote ${Object.keys(map).length} postnummer → ${outPath}`);
