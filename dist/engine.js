// Gamla Healing Sabian calculator: chart engine (browser + Node).
//
// A line-by-line port of reference/gamla_chart_engine.py v0.2. The Python file
// is the golden reference: tests/run_golden.mjs checks this file against it on
// 54 charts. If the two ever disagree, the Python version wins until proven wrong.
//
// Nothing here writes interpretation. Every string is either computed from the
// ephemeris or looked up in the degree map Sylvain authored.
//
// SPDX-License-Identifier: AGPL-3.0-or-later

export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

// Reading order on the page. Nodes are MEAN nodes (Sylvain's practice).
export const READING_ORDER = [
  "Sun", "Moon", "Ascendant", "Midheaven",
  "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
  "Uranus", "Neptune", "Pluto",
  "North Node", "South Node",
  "Chiron", "Lilith (mean)", "Ceres", "Pallas", "Juno", "Vesta",
  "Part of Fortune",
];

export const FREE_TIER = new Set(["Sun", "Moon", "Ascendant", "Midheaven", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
  "North Node", "South Node"]);

const ANGLES = new Set(["Ascendant", "Midheaven", "Descendant", "IC"]);

// ---------------------------------------------------------------- degrees

// Rudhyar/Wheeler round-up: anything in [20, 21) is the 21st degree.
// Capped at 30 so 29°59' never spills into the next sign.
export function sabianDegree(lon) {
  const inSign = lon % 30;
  return [SIGNS[Math.floor(lon / 30)], Math.min(Math.floor(inSign) + 1, 30)];
}

// Truncate minutes, never round, so the display always agrees with the degree.
export function fmt(lon, retro = false) {
  const inSign = lon % 30;
  const d = Math.floor(inSign + 1e-9);
  const m = Math.min(Math.floor((inSign - d) * 60 + 1e-9), 59);
  return `${d}°${String(m).padStart(2, "0")}' ${SIGNS[Math.floor(lon / 30)]}` + (retro ? " Rx" : "");
}

// ---------------------------------------------------------------- time zones
//
// The hard part. JavaScript has no "make a datetime in zone X" function, so we
// ask Intl what the wall clock in zone X reads at a given UTC instant, and work
// backwards. Intl uses the IANA database built into the browser, the same data
// Python's zoneinfo uses, so historical rules (wartime, Paris Mean Time,
// Britain's 1968-71 experiment) come for free.

