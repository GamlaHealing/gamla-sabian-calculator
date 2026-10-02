// Export every place in the `all-the-cities` package (GeoNames, roughly population >= 1,000
// plus administrative seats) to build/cities_raw.json for reference/build_cities.py.
// Row: [name, country, region, lat, lon, population]
// region = US state code for the United States, otherwise the GeoNames first-level
// region name (from the `cities.json` package's admin1.json), or "" when unknown.
// Run from build/:  npm install all-the-cities cities.json && node ../reference/export_cities.cjs
const fs = require("fs"), path = require("path");
const req = require("module").createRequire(path.join(process.cwd(), "x.js"));
const cities = req("all-the-cities"), admin1 = req("cities.json/admin1.json");
const names = new Map(admin1.map(a => [a.code, a.name]));
const r4 = n => Math.round(n * 1e4) / 1e4;
const rows = cities.map(c => {
  const [lon, lat] = c.loc.coordinates;
  const region = c.country === "US" ? (c.adminCode || "") : (names.get(`${c.country}.${c.adminCode}`) || "");
  return [c.name, c.country, region === c.name ? "" : region, r4(lat), r4(lon), c.population];
});
fs.writeFileSync(path.join(process.cwd(), "cities_raw.json"), JSON.stringify(rows));
console.log(rows.length, "places");
