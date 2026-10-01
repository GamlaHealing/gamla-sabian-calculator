#!/usr/bin/env python3
"""
Gamla Healing - Sabian Dossier Engine (v0.2 reference implementation)

Takes birth data, computes every chart point with the Swiss Ephemeris, maps each
one to its Sabian degree using the Rudhyar/Wheeler round-up convention, and
resolves it against sabian_degree_map.csv to produce the article manifest for a
personalised dossier.

Usage:
    python3 gamla_chart_engine.py --date 1990-02-11 --time 12:21 \
        --lat 45.5646 --lon 5.9178 --place "Chambery, France" \
        --map sabian_degree_map.csv

    # unknown birth time: drops houses, Ascendant, MC and Part of Fortune
    python3 gamla_chart_engine.py --date 1990-02-11 --no-time \
        --lat 45.5646 --lon 5.9178 --map sabian_degree_map.csv

    # machine-readable
    python3 gamla_chart_engine.py ... --json > dossier.json

Dependencies:
    pip install pyswisseph timezonefinder

Ephemeris files:
    Planets, Moon, nodes, mean Lilith and the angles work out of the box.
    Chiron, Ceres, Pallas, Juno and Vesta need Astrodienst's free `seas_18.se1`
    (plus `sepl_18.se1` and `semo_18.se1` for full precision). Put them in a
    directory and pass --ephe /path/to/ephe. Without it, asteroid points are
    reported as unavailable rather than guessed.

Changes in v0.2 (28 Sep 2026):
    - Unknown birth time now uses LOCAL noon, not noon UT (the old choice put the
      Moon up to ~11 degrees off for births far from Greenwich).
    - Minutes are truncated, never rounded, so the printed position always agrees
      with the Sabian degree (20 deg 59.7' prints 20 deg 59', not 21 deg 00').
    - Above the polar circles, where Placidus is undefined, houses fall back to
      Whole Sign with an explicit warning.
    - Birth times that never existed (spring DST gap) or happened twice (autumn
      repeat) raise a visible warning.
    - Day/night sect for Part of Fortune is read from the horizon, not from house
      numbers, so it stays correct under the Whole Sign fallback.
    - Julian day now includes seconds (historical offsets such as Paris Mean
      Time, UTC+0:09:21, were being cut to the minute).
    - Every point carries a `tier`: "free" (public calculator) or "dossier".
    - Nodes are the MEAN node (Sylvain's practice), labelled "North Node".
      Mean Lilith was already used, so both lunar points now use mean values.

This file is the golden reference for the browser port: the JS version must
reproduce its output to the arc-minute on the shared test charts.
"""

import argparse
import csv
import json
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import swisseph as swe

SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
         "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]

# Order is the dossier's reading order, not the ephemeris order.
BODIES = [
    ("Sun", swe.SUN), ("Moon", swe.MOON),
    ("Mercury", swe.MERCURY), ("Venus", swe.VENUS), ("Mars", swe.MARS),
    ("Jupiter", swe.JUPITER), ("Saturn", swe.SATURN), ("Uranus", swe.URANUS),
    ("Neptune", swe.NEPTUNE), ("Pluto", swe.PLUTO),
    ("North Node", swe.MEAN_NODE),  # mean node, per Sylvain's practice
    ("Chiron", swe.CHIRON), ("Ceres", swe.CERES), ("Pallas", swe.PALLAS),
    ("Juno", swe.JUNO), ("Vesta", swe.VESTA),
    ("Lilith (mean)", swe.MEAN_APOG),
]

READING_ORDER = [
    "Sun", "Moon", "Ascendant", "Midheaven",
    "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
    "Uranus", "Neptune", "Pluto",
    "North Node", "South Node",
    "Chiron", "Lilith (mean)", "Ceres", "Pallas", "Juno", "Vesta",
    "Part of Fortune",
]

# Points that only exist when the birth time is known.
TIME_DEPENDENT = {"Ascendant", "Midheaven", "Descendant", "IC", "Part of Fortune"}

# Shown on the free public calculator. Everything else is dossier-only.
FREE_TIER = {"Sun", "Moon", "Ascendant", "Midheaven", "Mercury", "Venus", "Mars",
             "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
             "North Node", "South Node"}
ANGLES = {"Ascendant", "Midheaven", "Descendant", "IC"}


