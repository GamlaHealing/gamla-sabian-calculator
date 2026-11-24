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

// ---------- personal events against a birth chart
// natal: { pts: [{ name, lon }], cusps: [12 longitudes] | null, asc, mc }
// Returns exact transits in the window:
//  - Jupiter to Pluto making a conjunction, sextile, square, trine or opposition to a birth
//    planet, the North Node, the Ascendant or the Midheaven (every pass, retrograde ones too);
//  - the Sun and Mars making a conjunction to the same points;
//  - the Sun to Pluto crossing into a new birth house (when the birth time is known).
const ASPECTS = [[0, "conjunct"], [60, "sextile"], [90, "square"], [120, "trine"], [180, "opposite"]];
export function personalEvents(swe, M, jd0, natal, days = 92) {
  const calc = makeCalc(M), end = jd0 + days, STEP = 0.25, out = [];
  const targets = natal.pts.filter(q => q.name !== "South Node").map(q => ({ name: q.name, lon: q.lon }));
  if (natal.cusps) targets.push({ name: "Ascendant", lon: natal.asc }, { name: "Midheaven", lon: natal.mc });
  const plan = [[0, [0]], [4, [0]], ...[5, 6, 7, 8, 9].map(b => [b, [0, 60, 90, 120, 180]])];
  for (const [b, angles] of plan) {
    // sample the body once, then test every target against the samples
    const ts = [], ls = [];
    for (let t = jd0; t <= end + STEP; t += STEP) { ts.push(t); ls.push(calc(t, b).lon); }
    for (const q of targets) for (const ang of angles) {
      // a conjunction to the Ascendant or Midheaven is the same moment as entering the 1st or 10th house,
      // which is listed below with its article, so it is not listed twice
      if (ang === 0 && natal.cusps && (q.name === "Ascendant" || q.name === "Midheaven")) continue;
      for (const sgn of ang === 0 || ang === 180 ? [1] : [1, -1]) {
        const goal = (q.lon + sgn * ang + 360) % 360;
        for (let i = 0; i + 1 < ts.length; i++) {
          const a = wrap180(ls[i] - goal), c = wrap180(ls[i + 1] - goal);
          if ((a < 0) !== (c < 0) && Math.abs(a - c) < 20) {
            const jd = root(x => wrap180(calc(x, b).lon - goal), ts[i], ts[i + 1]);
            if (jd >= jd0 && jd < end) {
              const k = calc(jd, b);
              out.push({ jd, kind: "transit", body: NAMES[b], aspect: ASPECTS.find(x => x[0] === ang)[1], target: q.name, retro: k.speed < 0, lon: k.lon });
            }
          }
        }
      }
    }
    // house ingresses (Sun to Pluto, not the Moon)
    if (natal.cusps) {
      const hOf = l => { for (let i = 0; i < 12; i++) { const a = natal.cusps[i], z = natal.cusps[(i + 1) % 12]; if (a <= z ? (a <= l && l < z) : (l >= a || l < z)) return i + 1; } return null; };
      for (let i = 0; i + 1 < ts.length; i++) {
        const h0 = hOf(ls[i]), h1 = hOf(ls[i + 1]);
        if (h0 !== h1 && h1) {
          const forward = wrap180(ls[i + 1] - ls[i]) > 0;
          const edge = natal.cusps[(forward ? h1 : h0) - 1];
          const jd = root(x => wrap180(calc(x, b).lon - edge), ts[i], ts[i + 1]);
          if (jd >= jd0 && jd < end) out.push({ jd, kind: "house", body: NAMES[b], house: h1, retro: !forward, lon: calc(jd, b).lon });
        }
      }
    }
  }
  return out.sort((x, y) => x.jd - y.jd);
}
