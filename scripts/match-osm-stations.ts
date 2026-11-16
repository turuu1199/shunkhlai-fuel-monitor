/**
 * Proposes station coordinates from OpenStreetMap — never invents them.
 *
 * 1. Downloads every amenity=fuel feature tagged Shunkhlai/Шунхлай inside Ulaanbaatar (Overpass).
 * 2. Geocodes the landmark mentioned in each station's address (Nominatim, 1 req/s).
 * 3. Pairs a station with the nearest OSM Shunkhlai station within MAX_M of its landmark (one-to-one).
 * 4. Writes matches to data/station-coordinates.json with verified=false (existing entries are kept).
 *
 * A human must confirm each pin (Google Maps / on site) and flip verified=true.
 * Usage: npm run coords:osm
 */
import fs from "node:fs";
import path from "node:path";

const UA = "shunkhlai-fuel-monitor-geocoder/1.0";
const MAX_M = 450;
const FILE = path.join(process.cwd(), "data/station-coordinates.json");

// externalId -> landmark from the station's own address text.
const LANDMARKS: Record<string, string> = {
  "1354": "Энх тайвны гүүр",
  "1355": "Нарантуул",
  "1357": "22-ын товчоо",
  "1360": "Эрэл сургууль",
  "1361": "Драгон",
  "1363": "Баянхошуу",
  "1365": "Мах комбинат",
  "1367": "Ботаникийн цэцэрлэг",
  "1368": "Яармаг",
  "1370": "Гурвалжингийн гүүр",
  "1371": "32-ын тойрог",
  "1372": "Цайз зах",
  "1373": "Дарь-Эх",
  "1374": "Офицеруудын ордон",
  "1376": "Дамбадаржаа",
  "1377": "ТЭЦ-4",
  "1379": "Нүхт",
  "1381": "Буман-Өлзий",
  "1382": "ТЭЦ-3",
  "1383": "Хүүшийн ам",
  "1385": "Тасганы овоо",
  "2634": "Шинэ авто зах",
  "2792": "Архивын ерөнхий газар",
};

type Pt = { lat: number; lng: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function meters(a: Pt, b: Pt) {
  const R = 6371000;
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function osmShunkhlai(): Promise<(Pt & { id: string })[]> {
  const q = `[out:json][timeout:60];area["name:en"="Ulaanbaatar"]["admin_level"="4"]->.a;nwr["amenity"="fuel"](area.a);out center tags;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: q }),
  });
  const json = (await res.json()) as { elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
  return json.elements
    .filter((e) => /шунхлай|shunkhlai/i.test(Object.values(e.tags ?? {}).join(" ")))
    .map((e) => ({ id: `${e.type}/${e.id}`, lat: e.center?.lat ?? e.lat!, lng: e.center?.lon ?? e.lon! }));
}

async function geocode(q: string): Promise<Pt | null> {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.search = new URLSearchParams({ q: `${q}, Улаанбаатар`, format: "jsonv2", limit: "1", countrycodes: "mn" }).toString();
  const res = await fetch(u, { headers: { "user-agent": UA } });
  const [r] = (await res.json()) as { lat: string; lon: string }[];
  return r ? { lat: Number(r.lat), lng: Number(r.lon) } : null;
}

async function main() {
  const osm = await osmShunkhlai();
  console.log(`OSM Shunkhlai stations in UB: ${osm.length}`);

  const candidates: { ext: string; landmark: string; node: (typeof osm)[number]; d: number }[] = [];
  for (const [ext, landmark] of Object.entries(LANDMARKS)) {
    const p = await geocode(landmark);
    await sleep(1100); // Nominatim usage policy
    if (!p) {
      console.log(`  ${ext}: landmark "${landmark}" not found`);
      continue;
    }
    for (const node of osm) {
      const d = meters(p, node);
      if (d <= MAX_M) candidates.push({ ext, landmark, node, d });
    }
  }

  // Greedy one-to-one assignment by distance.
  candidates.sort((a, b) => a.d - b.d);
  const usedExt = new Set<string>();
  const usedNode = new Set<string>();
  const file = JSON.parse(fs.readFileSync(FILE, "utf8"));
  let added = 0;
  for (const c of candidates) {
    if (usedExt.has(c.ext) || usedNode.has(c.node.id)) continue;
    usedExt.add(c.ext);
    usedNode.add(c.node.id);
    if (file.stations[c.ext]) continue; // never overwrite manual entries
    file.stations[c.ext] = {
      lat: Number(c.node.lat.toFixed(6)),
      lng: Number(c.node.lng.toFixed(6)),
      verified: false,
      source: `osm:${c.node.id} (${Math.round(c.d)} m from "${c.landmark}")`,
    };
    added++;
    console.log(`  ${c.ext}: ${c.node.id} ${Math.round(c.d)} m from "${c.landmark}"`);
  }
  fs.writeFileSync(FILE, JSON.stringify(file, null, 2) + "\n");
  console.log(`Added ${added} unverified coordinates. Review them, then set verified=true.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