def sabian_degree(longitude):
    """Rudhyar/Wheeler round-up: 20 deg 02' falls in the 21st degree.

    A point anywhere in [20.0, 21.0) is the 21st degree. Capped at 30 so that
    29 deg 59' does not overflow into the next sign.
    """
    in_sign = longitude % 30
    return SIGNS[int(longitude // 30)], min(int(in_sign) + 1, 30)


def fmt(longitude, retro=False):
    # Truncate, never round: the displayed degree must match the Sabian degree.
    # The 1e-9 guards against float noise such as 20.999999999 for 21 deg 00'.
    in_sign = longitude % 30
    d = int(in_sign + 1e-9)
    m = min(int((in_sign - d) * 60 + 1e-9), 59)
    return f"{d}°{m:02d}' {SIGNS[int(longitude // 30)]}" + (" Rx" if retro else "")


def load_map(path):
    out = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            out[(row["sign"], int(row["degree"]))] = row
    if len(out) != 360:
        print(f"WARNING: degree map has {len(out)} rows, expected 360.", file=sys.stderr)
    return out


def resolve_timezone(lat, lon, override=None):
    if override:
        return override
    try:
        from timezonefinder import TimezoneFinder
        tz = TimezoneFinder().timezone_at(lat=lat, lng=lon)
        if tz:
            return tz
    except ImportError:
        pass
    raise SystemExit("Could not resolve timezone. Install timezonefinder or pass --tz.")


def check_local_time(local):
    """Flag clock times that never happened or happened twice (DST changes)."""
    utc = ZoneInfo("UTC")
    round_trip = local.astimezone(utc).astimezone(local.tzinfo)
    if round_trip.replace(tzinfo=None) != local.replace(tzinfo=None):
        return [f"{local:%H:%M} did not exist on {local:%d %B %Y} in {local.tzinfo.key} "
                "(clocks jumped forward). Please check the birth certificate."]
    other = local.replace(fold=1)
    if other.utcoffset() != local.utcoffset():
        return [f"{local:%H:%M} happened twice on {local:%d %B %Y} in {local.tzinfo.key} "
                f"(clocks went back). Calculated with UTC{local:%z}; the other "
                f"possibility is UTC{other:%z}."]
    return []


def compute(args, degree_map):
    tzname = resolve_timezone(args.lat, args.lon, args.tz)
    y, mo, d = (int(x) for x in args.date.split("-"))

    zone = ZoneInfo(tzname)
    time_warnings = []
    if args.no_time:
        # LOCAL noon sits in the middle of the birth day wherever the person was
        # born, so the Moon (about 12-15 deg a day) is at most ~7 deg off.
        local = datetime(y, mo, d, 12, 0, tzinfo=zone)
    else:
        hh, mm = (int(x) for x in args.time.split(":"))
        local = datetime(y, mo, d, hh, mm, tzinfo=zone)
        time_warnings = check_local_time(local)
    ut = local.astimezone(ZoneInfo("UTC"))

    # Seconds matter: pre-1911 Paris Mean Time was UTC+0:09:21, and dropping the
    # 21 seconds moves the Ascendant by about 5 arc-minutes.
    jd = swe.julday(ut.year, ut.month, ut.day, ut.hour + ut.minute / 60 + ut.second / 3600)
    if args.ephe:
        swe.set_ephe_path(args.ephe)

    flags = swe.FLG_SWIEPH | swe.FLG_SPEED
    pos, unavailable = {}, []
    for name, body in BODIES:
        try:
            r, _ = swe.calc_ut(jd, body, flags)
            pos[name] = (r[0], r[3] < 0)
        except Exception as exc:
            unavailable.append((name, str(exc).split(":")[-1].strip()))

    if "North Node" in pos:
        # The mean node is always retrograde by definition, so "Rx" carries no
        # information for either node and is not printed.
        pos["North Node"] = (pos["North Node"][0], False)
        pos["South Node"] = ((pos["North Node"][0] + 180) % 360, False)

    cusps, house_of, house_system = (), lambda _lon: None, None
    if not args.no_time:
        # Placidus is undefined where part of the ecliptic never rises or sets:
        # |latitude| >= 90 deg minus the obliquity (about 66.56 deg). Checked
        # explicitly because the C library behaves differently per wrapper:
        # pyswisseph raises, the WASM build silently substitutes Porphyry.
        obliquity = swe.calc_ut(jd, swe.ECL_NUT)[0][0]
        try:
            if abs(args.lat) >= 90 - obliquity:
                raise swe.Error("polar latitude")
            cusps, ascmc = swe.houses(jd, args.lat, args.lon, b"P")  # Placidus
            house_system = "Placidus"
        except swe.Error:
            # Placidus is mathematically undefined near the poles.
            cusps, ascmc = swe.houses(jd, args.lat, args.lon, b"W")  # Whole Sign
            house_system = "Whole Sign"
            time_warnings.append(
                f"Placidus houses are undefined at latitude {abs(args.lat):.1f} deg "
                f"{'N' if args.lat >= 0 else 'S'}, so this chart uses Whole Sign houses.")
        asc, mc = ascmc[0], ascmc[1]
        pos["Ascendant"] = (asc, False)
        pos["Midheaven"] = (mc, False)
        pos["Descendant"] = ((asc + 180) % 360, False)
        pos["IC"] = ((mc + 180) % 360, False)

        def house_of(lon):
            for i in range(12):
                a, b = cusps[i], cusps[(i + 1) % 12]
                if a <= b:
                    if a <= lon < b:
                        return i + 1
                elif lon >= a or lon < b:
                    return i + 1
            return None

        # Part of Fortune: day chart uses ASC + Moon - Sun, night reverses it.
        # Day = Sun above the horizon = ecliptically between Descendant and
        # Ascendant through the MC. Independent of the house system.
        is_day = (pos["Sun"][0] - asc) % 360 > 180
        pof = (asc + pos["Moon"][0] - pos["Sun"][0]) % 360 if is_day \
            else (asc + pos["Sun"][0] - pos["Moon"][0]) % 360
        pos["Part of Fortune"] = (pof, False)
    else:
        is_day = None

    points, seen = [], set()
    for name in READING_ORDER:
        if name not in pos:
            continue
        lon, retro = pos[name]
        sign, deg = sabian_degree(lon)
        row = degree_map.get((sign, deg))
        points.append({
            "point": name,
            "tier": "free" if name in FREE_TIER else "dossier",
            "longitude": round(lon, 4),
            "position": fmt(lon, retro),
            "retrograde": retro,
            "house": house_of(lon) if name not in ANGLES else None,
            "sabian": f"{sign} {deg}°",
            "symbol": row["symbol"] if row else None,
            "jones_keyword": row["jones_keyword"] if row else None,
            "article_title": row["title"] if row else None,
            "article_url": row["url"] if row else None,
            "duplicate_of_earlier_point": row["url"] in seen if row else False,
        })
        if row:
            seen.add(row["url"])

    return {
        "meta": {
            "place": args.place,
            "latitude": args.lat,
            "longitude": args.lon,
            "timezone": tzname,
            "local_time": None if args.no_time else local.strftime("%Y-%m-%d %H:%M %Z%z"),
            "universal_time": ut.strftime("%Y-%m-%d %H:%M:%S UT"),
            "utc_offset": local.strftime("%z"),
            "julian_day_ut": jd,
            "house_system": house_system,
            "birth_time_known": not args.no_time,
            "sect": None if is_day is None else ("day" if is_day else "night"),
            "warnings": (
                ["Birth time unknown: calculated for local noon. Houses, Ascendant, "
                 "Midheaven and Part of Fortune omitted. The Moon may be off by up "
                 "to about 7 degrees, so its Sabian symbol is uncertain."]
                if args.no_time else []
            ) + time_warnings + [f"{n} unavailable ({why})" for n, why in unavailable],
        },
        "points": points,
        "house_cusps": [
            {"house": i + 1, "position": fmt(c)} for i, c in enumerate(cusps[:12])
        ],
        "dossier": {
            "unique_articles": len(seen),
            "estimated_words": len(seen) * 2450,
            "urls": sorted(seen),
        },
    }


def render(result):
    m = result["meta"]
    print(f"\n{m['place']}   {m['local_time'] or '(birth time unknown)'}   ->   {m['universal_time']}")
    print(f"Timezone {m['timezone']}   Houses: {m['house_system'] or 'n/a'}   "
          f"Sect: {m['sect'] or 'n/a'}   JD {m['julian_day_ut']:.6f}")
    for w in m["warnings"]:
        print(f"  ! {w}")

    print(f"\n{'Point':<16}{'Position':<22}{'Hse':<5}{'Sabian':<15}"
          f"{'Symbol':<30}{'Keyword':<15}")
    print("-" * 103)
    for p in result["points"]:
        print(f"{p['point']:<16}{p['position']:<22}{str(p['house'] or ''):<5}"
              f"{p['sabian']:<15}{(p['symbol'] or '?'):<30}{(p['jones_keyword'] or '?'):<15}")

    if result["house_cusps"]:
        print("\nHouse cusps (Placidus):")
        for c in result["house_cusps"]:
            print(f"  H{c['house']:<4}{c['position']}")

    print("\nDossier manifest:")
    for p in result["points"]:
        if not p["article_url"]:
            continue
        tag = "  (repeat)" if p["duplicate_of_earlier_point"] else ""
        print(f"  {p['point']:<16}{p['sabian']:<15}\"{p['article_title']}\"{tag}")
    d = result["dossier"]
    print(f"\n{d['unique_articles']} unique articles, approx {d['estimated_words']:,} words.")


def main():
    ap = argparse.ArgumentParser(description="Gamla Healing Sabian dossier engine")
    ap.add_argument("--date", required=True, help="birth date, YYYY-MM-DD")
    ap.add_argument("--time", help="local birth time, HH:MM")
    ap.add_argument("--no-time", action="store_true", help="birth time unknown")
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--place", default="", help="label only, not used in maths")
    ap.add_argument("--tz", help="IANA timezone, e.g. Europe/Paris (else derived from lat/lon)")
    ap.add_argument("--map", default="sabian_degree_map.csv")
    ap.add_argument("--ephe", help="directory holding Astrodienst .se1 files")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of a table")
    args = ap.parse_args()

    if not args.no_time and not args.time:
        ap.error("pass --time HH:MM, or --no-time if it is unknown")

    result = compute(args, load_map(args.map))
    if args.json:
        json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
        print()
    else:
        render(result)


if __name__ == "__main__":
    main()