const fmtCache = new Map();
function wallClock(utcMs, tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

// Offset (ms) of zone tz from UTC at a UTC instant.
const offsetAt = (utcMs, tz) => wallClock(utcMs, tz) - utcMs;

// Local wall time -> UTC, matching Python zoneinfo with fold=0:
//  - normal time: the one valid offset
//  - repeated time (clocks went back): the FIRST occurrence (earlier offset)
//  - missing time (clocks jumped forward): the offset in force BEFORE the jump
// Returns { utcMs, offsetMs, status: "ok" | "gap" | "repeat", otherOffsetMs }.
export function localToUtc(y, mo, d, hh, mi, tz) {
  const naive = Date.UTC(y, mo - 1, d, hh, mi);
  const DAY = 86400000;
  const before = offsetAt(naive - DAY, tz);
  const after = offsetAt(naive + DAY, tz);
  const valid = [...new Set([before, after])].filter(o => wallClock(naive - o, tz) === naive);
  if (valid.length === 2) {
    return { utcMs: naive - before, offsetMs: before, status: "repeat", otherOffsetMs: after };
  }
  if (valid.length === 1) {
    return { utcMs: naive - valid[0], offsetMs: valid[0], status: "ok" };
  }
  return { utcMs: naive - before, offsetMs: before, status: "gap" };
}

// "+0100", "+000921" (seconds only when present, like Python's %z)
function fmtOffset(ms) {
  const sign = ms < 0 ? "-" : "+";
  let s = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const two = n => String(n).padStart(2, "0");
  return sign + two(h) + two(m) + (s ? two(s) : "");
}

function timeWarnings(res, y, mo, d, hh, mi, tz) {
  const two = n => String(n).padStart(2, "0");
  const when = `${two(hh)}:${two(mi)}`;
  const day = `${two(d)} ${MONTHS[mo - 1]} ${y}`;
  if (res.status === "gap") {
    return [`${when} did not exist on ${day} in ${tz} (clocks jumped forward). ` +
      "Please check the birth certificate."];
  }
  if (res.status === "repeat") {
    return [`${when} happened twice on ${day} in ${tz} (clocks went back). ` +
      `Calculated with UTC${fmtOffset(res.offsetMs)}; the other possibility is ` +
      `UTC${fmtOffset(res.otherOffsetMs)}.`];
  }
  return [];
}

// ---------------------------------------------------------------- chart

const BODIES = [
  ["Sun", "SE_SUN"], ["Moon", "SE_MOON"],
  ["Mercury", "SE_MERCURY"], ["Venus", "SE_VENUS"], ["Mars", "SE_MARS"],
  ["Jupiter", "SE_JUPITER"], ["Saturn", "SE_SATURN"], ["Uranus", "SE_URANUS"],
  ["Neptune", "SE_NEPTUNE"], ["Pluto", "SE_PLUTO"],
  ["North Node", "SE_MEAN_NODE"],
  ["Chiron", "SE_CHIRON"], ["Ceres", "SE_CERES"], ["Pallas", "SE_PALLAS"],
  ["Juno", "SE_JUNO"], ["Vesta", "SE_VESTA"],
  ["Lilith (mean)", "SE_MEAN_APOG"],
];

/**
 * @param swe        an initialised SwissEph instance (swisseph-wasm)
 * @param degreeMap  object keyed "Sign N" -> {symbol, keyword, title, url}
 * @param input      {date: "YYYY-MM-DD", time: "HH:MM" | null, lat, lon, tz}
 */
export function computeChart(swe, degreeMap, input) {
  const { lat, lon, tz } = input;
  const noTime = !input.time;
  const [y, mo, d] = input.date.split("-").map(Number);
  const [hh, mi] = noTime ? [12, 0] : input.time.split(":").map(Number);

  // Unknown time: LOCAL noon, the middle of the birth day wherever it was.
  const res = localToUtc(y, mo, d, hh, mi, tz);
  const warnings = noTime ? [] : timeWarnings(res, y, mo, d, hh, mi, tz);
  const ut = new Date(res.utcMs);
  const hours = ut.getUTCHours() + ut.getUTCMinutes() / 60 + ut.getUTCSeconds() / 3600;
  const jd = swe.julday(ut.getUTCFullYear(), ut.getUTCMonth() + 1, ut.getUTCDate(), hours);

  const flags = swe.SEFLG_SWIEPH | swe.SEFLG_SPEED;
  const pos = {};
  const unavailable = [];
  for (const [name, key] of BODIES) {
    try {
      const r = swe.calc_ut(jd, swe[key], flags);
      pos[name] = [r[0], r[3] < 0];
    } catch (e) {
      unavailable.push(`${name} unavailable (${String(e.message || e)})`);
    }
  }
  if (pos["North Node"]) {
    // The mean node is always retrograde, so "Rx" says nothing: never shown.
    pos["North Node"] = [pos["North Node"][0], false];
    pos["South Node"] = [(pos["North Node"][0] + 180) % 360, false];
  }

  let cusps = [];            // 12 cusps, house 1 first
  let houseOf = () => null;
  let houseSystem = null;
  let isDay = null;
  if (!noTime) {
    // Placidus is undefined where part of the ecliptic never rises or sets.
    // Checked explicitly: the WASM build would otherwise silently use Porphyry.
    const obliquity = swe.calc_ut(jd, swe.SE_ECL_NUT, 0)[0];
    let h;
    if (Math.abs(lat) >= 90 - obliquity) {
      h = swe.houses(jd, lat, lon, "W");
      houseSystem = "Whole Sign";
      warnings.push(`Placidus houses are undefined at latitude ${Math.abs(lat).toFixed(1)} deg ` +
        `${lat >= 0 ? "N" : "S"}, so this chart uses Whole Sign houses.`);
    } else {
      h = swe.houses(jd, lat, lon, "P");
      houseSystem = "Placidus";
    }
    cusps = Array.from(h.cusps).slice(1, 13);
    const asc = h.ascmc[0], mc = h.ascmc[1];
    pos["Ascendant"] = [asc, false];
    pos["Midheaven"] = [mc, false];

    houseOf = l => {
      for (let i = 0; i < 12; i++) {
        const a = cusps[i], b = cusps[(i + 1) % 12];
        if (a <= b ? (a <= l && l < b) : (l >= a || l < b)) return i + 1;
      }
      return null;
    };

    // Day chart = Sun above the horizon. Part of Fortune reverses at night.
    isDay = ((pos["Sun"][0] - asc) % 360 + 360) % 360 > 180;
    const sun = pos["Sun"][0], moon = pos["Moon"][0];
    const pof = isDay ? asc + moon - sun : asc + sun - moon;
    pos["Part of Fortune"] = [((pof % 360) + 360) % 360, false];
  }

  const points = [];
  const seen = new Set();
  for (const name of READING_ORDER) {
    if (!pos[name]) continue;
    const [l, retro] = pos[name];
    const [sign, deg] = sabianDegree(l);
    const row = degreeMap[`${sign} ${deg}`];
    points.push({
      point: name,
      tier: FREE_TIER.has(name) ? "free" : "dossier",
      longitude: l,
      position: fmt(l, retro),
      retrograde: retro,
      house: ANGLES.has(name) ? null : houseOf(l),
      sabian: `${sign} ${deg}°`,
      symbol: row ? row.symbol : null,
      keyword: row ? row.keyword : null,
      article_title: row ? row.title : null,
      article_url: row ? row.url : null,
      duplicate_of_earlier_point: row ? seen.has(row.url) : false,
    });
    if (row) seen.add(row.url);
  }

  const two = n => String(n).padStart(2, "0");
  return {
    meta: {
      timezone: tz,
      universal_time: `${ut.getUTCFullYear()}-${two(ut.getUTCMonth() + 1)}-${two(ut.getUTCDate())} ` +
        `${two(ut.getUTCHours())}:${two(ut.getUTCMinutes())}:${two(ut.getUTCSeconds())} UT`,
      utc_offset: fmtOffset(res.offsetMs),
      julian_day_ut: jd,
      house_system: houseSystem,
      birth_time_known: !noTime,
      sect: isDay === null ? null : (isDay ? "day" : "night"),
      warnings: (noTime
        ? ["Birth time unknown: calculated for local noon. Houses, Ascendant, " +
           "Midheaven and Part of Fortune omitted. The Moon may be off by up " +
           "to about 7 degrees, so its Sabian symbol is uncertain."]
        : []).concat(warnings, unavailable),
    },
    points,
    house_cusps: cusps.map((c, i) => ({ house: i + 1, position: fmt(c) })),
  };
}
