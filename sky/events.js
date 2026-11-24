// Gamla Healing: the sky in motion. Upcoming events finder.
// Finds, for a time window: new and full moons, solar and lunar eclipses, sign changes
// (Sun to Pluto and the mean North Node), and stations (Mercury to Pluto turning
// retrograde or direct). Pure functions: give it the SwissEph module, get a sorted list.
// All times are Julian days in UT.
// SPDX-License-Identifier: AGPL-3.0-or-later

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const NAMES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node"];
const SWIEPH = 2, SPEED = 256;
const ECL = { TOTAL: 4, ANNULAR: 8, PARTIAL: 16, HYBRID: 32, PENUMBRAL: 64 };

function makeCalc(M) {
  return (jd, body) => {
    const r = M._malloc(48), e = M._malloc(256);
    const ret = M.ccall("swe_calc_ut", "number", ["number", "number", "number", "number", "number"], [jd, body, SWIEPH | SPEED, r, e]);
    const o = { lon: M.HEAPF64[r >> 3], speed: M.HEAPF64[(r >> 3) + 3], ok: ret >= 0 };
    M._free(r); M._free(e); return o;
  };
}
const wrap180 = x => ((x % 360) + 540) % 360 - 180;

// Bisection on a function that changes sign between a and b. 40 halvings of a
// quarter day is far below a second.
function root(fn, a, b) {
  let fa = fn(a);
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2, fm = fn(m);
    if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

export function upcomingEvents(swe, M, jd0, days = 92) {
  const calc = makeCalc(M), end = jd0 + days, STEP = 0.25, out = [];

  // New and full moons: the Moon's distance from the Sun crosses 0° or 180°.
  for (const [target, kind] of [[0, "new"], [180, "full"]]) {
    const f = t => wrap180(calc(t, 1).lon - calc(t, 0).lon - target);
    for (let t = jd0; t < end; t += STEP) {
      const a = f(t), b = f(t + STEP);
      if (a < 0 && b >= 0 && b - a < 90) {
        const jd = root(f, t, t + STEP);
        if (jd >= jd0 && jd < end) out.push({ jd, kind, body: "Moon", lon: calc(jd, 1).lon });
      }
    }
  }

  // Eclipses, with Swiss Ephemeris' own global search.
  for (let t = jd0; ;) {
    const r = swe.sol_eclipse_when_glob(t, SWIEPH, 0, 0);
    if (!r || r.tret[0] >= end) break;
    const f = r.retFlag, type = f & ECL.TOTAL ? "total" : f & ECL.HYBRID ? "hybrid" : f & ECL.ANNULAR ? "annular" : "partial";
    out.push({ jd: r.tret[0], kind: "solar-eclipse", type, body: "Sun", lon: calc(r.tret[0], 0).lon });
    t = r.tret[0] + 20;
  }
  for (let t = jd0; ;) {
    const r = swe.lun_eclipse_when(t, SWIEPH, 0, 0);
    if (!r || r.tret[0] >= end) break;
    const f = r.retFlag, type = f & ECL.TOTAL ? "total" : f & ECL.PARTIAL ? "partial" : "penumbral";
    out.push({ jd: r.tret[0], kind: "lunar-eclipse", type, body: "Moon", lon: calc(r.tret[0], 1).lon });
    t = r.tret[0] + 20;
  }
  // An eclipse is also a new or full moon: keep the eclipse entry, drop the duplicate.
  const ecl = out.filter(e => e.kind.endsWith("eclipse"));
  for (let i = out.length - 1; i >= 0; i--) {
    const e = out[i];
    if ((e.kind === "new" || e.kind === "full") && ecl.some(x => Math.abs(x.jd - e.jd) < 0.5)) out.splice(i, 1);
  }

  // Sign changes (the Moon is left out: it changes sign every two to three days).
  for (const b of [0, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    let prev = calc(jd0, b).lon;
    for (let t = jd0; t < end; t += STEP) {
      const next = calc(t + STEP, b).lon;
      const sa = Math.floor(prev / 30), sb = Math.floor(next / 30);
      if (sa !== sb) {
        // the boundary crossed: the start of the later sign in the direction of travel
        const forward = wrap180(next - prev) > 0;
        const edge = (forward ? sb : sa) * 30;
        const jd = root(x => wrap180(calc(x, b).lon - edge), t, t + STEP);
        const sign = forward ? sb : (sb + 12) % 12;
        if (jd >= jd0 && jd < end) out.push({ jd, kind: "ingress", body: NAMES[b], sign, retro: !forward, lon: forward ? edge % 360 : (edge + 360 - 1e-7) % 360 });
      }
      prev = next;
    }
  }

  // Stations: the planet's daily motion changes sign.
  for (const b of [2, 3, 4, 5, 6, 7, 8, 9]) {
    for (let t = jd0; t < end; t += STEP) {
      const a = calc(t, b).speed, c = calc(t + STEP, b).speed;
      if ((a < 0) !== (c < 0)) {
        const jd = root(x => calc(x, b).speed, t, t + STEP);
        if (jd >= jd0 && jd < end) out.push({ jd, kind: a > 0 ? "station-retro" : "station-direct", body: NAMES[b], lon: calc(jd, b).lon });
      }
    }
  }
  return out.sort((x, y) => x.jd - y.jd);
}

export { SIGNS as EVENT_SIGNS };
