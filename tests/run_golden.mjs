// Checks src/engine.js against the Python reference on every golden chart.
// Run: npm test
import { readFileSync } from "node:fs";
import SwissEph from "swisseph-wasm";
import { computeChart } from "../src/engine.js";

const golden = JSON.parse(readFileSync(new URL("./golden_charts.json", import.meta.url)));
const degreeMap = JSON.parse(readFileSync(new URL("../data/sabian_degree_map.json", import.meta.url)));
const TOL = golden.tolerance_degrees;

const swe = new SwissEph();
await swe.initSwissEph();

let failed = 0;
for (const c of golden.cases) {
  const got = computeChart(swe, degreeMap, c.input);
  const exp = c.expected;
  const errs = [];
  const same = (label, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) errs.push(`${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

  same("universal_time", got.meta.universal_time, exp.universal_time);
  same("utc_offset", got.meta.utc_offset, exp.utc_offset);
  same("house_system", got.meta.house_system, exp.house_system);
  same("sect", got.meta.sect, exp.sect);
  same("warnings", got.meta.warnings, exp.warnings);
  same("point list", got.points.map(p => p.point), exp.points.map(p => p.point));
  same("house_cusps", got.house_cusps, exp.house_cusps);

  for (const e of exp.points) {
    const g = got.points.find(p => p.point === e.point);
    if (!g) continue;
    const diff = Math.abs(((g.longitude - e.longitude + 540) % 360) - 180);
    if (diff > TOL) errs.push(`${e.point} longitude off by ${(diff * 3600).toFixed(1)}"`);
    for (const k of ["tier", "position", "retrograde", "house", "sabian", "symbol", "article_url"]) {
      same(`${e.point}.${k}`, g[k], e[k]);
    }
  }

  if (errs.length) {
    failed++;
    console.log(`FAIL ${c.id} (${c.why})`);
    errs.slice(0, 8).forEach(x => console.log("   " + x));
  }
}
swe.close();
console.log(`\n${golden.cases.length - failed}/${golden.cases.length} charts match the Python reference.`);
process.exit(failed ? 1 : 0);
