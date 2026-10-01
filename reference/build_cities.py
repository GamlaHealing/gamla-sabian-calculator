#!/usr/bin/env python3
"""Build data/cities.json for the browser: GeoNames cities (population >= 5,000)
with an IANA timezone assigned from coordinates by timezonefinder.

Input:  build/cities_raw.json  [[name, country, us_state, lat, lon, population], ...]
        (exported from the `all-the-cities` npm package, GeoNames data, CC BY 4.0)
Output: data/cities.json  {"tz": [zone names], "c": [[name, cc, state, lat, lon, tz_index], ...]}
        sorted by population so the most likely match comes first.
"""
import json
from pathlib import Path
from timezonefinder import TimezoneFinder

ROOT = Path(__file__).resolve().parent.parent
rows = json.loads((ROOT / "build" / "cities_raw.json").read_text())
rows.sort(key=lambda r: -r[5])
tf = TimezoneFinder()
zones, index, out, missing = [], {}, [], 0
for name, cc, state, lat, lon, _pop in rows:
    tz = tf.timezone_at(lat=lat, lng=lon) or tf.closest_timezone_at(lat=lat, lng=lon)
    if not tz:
        missing += 1
        continue
    if tz not in index:
        index[tz] = len(zones)
        zones.append(tz)
    out.append([name, cc, state, lat, lon, index[tz]])
(ROOT / "data" / "cities.json").write_text(
    json.dumps({"source": "GeoNames (geonames.org), CC BY 4.0", "tz": zones, "c": out},
               ensure_ascii=False, separators=(",", ":")))
print(f"{len(out)} cities, {len(zones)} zones, {missing} without a zone")
