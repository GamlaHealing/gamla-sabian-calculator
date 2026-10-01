#!/usr/bin/env python3
"""
Build the golden test set for the browser port.

Runs the Python reference engine on a fixed list of charts and writes inputs +
expected outputs to tests/golden_charts.json. The JS engine must reproduce every
field. Two groups of charts:

  1. CURATED  - each one exists to break something specific (named in `why`).
  2. RANDOM   - seeded random births across 40 cities and 1920-2025, to catch
                what nobody thought to curate.

Run:  python3 reference/make_golden.py
"""
import json
import random
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "reference"))
import gamla_chart_engine as eng  # noqa: E402

EPHE = str(ROOT / "ephe")
MAP = eng.load_map(ROOT / "data" / "sabian_degree_map.csv")

# (id, why, date, time or None, lat, lon, IANA tz)
CURATED = [
    ("sylvain", "Validated chart: six facts checked by hand",
     "1990-02-11", "12:21", 45.5646, 5.9178, "Europe/Paris"),
    ("sylvain-notime", "Same chart, unknown-time mode (local noon)",
     "1990-02-11", None, 45.5646, 5.9178, "Europe/Paris"),
    ("honolulu-notime", "Far west of Greenwich: local noon, not noon UT",
     "1990-02-11", None, 21.3069, -157.8583, "Pacific/Honolulu"),
    ("auckland", "Near the date line, southern hemisphere, NZ DST",
     "1985-01-15", "06:40", -36.8485, 174.7633, "Pacific/Auckland"),
    ("sydney", "Southern hemisphere Placidus, DST in January",
     "1978-01-26", "23:55", -33.8688, 151.2093, "Australia/Sydney"),
    ("buenos-aires", "Southern hemisphere, western longitude",
     "1966-07-09", "04:15", -34.6037, -58.3816, "America/Argentina/Buenos_Aires"),
    ("mumbai", "Half-hour offset (UTC+5:30)",
     "1995-08-15", "14:10", 19.0760, 72.8777, "Asia/Kolkata"),
    ("kathmandu", "Quarter-hour offset (UTC+5:45)",
     "2001-04-14", "09:00", 27.7172, 85.3240, "Asia/Kathmandu"),
    ("st-johns", "Newfoundland half-hour offset with DST",
     "1982-07-01", "17:30", 47.5615, -52.7126, "America/St_Johns"),
    ("paris-gap", "Clock time that never existed (spring forward)",
     "1990-03-25", "02:30", 48.8566, 2.3522, "Europe/Paris"),
    ("paris-repeat", "Clock time that happened twice (autumn back)",
     "1990-09-30", "02:30", 48.8566, 2.3522, "Europe/Paris"),
    ("paris-1943", "Wartime occupation time (historical tz rules)",
     "1943-06-10", "10:00", 48.8566, 2.3522, "Europe/Paris"),
    ("paris-1905", "Paris Mean Time era (offset with seconds)",
     "1905-03-01", "08:00", 48.8566, 2.3522, "Europe/Paris"),
    ("london-1968", "British Standard Time experiment (UTC+1 in winter)",
     "1969-01-20", "12:00", 51.5074, -0.1278, "Europe/London"),
    ("tromso", "Polar: Placidus undefined, Whole Sign fallback",
     "1990-02-11", "12:21", 69.6492, 18.9553, "Europe/Oslo"),
    ("longyearbyen", "Deep polar",
     "2000-06-21", "00:30", 78.2232, 15.6267, "Arctic/Longyearbyen"),
    ("ushuaia", "High southern latitude, still under the polar limit",
     "1990-12-21", "21:00", -54.8019, -68.3030, "America/Argentina/Ushuaia"),
    ("reykjavik", "Just under the polar limit, Placidus must still work",
     "1970-03-20", "07:00", 64.1466, -21.9426, "Atlantic/Reykjavik"),
    ("quito", "Equator",
     "1999-09-23", "12:00", -0.1807, -78.4678, "America/Guayaquil"),
    ("new-year-utc", "Local date differs from UT date",
     "2000-01-01", "00:15", 40.7128, -74.0060, "America/New_York"),
    ("tokyo-late", "UT date is the previous day",
     "1988-11-03", "05:30", 35.6762, 139.6503, "Asia/Tokyo"),
    ("sun-at-horizon", "Sunrise birth: sect decided by the horizon rule",
     "1990-06-21", "05:47", 48.8566, 2.3522, "Europe/Paris"),
    ("aries-ingress", "Sun near 0 Aries (sign boundary)",
     "2000-03-20", "08:35", 51.5074, -0.1278, "Europe/London"),
    ("recent", "Recent birth, current tz rules",
     "2025-05-05", "15:05", 28.4636, -16.2518, "Atlantic/Canary"),
]

CITIES = [
    (40.7128, -74.0060, "America/New_York"), (34.0522, -118.2437, "America/Los_Angeles"),
    (41.8781, -87.6298, "America/Chicago"), (19.4326, -99.1332, "America/Mexico_City"),
    (-23.5505, -46.6333, "America/Sao_Paulo"), (4.7110, -74.0721, "America/Bogota"),
    (43.6532, -79.3832, "America/Toronto"), (49.2827, -123.1207, "America/Vancouver"),
    (51.5074, -0.1278, "Europe/London"), (48.8566, 2.3522, "Europe/Paris"),
    (52.5200, 13.4050, "Europe/Berlin"), (40.4168, -3.7038, "Europe/Madrid"),
    (41.9028, 12.4964, "Europe/Rome"), (59.3293, 18.0686, "Europe/Stockholm"),
    (55.7558, 37.6173, "Europe/Moscow"), (37.9838, 23.7275, "Europe/Athens"),
    (41.0082, 28.9784, "Europe/Istanbul"), (50.0755, 14.4378, "Europe/Prague"),
    (38.7223, -9.1393, "Europe/Lisbon"), (53.3498, -6.2603, "Europe/Dublin"),
    (45.5646, 5.9178, "Europe/Paris"), (46.2044, 6.1432, "Europe/Zurich"),
    (30.0444, 31.2357, "Africa/Cairo"), (-26.2041, 28.0473, "Africa/Johannesburg"),
    (6.5244, 3.3792, "Africa/Lagos"), (-1.2921, 36.8219, "Africa/Nairobi"),
    (33.5731, -7.5898, "Africa/Casablanca"), (32.0853, 34.7818, "Asia/Jerusalem"),
    (35.6892, 51.3890, "Asia/Tehran"), (25.2048, 55.2708, "Asia/Dubai"),
    (28.6139, 77.2090, "Asia/Kolkata"), (13.7563, 100.5018, "Asia/Bangkok"),
    (1.3521, 103.8198, "Asia/Singapore"), (39.9042, 116.4074, "Asia/Shanghai"),
    (37.5665, 126.9780, "Asia/Seoul"), (14.5995, 120.9842, "Asia/Manila"),
    (-37.8136, 144.9631, "Australia/Melbourne"), (-31.9505, 115.8605, "Australia/Perth"),
    (-41.2865, 174.7762, "Pacific/Auckland"), (28.4636, -16.2518, "Atlantic/Canary"),
]


def run(case_id, why, date, time, lat, lon, tz):
    args = SimpleNamespace(date=date, time=time, no_time=time is None, lat=lat, lon=lon,
                           place=case_id, tz=tz, ephe=EPHE)
    result = eng.compute(args, MAP)
    return {
        "id": case_id,
        "why": why,
        "input": {"date": date, "time": time, "lat": lat, "lon": lon, "tz": tz},
        "expected": {
            "universal_time": result["meta"]["universal_time"],
            "utc_offset": result["meta"]["utc_offset"],
            "house_system": result["meta"]["house_system"],
            "sect": result["meta"]["sect"],
            "warnings": result["meta"]["warnings"],
            "points": [
                {k: p[k] for k in ("point", "tier", "longitude", "position", "retrograde",
                                   "house", "sabian", "symbol", "article_url")}
                for p in result["points"]
            ],
            "house_cusps": result["house_cusps"],
        },
    }


def main():
    cases = [run(*c) for c in CURATED]
    rng = random.Random(1990)  # fixed seed: same "random" charts every run
    for i in range(30):
        lat, lon, tz = rng.choice(CITIES)
        y, mo, d = rng.randint(1920, 2025), rng.randint(1, 12), rng.randint(1, 28)
        time = None if i % 10 == 9 else f"{rng.randint(0, 23):02d}:{rng.randint(0, 59):02d}"
        cases.append(run(f"random-{i:02d}", "Seeded random birth", f"{y}-{mo:02d}-{d:02d}",
                         time, lat, lon, tz))
    out = ROOT / "tests" / "golden_charts.json"
    out.write_text(json.dumps({
        "generated_by": "reference/gamla_chart_engine.py v0.2",
        "tolerance_degrees": 0.0003,
        "cases": cases,
    }, indent=1, ensure_ascii=False))
    print(f"{len(cases)} charts -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
