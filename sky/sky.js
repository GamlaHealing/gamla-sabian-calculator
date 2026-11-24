// Gamla Healing: the sky in motion (prototype).
// Live chart of the sky for any moment from 4000 BC to 2999 AD, computed in the
// visitor's browser with the same swisseph-wasm build as the Sabian calculator.
// SPDX-License-Identifier: AGPL-3.0-or-later
import SwissEph from "../dist/lib/src/swisseph.js"; // shared with the Sabian calculator
import { upcomingEvents, personalEvents } from "./events.js";
import { NEW_MOON, FULL_MOON, SOLAR_ECLIPSE, LUNAR_ECLIPSE, HOUSE_NOTE } from "./lunation-texts.js";
{
const asset = p => new URL(p, import.meta.url).href;
const $ = id => document.getElementById("gs-" + id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const SG = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"].map(g => g + "︎");
const ELEM = ["fire", "earth", "air", "water"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const HOUSE_WORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
const ORD = n => n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");
// [name, swe body id, glyph, article slug]
const BODIES = [["Sun", 0, "☉", "sun"], ["Moon", 1, "☽", "moon"], ["Mercury", 2, "☿", "mercury"], ["Venus", 3, "♀", "venus"],
  ["Mars", 4, "♂", "mars"], ["Jupiter", 5, "♃", "jupiter"], ["Saturn", 6, "♄", "saturn"], ["Uranus", 7, "♅", "uranus"],
  ["Neptune", 8, "♆", "neptune"], ["Pluto", 9, "♇", "pluto"], ["North Node", 10, "☊", "north-node"]];
const PHASES = ["New Moon", "Crescent", "First Quarter", "Gibbous", "Full Moon", "Disseminating", "Last Quarter", "Balsamic"];
const VAULT = "https://www.gamlahealing.com/blogs/astro-vault/";
const SWIEPH = 2, SPEED = 256;

let M, swe, degreeMap = {}, vault = new Set(), cities = null;
let place = { lat: 51.4779, lon: 0, tz: "Europe/London", label: "Greenwich, United Kingdom" };
let jd = 0, MIN_JD = 0, MAX_JD = 0, LMT_BEFORE = 0, sky = null, selected = null;

// ---------- Swiss Ephemeris calls (direct, so we see the return flag and warning)
function julday(y, m, d, h, greg) { return M.ccall("swe_julday", "number", ["number", "number", "number", "number", "number"], [y, m, d, h, greg ? 1 : 0]); }
function calc(j, body, flags) {
  const r = M._malloc(48), e = M._malloc(256); M.HEAPF64[e >> 3] = 0;
  const ret = M.ccall("swe_calc_ut", "number", ["number", "number", "number", "number", "number"], [j, body, flags, r, e]);
  const o = { ret, lon: M.HEAPF64[r >> 3], speed: M.HEAPF64[(r >> 3) + 3], err: M.UTF8ToString(e) };
  M._free(r); M._free(e); return o;
}
// ---------- ephemeris files, one 600-year block at a time
const loaded = new Map();
function loadBlock(suffix) {
  if (!loaded.has(suffix)) {
    loaded.set(suffix, Promise.all(["sepl", "semo"].map(async p => {
      const res = await fetch(asset(`./ephe/${p}${suffix}.wasm`));
      if (!res.ok) throw new Error(`${p}${suffix} not available`);
      M.FS.writeFile(`sweph/${p}${suffix}.se1`, new Uint8Array(await res.arrayBuffer()));
    })).catch(e => { loaded.delete(suffix); throw e; }));
  }
  return loaded.get(suffix);
}
const missingFile = err => { const m = /se(?:pl|mo)(_\d\d|m\d\d)\.se1' not found/.exec(err); return m ? m[1] : null; };

// ---------- the sky at one instant. Returns {need: suffix} if a data block is missing.
function skyAt(j) {
  const pts = [];
  for (const [name, id, glyph, slug] of BODIES) {
    const r = calc(j, id, SWIEPH | SPEED);
    const need = missingFile(r.err);
    if (need && (r.ret < 0 || !(r.ret & SWIEPH))) return { need };
    if (r.ret < 0) throw new Error(r.err);
    pts.push({ name, glyph, slug, lon: r.lon, retro: id !== 10 && r.speed < 0 });
  }
  const nn = pts[pts.length - 1];
  pts.push({ name: "South Node", glyph: "☋", slug: null, lon: (nn.lon + 180) % 360, retro: false });
  const obl = calc(j, -1, 0).lon;
  let sys = "P", polar = Math.abs(place.lat) >= 90 - obl;
  if (polar) sys = "W";
  const h = swe.houses(j, place.lat, place.lon, sys);
  const cusps = Array.from(h.cusps).slice(1, 13), asc = h.ascmc[0], mc = h.ascmc[1];
  const houseOf = l => { for (let i = 0; i < 12; i++) { const a = cusps[i], b = cusps[(i + 1) % 12]; if (a <= b ? (a <= l && l < b) : (l >= a || l < b)) return i + 1; } return null; };
  pts.forEach(p => { p.house = houseOf(p.lon); });
  pts.push({ name: "Ascendant", glyph: "AC", slug: "ascendant", lon: asc, angle: true });
  pts.push({ name: "Midheaven", glyph: "MC", slug: null, lon: mc, angle: true });
  return { pts, cusps, asc, mc, polar };
}

// ---------- local time
const fmtCache = new Map();
function tzOffsetMs(ms, tz) {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }); fmtCache.set(tz, f); }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
const usesZone = j => j >= LMT_BEFORE;
function offsetMs(j) {
  if (!usesZone(j)) return place.lon * 240000; // local mean time: 4 minutes per degree
  try { return tzOffsetMs((j - 2440587.5) * 86400000, place.tz); } catch { return place.lon * 240000; }
}
function localFields(j) {
  const lj = j + offsetMs(j) / 86400000;
  const r = swe.revjul(lj, lj >= 2299160.5 ? 1 : 0);
  return { y: r.year, m: r.month, d: r.day, h: r.hour };
}
const isGreg = (y, m, d) => y > 1582 || (y === 1582 && (m > 10 || (m === 10 && d >= 15)));
function fromLocal(y, m, d, h) {
  const lj = julday(y, m, d, h, isGreg(y, m, d));
  let j = lj - offsetMs(lj) / 86400000;
  j = lj - offsetMs(j) / 86400000;
  return j;
}
const daysIn = (y, m) => { const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; return Math.round(julday(ny, nm, 1, 0, isGreg(ny, nm, 1)) - julday(y, m, 1, 0, isGreg(y, m, 1))); };
const yearText = y => y <= 0 ? `${1 - y} BC` : y < 1000 ? `${y} AD` : String(y);
const two = n => String(n).padStart(2, "0");
const clamp = j => Math.min(MAX_JD, Math.max(MIN_JD, j));
function offText(ms) { const s = ms < 0 ? "-" : "+", t = Math.round(Math.abs(ms) / 60000); return `UTC${s}${two(Math.floor(t / 60))}:${two(t % 60)}`; }

// ---------- formatting
function fmtPos(l) { const s = Math.floor(l / 30), x = l - 30 * s, d = Math.floor(x + 1e-9), m = Math.min(59, Math.floor((x - d) * 60 + 1e-9)); return { s, d, m, text: `${d}°${two(m)}' ${SIGNS[s]}` }; }
function sabian(l) { const s = Math.floor(l / 30), deg = Math.min(Math.floor(l - 30 * s) + 1, 30); return { key: `${SIGNS[s]} ${deg}`, row: degreeMap[`${SIGNS[s]} ${deg}`] }; }
const houseIn = (cusps, l) => { for (let i = 0; i < 12; i++) { const a = cusps[i], b = cusps[(i + 1) % 12]; if (a <= b ? (a <= l && l < b) : (l >= a || l < b)) return i + 1; } return null; };
const vlink = (h, label) => vault.has(h) ? `<a href="${VAULT}${h}" target="_blank" rel="noopener">${esc(label)}</a>` : "";

// ---------- wheel
const NS = "http://www.w3.org/2000/svg", C = 300, R_OUT = 282, R_Z = 240, R_P = 205, R_IN = 146, R_N = 124;
// The wheel is fixed: 0° Aries on the left, signs counter-clockwise. Only the planets,
// the Ascendant and the Midheaven move. House lines show when paused or at slow playback.
function drawWheel(s) {
  const svg = $("wheel"), A = l => (180 + l) * Math.PI / 180;
  const pt = (l, r) => [C + r * Math.cos(A(l)), C - r * Math.sin(A(l))];
  const f = n => n.toFixed(1);
  const arc = (l1, l2, r1, r2) => { const [a, b] = pt(l1, r2), [c, d] = pt(l2, r2), [e, g] = pt(l2, r1), [h, i] = pt(l1, r1); return `M${f(a)} ${f(b)}A${r2} ${r2} 0 0 0 ${f(c)} ${f(d)}L${f(e)} ${f(g)}A${r1} ${r1} 0 0 1 ${f(h)} ${f(i)}Z`; };
  let o = `<circle cx="${C}" cy="${C}" r="${R_OUT}" fill="var(--w-bg)" stroke="var(--w-line)" stroke-width="1.5"/>`;
  for (let i = 0; i < 12; i++) {
    const col = `var(--${ELEM[i % 4]})`, [tx, ty] = pt(i * 30 + 15, (R_Z + R_OUT) / 2);
    o += `<path d="${arc(i * 30, i * 30 + 30, R_Z, R_OUT)}" fill="${col}" fill-opacity="var(--w-band)" stroke="var(--w-line)"/>`;
    o += `<text x="${f(tx)}" y="${f(ty)}" text-anchor="middle" dominant-baseline="central" font-size="24" fill="${col}" class="gs-sym"><title>${SIGNS[i]}</title>${SG[i]}</text>`;
  }
  for (let d = 0; d < 360; d += 5) { const [a, b] = pt(d, R_Z), [c, e] = pt(d, R_Z - (d % 10 ? 5 : 9)); o += `<line x1="${f(a)}" y1="${f(b)}" x2="${f(c)}" y2="${f(e)}" stroke="var(--w-tick)"/>`; }
  o += `<circle cx="${C}" cy="${C}" r="${R_IN}" fill="var(--w-inner)" stroke="var(--w-line)"/>`;
  const NAT = natal && showNatal ? natal : null;
  const cusps = NAT ? NAT.cusps : (s.showHouses ? s.cusps : null);
  if (cusps) cusps.forEach((l, i) => {
    if (i % 3 === 0) return; // angles are drawn below
    const [a, b] = pt(l, R_IN), [c, e] = pt(l, R_Z);
    o += `<line x1="${f(a)}" y1="${f(b)}" x2="${f(c)}" y2="${f(e)}" stroke="var(--w-house)" stroke-width="1"/>`;
  });
  if (cusps) cusps.forEach((l, i) => {
    let nx = cusps[(i + 1) % 12]; if (nx < l) nx += 360;
    const [hx, hy] = pt((l + nx) / 2, NAT ? R_IN + 11 : R_IN - 13);
    o += `<text x="${f(hx)}" y="${f(hy)}" text-anchor="middle" dominant-baseline="central" font-size="12" fill="var(--w-num)" font-weight="700">${i + 1}</text>`;
  });
  // Ascendant / Descendant and Midheaven / IC axes, with the AC and MC as moving points on the rim
  const axes = NAT ? (NAT.cusps ? [[NAT.asc, "AC", "Your Ascendant"], [NAT.mc, "MC", "Your Midheaven"]] : []) : [[s.asc, "AC", "Ascendant"], [s.mc, "MC", "Midheaven"]];
  axes.forEach(([l, t, name]) => {
    const [a, b] = pt(l, R_IN), [c, e] = pt(l, R_OUT), [a2, b2] = pt(l + 180, R_IN), [c2, e2] = pt(l + 180, R_Z);
    o += `<line x1="${f(a)}" y1="${f(b)}" x2="${f(c)}" y2="${f(e)}" stroke="var(--gold)" stroke-width="2"/>`;
    o += `<line x1="${f(a2)}" y1="${f(b2)}" x2="${f(c2)}" y2="${f(e2)}" stroke="var(--gold)" stroke-width="1.2" stroke-dasharray="3 4"/>`;
    const [x, y] = pt(l, R_OUT);
    o += `<g><title>${name} ${fmtPos(l).text}</title><circle cx="${f(x)}" cy="${f(y)}" r="14" fill="var(--gold)"/><text x="${f(x)}" y="${f(y)}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="700" fill="var(--on-gold)">${t}</text></g>`;
  });
  // major aspects between planets (conjunctions not drawn)
  const pl = s.pts.filter(p => !p.angle && p.name !== "South Node");
  if (NAT) {
    // the sky touching the birth chart: today's planets (not the Moon) to birth points, within 3°
    const R_A = R_N - 18, natPts = NAT.pts.filter(q => q.name !== "South Node");
    o += `<circle cx="${C}" cy="${C}" r="${R_A}" fill="none" stroke="var(--w-line)" stroke-dasharray="2 3"/>`;
    for (const p of pl) {
      if (p.name === "Moon" || p.name === "North Node") continue;
      for (const q of natPts) {
        const d = Math.abs(((p.lon - q.lon + 540) % 360) - 180);
        for (const [ang, hard] of [[0, 1], [180, 1], [90, 1], [120, 0], [60, 0]]) {
          if (Math.abs(d - ang) > 3) continue;
          const on = !selected || selected === p.name;
          const [a, b] = pt(p.lon, R_A), [c, e] = pt(q.lon, R_A);
          o += ang === 0 ? `<circle cx="${f(c)}" cy="${f(e)}" r="5" fill="none" stroke="var(--hard)" stroke-width="2" opacity="${on ? .9 : .15}"><title>${p.name} conjunct your ${q.name}</title></circle>`
            : `<line x1="${f(a)}" y1="${f(b)}" x2="${f(c)}" y2="${f(e)}" stroke="var(--${hard ? "hard" : "soft"})" stroke-width="${selected && on ? 2.2 : 1.4}" opacity="${on ? .85 : .12}" stroke-linecap="round"/>`;
        }
      }
    }
    // the birth planets, on their own ring inside the wheel
    const na = NAT.pts.map(q => ({ q, disp: q.lon })).sort((a, b) => a.disp - b.disp);
    for (let it = 0; it < 100; it++) { let mv = false; for (let i = 0; i < na.length; i++) { const a = na[i], b = na[(i + 1) % na.length]; let d = b.disp - a.disp; if (i === na.length - 1) d += 360; if (d < 11) { const push = (11 - d) / 2; a.disp -= push; b.disp += push; mv = true; } } if (!mv) break; }
    na.forEach(({ q, disp }) => {
      const [x1, y1] = pt(q.lon, R_IN), [x2, y2] = pt(q.lon, R_IN - 7), [gx, gy] = pt(disp, R_N);
      o += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="var(--gold)" stroke-width="1.6"/>`;
      o += `<g><title>Your ${q.name} ${fmtPos(q.lon).text}</title><circle cx="${f(gx)}" cy="${f(gy)}" r="12" fill="var(--natal-bg)" stroke="var(--gold)"/><text x="${f(gx)}" y="${f(gy)}" text-anchor="middle" dominant-baseline="central" font-size="14" fill="var(--natal-ink)" class="gs-sym">${q.glyph}\uFE0E</text></g>`;
    });
  } else
  for (let i = 0; i < pl.length; i++) for (let k = i + 1; k < pl.length; k++) {
    if (pl[i].name === "North Node" || pl[k].name === "North Node") continue;
    const d = Math.abs(((pl[i].lon - pl[k].lon + 540) % 360) - 180);
    for (const [ang, orb, hard] of [[180, 8, 1], [90, 8, 1], [120, 8, 0], [60, 6, 0]]) {
      if (Math.abs(d - ang) <= orb) {
        const on = !selected || selected === pl[i].name || selected === pl[k].name;
        const [a, b] = pt(pl[i].lon, R_IN - 3), [c, e] = pt(pl[k].lon, R_IN - 3);
        o += `<line x1="${f(a)}" y1="${f(b)}" x2="${f(c)}" y2="${f(e)}" stroke="var(--${hard ? "hard" : "soft"})" stroke-width="${selected && on ? 2.2 : 1.3}" opacity="${on ? .8 : .12}" stroke-linecap="round"/>`;
      }
    }
  }
  // planets, spread so glyphs never overlap
  const arr = s.pts.filter(p => !p.angle).map(p => ({ p, disp: p.lon })).sort((a, b) => a.disp - b.disp);
  for (let it = 0; it < 100; it++) { let mv = false; for (let i = 0; i < arr.length; i++) { const a = arr[i], b = arr[(i + 1) % arr.length]; let d = b.disp - a.disp; if (i === arr.length - 1) d += 360; if (d < 9) { const push = (9 - d) / 2; a.disp -= push; b.disp += push; mv = true; } } if (!mv) break; }
  arr.forEach(({ p, disp }) => {
    const [x1, y1] = pt(p.lon, R_Z), [x2, y2] = pt(p.lon, R_Z - 12), [gx, gy] = pt(disp, R_P), [dx, dy] = pt(disp, R_P - 30);
    const on = selected === p.name, pos = fmtPos(p.lon);
    o += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="var(--w-ink)" stroke-width="1.6"/>`;
    o += `<g class="pt" tabindex="0" role="button" data-n="${p.name}" aria-label="${p.name} ${pos.text}"><circle cx="${f(gx)}" cy="${f(gy)}" r="16" fill="${on ? "var(--disc-on)" : "var(--disc)"}" stroke="${on ? "var(--w-ink)" : "var(--disc-line)"}"/>`;
    o += `<text x="${f(gx)}" y="${f(gy)}" text-anchor="middle" dominant-baseline="central" font-size="19" fill="${on ? "var(--disc-on-ink)" : "var(--disc-ink)"}" class="gs-sym">${p.glyph}︎</text></g>`;
    o += `<text x="${f(dx)}" y="${f(dy)}" text-anchor="middle" dominant-baseline="central" font-size="12" fill="var(--w-deg)">${pos.d}°${p.retro ? "r" : ""}</text>`;
  });
  svg.innerHTML = o;
}

// ---------- ledger
function drawLedger(s) {
  const NAT = natal && showNatal ? natal : null;
  const th = document.querySelector(".gs #gs-ledger thead th:nth-child(3)"); if (th) th.textContent = NAT ? "Your house" : "House";
  const rows = s.pts.map(p => {
    const pos = fmtPos(p.lon), sb = sabian(p.lon), r = sb.row || {};
    const house = p.angle ? null : NAT ? (NAT.cusps ? houseIn(NAT.cusps, p.lon) : null) : p.house;
    const more = [];
    if (p.slug) more.push(vlink(`${p.slug}-in-${SIGNS[pos.s].toLowerCase()}-meaning`, `${p.name} in ${SIGNS[pos.s]}`));
    if (p.slug && house) more.push(vlink(`${p.slug}-in-${HOUSE_WORD[house - 1]}-house-meaning`, `${p.name} in ${NAT ? "your" : "the"} ${ORD(house)} house`));
    const sym = r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(sb.key)}°: ${esc(r.symbol)}</a><br><span class="kw">${esc(r.keyword || "")}</span>` : esc(sb.key + "°");
    return `<tr class="${selected === p.name ? "hl" : ""}"><td><span class="g gs-sym">${p.angle ? "" : p.glyph + "︎"}</span>${esc(p.name)}</td><td class="pos">${pos.text}${p.retro ? " ℞" : ""}</td><td>${house ? ORD(house) : ""}</td><td>${sym}</td><td class="more">${more.filter(Boolean).join("")}</td></tr>`;
  });
  $("ledger").tBodies[0].innerHTML = rows.join("");
}

// ---------- moon phase, header, warnings
function drawMoon(s) {
  const sun = s.pts[0].lon, moon = s.pts[1].lon, el = (moon - sun + 360) % 360;
  const lit = Math.round((1 - Math.cos(el * Math.PI / 180)) / 2 * 100), ph = PHASES[Math.floor(el / 45) % 8];
  const k = Math.cos(el * Math.PI / 180), rx = Math.abs(k) * 22, waxing = el < 180;
  // lit part: half disc on the lit side plus an ellipse that grows or bites
  const d = `M30 8A22 22 0 0 ${waxing ? 1 : 0} 30 52A${rx.toFixed(1)} 22 0 0 ${(waxing ? k > 0 : k < 0) ? 0 : 1} 30 8Z`;
  $("moon").innerHTML = `<svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="22" fill="var(--moon-dark)" stroke="var(--w-line)"/><path d="${d}" fill="var(--moon-lit)"/></svg>
   <p><span class="lbl">${ph}</span><br>${lit}% lit, ${Math.round(el)}° from the Sun. ${vlink("moon-phases-meaning", "The phases of the Moon")}</p>`;
}
function drawHeader() {
  const f = localFields(jd), hh = Math.floor(f.h + 1e-9), mm = Math.floor((f.h - hh) * 60 + 1e-6);
  const isNow = Math.abs(jd - nowJD()) < 1 / 1440 * 2;
  $("title").textContent = isNow ? "The sky right now" : `The sky on ${f.d} ${MONTHS[f.m - 1]} ${yearText(f.y)}`;
  const zone = usesZone(jd) ? `${place.tz.replace(/_/g, " ")}, ${offText(offsetMs(jd))}` : "local mean time";
  $("when").textContent = `${two(hh)}:${two(mm)} ${zone}, seen from ${place.label}${jd < 2299160.5 ? ". Julian calendar." : "."}`;
  // controls mirror the state unless the visitor is typing in them
  const act = document.activeElement;
  if (act !== $("d")) $("d").value = f.d;
  if (act !== $("m")) $("m").value = f.m;
  if (act !== $("y")) $("y").value = f.y <= 0 ? 1 - f.y : f.y;
  if (act !== $("era")) $("era").value = f.y <= 0 ? "BC" : "AD";
  if (act !== $("time")) $("time").value = `${two(hh)}:${two(mm)}`;
  if (act !== $("yr")) $("yr").value = f.y;
  $("zone").textContent = usesZone(jd) ? place.tz.replace(/_/g, " ") : "Local mean time";
  const y = f.y, w = [];
  if (sky && sky.polar) w.push(`Placidus houses do not exist at latitude ${Math.abs(place.lat).toFixed(1)}°, so this chart uses Whole Sign houses.`);
  if (y < -500) w.push("This far back the exact clock time is uncertain. Read the planets with confidence; treat the Moon's exact degree, the Ascendant and the houses as approximate.");
  else if (y < 1600) w.push("Before about 1600 the clock time is reconstructed. Planets are reliable; the Ascendant and houses may shift slightly.");
  $("warn").hidden = !w.length; $("warn").textContent = w.join(" ");
}
const nowJD = () => Date.now() / 86400000 + 2440587.5;

// ---------- update cycle
let pending = null;
async function setJD(j, opts = {}) {
  jd = clamp(j);
  let s;
  try { s = skyAt(jd); } catch (e) { $("loading").hidden = false; $("loading").textContent = "This moment could not be calculated."; return false; }
  if (s.need) {
    const want = jd;
    $("loading").hidden = false; $("loading").textContent = "Loading the sky for this era…";
    try { await loadBlock(s.need); } catch { $("loading").textContent = "The data for this era could not load. Check your connection and try again."; return false; }
    if (want !== jd) return true; // a newer request took over
    s = skyAt(jd);
    if (s.need) return false;
  }
  $("loading").hidden = true;
  s.showHouses = !(playing && parseFloat($("speed").value) > 0.05);
  sky = s; drawWheel(s); drawHeader(); drawMoon(s);
  if (!opts.light || !playing || performance.now() - lastLedger > 250) { drawLedger(s); lastLedger = performance.now(); }
  return true;
}
let lastLedger = 0;
const redraw = () => { if (sky) { drawWheel(sky); drawLedger(sky); } };

// ---------- playback
let playing = false, dirSign = 1, last = 0, busy = false;
function frame(t) {
  if (!playing) return;
  const dt = Math.min(0.1, (t - last) / 1000); last = t;
  if (!busy) {
    const nj = jd + dirSign * dt * parseFloat($("speed").value);
    if (nj <= MIN_JD || nj >= MAX_JD) { stop(); setJD(nj); return; }
    busy = true; setJD(nj, { light: true }).finally(() => { busy = false; });
  }
  requestAnimationFrame(frame);
}
function stop() { playing = false; $("play").textContent = "Play"; $("play").setAttribute("aria-pressed", "false"); if (sky) { sky.showHouses = true; drawWheel(sky); drawLedger(sky); } }
$("play").addEventListener("click", () => { if (playing) return stop(); playing = true; $("play").textContent = "Pause"; $("play").setAttribute("aria-pressed", "true"); last = performance.now(); requestAnimationFrame(frame); });
$("dir").addEventListener("click", () => { dirSign = -dirSign; $("dir").textContent = dirSign > 0 ? "Forward" : "Backward"; $("dir").setAttribute("aria-label", `Play direction: ${dirSign > 0 ? "forward" : "backward"}`); });
$("now").addEventListener("click", () => { stop(); setJD(nowJD()); });
// iPhone fix: while the chart plays, the wheel is redrawn many times a second. Safari on iOS then reads each tap
// as a "hover" on changing content and swallows the click, so Pause and the other buttons seem dead.
// During playback, a clean tap on a button is turned into the click directly.
{
  let tx = 0, ty = 0, tbtn = null;
  const root = document.querySelector(".gs");
  root.addEventListener("touchstart", e => {
    const t = e.touches[0]; tbtn = playing && e.touches.length === 1 ? e.target.closest("button") : null;
    if (tbtn) { tx = t.clientX; ty = t.clientY; }
  }, { passive: true });
  root.addEventListener("touchend", e => {
    const b = tbtn; tbtn = null;
    if (!b || !playing || b.disabled) return;
    const t = e.changedTouches[0];
    if (Math.abs(t.clientX - tx) > 10 || Math.abs(t.clientY - ty) > 10) return; // a scroll, not a tap
    if (document.elementFromPoint(t.clientX, t.clientY)?.closest("button") !== b) return;
    e.preventDefault(); // no second, native click
    b.click();
  }, { passive: false });
}

// ---------- steps
function shift(unit, n) {
  if (unit === "hour") return setJD(jd + n / 24);
  if (unit === "day") return setJD(jd + n);
  const f = localFields(jd);
  let y = f.y, m = f.m;
  if (unit === "month") { m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } }
  if (unit === "year") y += n;
  if (unit === "century") y += 100 * n;
  return setJD(fromLocal(y, m, Math.min(f.d, daysIn(y, m)), f.h));
}
$("steps").innerHTML = [["hour", "Hour"], ["day", "Day"], ["month", "Month"], ["year", "Year"], ["century", "Century"]]
  .map(([u, l]) => `<div class="u"><span>${l}</span><button data-u="${u}" data-n="-1" aria-label="Back one ${u}">− 1</button><button data-u="${u}" data-n="1" aria-label="Forward one ${u}">+ 1</button></div>`).join("");
$("steps").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { stop(); shift(b.dataset.u, +b.dataset.n); } });

// ---------- date entry
$("m").innerHTML = MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join("");
function fromInputs() {
  let yy = parseInt($("y").value, 10), d = parseInt($("d").value, 10), m = +$("m").value;
  if (!yy || !d) return;
  const y = $("era").value === "BC" ? 1 - yy : yy;
  const [hh, mi] = ($("time").value || "12:00").split(":").map(Number);
  stop(); setJD(fromLocal(y, m, Math.min(Math.max(d, 1), daysIn(y, m)), hh + mi / 60));
}
["d", "m", "y", "era", "time"].forEach(id => $(id).addEventListener("change", fromInputs));
$("yr").addEventListener("input", () => { const f = localFields(jd), y = +$("yr").value; stop(); setJD(fromLocal(y, f.m, Math.min(f.d, daysIn(y, f.m)), f.h)); });

// ---------- day / night (the visitor's choice is remembered on their device)
const root = document.querySelector(".gs");
function setMode(m) {
  root.dataset.mode = m;
  const b = $("mode");
  if (b) { b.textContent = m === "night" ? "Day sky" : "Night sky"; b.setAttribute("aria-label", m === "night" ? "Switch to the day version" : "Switch to the night version"); }
}
let saved = null; try { saved = localStorage.getItem("gamla-sky-mode"); } catch { }
setMode(saved === "day" || saved === "night" ? saved : (root.dataset.default === "night" ? "night" : "day"));
if ($("mode")) $("mode").addEventListener("click", () => { const m = root.dataset.mode === "night" ? "day" : "night"; setMode(m); try { localStorage.setItem("gamla-sky-mode", m); } catch { } });

// ---------- wheel selection
function pick(n) { selected = selected === n ? null : n; redraw(); }
$("wheel").addEventListener("click", e => { const g = e.target.closest(".pt"); pick(g ? g.dataset.n : null); });
$("wheel").addEventListener("keydown", e => { const g = e.target.closest(".pt"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(g.dataset.n); } });

// ---------- place search (same city list and matching as the Sabian calculator)
const EXTRA = { "ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i" };
const fold = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[øæœßłđðþı]/g, c => EXTRA[c]);
const region = (() => { try { const d = new Intl.DisplayNames(["en"], { type: "region" }); return cc => d.of(cc) || cc; } catch { return cc => cc; } })();
const labelOf = c => [c.name, c.st, region(c.cc)].filter(Boolean).join(", ");
let matches = [], active = -1;
function search(q) {
  const k = fold(q.trim()); if (k.length < 2 || !cities) return [];
  const first = k.split(",")[0].trim(), pre = [], inner = [];
  for (const c of cities) { if (c.key.startsWith(first)) { pre.push(c); if (pre.length >= 8) break; } else if (inner.length < 8 && c.key.includes(first)) inner.push(c); }
  return pre.concat(inner).slice(0, 8);
}
function showSug() {
  $("sug").innerHTML = matches.map((c, i) => `<li role="option" aria-selected="${i === active}" data-i="${i}"><span>${esc(labelOf(c))}</span><small>${esc(c.tz)}</small></li>`).join("");
  $("sug").hidden = !matches.length; $("place").setAttribute("aria-expanded", String(!!matches.length));
}
function placeMeta() { $("placemeta").textContent = `${Math.abs(place.lat).toFixed(2)}° ${place.lat >= 0 ? "N" : "S"}, ${Math.abs(place.lon).toFixed(2)}° ${place.lon >= 0 ? "E" : "W"}. The place sets the houses, the Ascendant and the local time; the planets are the same everywhere.`; }
function choose(c) {
  const f = localFields(jd);
  place = { lat: c.lat, lon: c.lon, tz: c.tz, label: labelOf(c) };
  $("place").value = place.label; matches = []; active = -1; showSug(); placeMeta();
  setJD(fromLocal(f.y, f.m, f.d, f.h)); // keep the same local clock time in the new place
  renderEvents(); // event times follow the chosen place's clock
  renderToday();
}
$("place").addEventListener("input", async () => { await citiesReady; matches = search($("place").value); active = matches.length ? 0 : -1; showSug(); });
$("place").addEventListener("keydown", e => {
  if ($("sug").hidden) return;
  if (e.key === "ArrowDown") { active = (active + 1) % matches.length; showSug(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { active = (active - 1 + matches.length) % matches.length; showSug(); e.preventDefault(); }
  else if (e.key === "Enter" && active >= 0) { choose(matches[active]); e.preventDefault(); }
  else if (e.key === "Escape") { matches = []; showSug(); }
});
$("sug").addEventListener("mousedown", e => { const li = e.target.closest("li"); if (li) { e.preventDefault(); choose(matches[+li.dataset.i]); } });
$("place").addEventListener("blur", () => setTimeout(() => { matches = []; showSug(); }, 120));


// ---------- your chart: a birth chart kept only in this browser
const NATAL_KEY = "gamla-sky-natal";
let natal = null, natalInput = null, showNatal = true, pEvents = [];
function birthJD(inp) {
  const [y, mo, d] = inp.d.split("-").map(Number);
  const [hh, mi] = inp.t ? inp.t.split(":").map(Number) : [12, 0];
  const lj = julday(y, mo, d, hh + mi / 60, isGreg(y, mo, d));
  const off = j => { try { return tzOffsetMs((j - 2440587.5) * 86400000, inp.tz); } catch { return inp.lo * 240000; } };
  let j = lj - off(lj) / 86400000; j = lj - off(j) / 86400000; return j;
}
async function computeNatal(inp) {
  const j = birthJD(inp);
  let s = null;
  for (let tries = 0; tries < 3; tries++) {
    const pts = []; let need = null;
    for (const [name, id, glyph, slug] of BODIES) {
      const r = calc(j, id, SWIEPH | SPEED), n = missingFile(r.err);
      if (n && (r.ret < 0 || !(r.ret & SWIEPH))) { need = n; break; }
      pts.push({ name, glyph, slug, lon: r.lon });
    }
    if (need) { await loadBlock(need); continue; }
    pts.push({ name: "South Node", glyph: "☋", lon: (pts[pts.length - 1].lon + 180) % 360 });
    s = { pts, cusps: null, asc: null, mc: null };
    break;
  }
  if (!s) throw new Error("ephemeris");
  if (inp.t) {
    const obl = calc(j, -1, 0).lon, polar = Math.abs(inp.la) >= 90 - obl;
    const h = swe.houses(j, inp.la, inp.lo, polar ? "W" : "P");
    s.cusps = Array.from(h.cusps).slice(1, 13); s.asc = h.ascmc[0]; s.mc = h.ascmc[1];
  }
  return s;
}
const natalName = () => natalInput && natalInput.n ? `${natalInput.n}'s chart` : "Your chart";
async function setNatal(inp, save) {
  if (!inp) { natal = natalInput = null; pEvents = []; try { localStorage.removeItem(NATAL_KEY); } catch { } renderNatalCard(); redraw(); renderEvents(); return; }
  natal = await computeNatal(inp); natalInput = inp; showNatal = true;
  if (save) { try { localStorage.setItem(NATAL_KEY, JSON.stringify(inp)); } catch { } }
  try { pEvents = personalEvents(swe, M, nowJD(), natal, 92); } catch { pEvents = []; }
  renderNatalCard(); redraw(); renderEvents();
}
function renderNatalCard() {
  const card = $("natal"); if (!card) return;
  if (natal && natalInput) {
    const [y, mo, d] = natalInput.d.split("-").map(Number);
    card.innerHTML = `<h2>${esc(natalName())}</h2>
      <p class="gs-nat-sum">Born ${d} ${MONTHS[mo - 1]} ${y}${natalInput.t ? ` at ${esc(natalInput.t)}` : ", time unknown"}, ${esc(natalInput.p || "")}</p>
      ${natalInput.t ? "" : `<p class="gs-meta">Without a birth time, the houses and your Ascendant are left out, and your Moon may be up to 7° from its true position.</p>`}
      <div class="gs-row gs-nat-actions">
        <button type="button" id="gs-nat-toggle" aria-pressed="${showNatal}">${showNatal ? "Hide from the wheel" : "Show on the wheel"}</button>
        <button type="button" id="gs-nat-edit">Edit</button>
        <button type="button" id="gs-nat-remove">Remove</button>
      </div>
      <p class="gs-meta">Saved only in this browser. Nothing is sent to Gamla Healing or anyone else.</p>`;
    $("nat-toggle").onclick = () => { showNatal = !showNatal; renderNatalCard(); redraw(); renderEvents(); };
    $("nat-edit").onclick = () => renderNatalForm(natalInput);
    $("nat-remove").onclick = () => setNatal(null);
  } else {
    card.innerHTML = `<h2>Your chart in this sky</h2>
      <p class="gs-nat-sum">Add your birth details to see your birth chart inside the moving sky, the houses today's planets are crossing for you, and your personal transits in the coming months.</p>
      <button type="button" class="gs-primary" id="gs-nat-add">Add my birth chart</button>
      <p class="gs-meta">Your details stay in this browser only.</p>`;
    $("nat-add").onclick = () => renderNatalForm(null);
  }
}
function renderNatalForm(prev) {
  const card = $("natal"), v = prev || {};
  let bplace = prev ? { lat: v.la, lon: v.lo, tz: v.tz, label: v.p } : null;
  card.innerHTML = `<h2>Your birth details</h2>
    <form class="gs-nat-form" id="gs-nat-form" novalidate>
      <label>First name (optional)<input id="gs-nat-n" autocomplete="off" maxlength="40" value="${esc(v.n || "")}"></label>
      <div class="gs-nat-two">
        <label>Birth date<input id="gs-nat-d" type="date" min="1800-01-01" max="2399-12-31" required value="${esc(v.d || "")}"></label>
        <label>Birth time<input id="gs-nat-t" type="time" value="${esc(v.t || "")}"></label>
      </div>
      <label class="gs-nat-check"><input type="checkbox" id="gs-nat-not"${prev && !v.t ? " checked" : ""}> I don't know my birth time</label>
      <label>Birth place<span class="gs-place"><input id="gs-nat-p" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="gs-nat-sug" placeholder="Search a city" value="${esc(v.p || "")}"><ul class="gs-sug" id="gs-nat-sug" role="listbox" hidden></ul></span></label>
      <p class="gs-meta" id="gs-nat-msg">Saved only in this browser. Nothing is sent to Gamla Healing or anyone else.</p>
      <div class="gs-row"><button type="submit" class="gs-primary">Show my chart</button><button type="button" id="gs-nat-cancel">Cancel</button></div>
    </form>`;
  const inp = $("nat-p"), list = $("nat-sug"); let ms = [], act = -1;
  const show = () => { list.innerHTML = ms.map((c, i) => `<li role="option" aria-selected="${i === act}" data-i="${i}"><span>${esc(labelOf(c))}</span><small>${esc(c.tz)}</small></li>`).join(""); list.hidden = !ms.length; inp.setAttribute("aria-expanded", String(!!ms.length)); };
  const pick = c => { bplace = { lat: c.lat, lon: c.lon, tz: c.tz, label: labelOf(c) }; inp.value = bplace.label; ms = []; show(); };
  inp.addEventListener("input", async () => { bplace = null; await citiesReady; ms = search(inp.value); act = ms.length ? 0 : -1; show(); });
  inp.addEventListener("keydown", e => {
    if (list.hidden) return;
    if (e.key === "ArrowDown") { act = (act + 1) % ms.length; show(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { act = (act - 1 + ms.length) % ms.length; show(); e.preventDefault(); }
    else if (e.key === "Enter" && act >= 0) { pick(ms[act]); e.preventDefault(); }
    else if (e.key === "Escape") { ms = []; show(); }
  });
  list.addEventListener("mousedown", e => { const li = e.target.closest("li"); if (li) { e.preventDefault(); pick(ms[+li.dataset.i]); } });
  inp.addEventListener("blur", () => setTimeout(() => { ms = []; show(); }, 120));
  $("nat-not").addEventListener("change", e => { $("nat-t").disabled = e.target.checked; });
  $("nat-t").disabled = $("nat-not").checked;
  $("nat-cancel").onclick = () => renderNatalCard();
  $("nat-form").addEventListener("submit", async e => {
    e.preventDefault();
    const d = $("nat-d").value, t = $("nat-not").checked ? null : ($("nat-t").value || null), msg = $("nat-msg");
    if (!/^\d{4}-\d\d-\d\d$/.test(d)) { msg.textContent = "Please enter your birth date."; return; }
    if (!$("nat-not").checked && !t) { msg.textContent = "Please enter your birth time, or tick \"I don't know my birth time\"."; return; }
    if (!bplace) { msg.textContent = "Please choose your birth place from the list."; return; }
    msg.textContent = "Calculating…";
    try { await setNatal({ v: 1, n: $("nat-n").value.trim().slice(0, 40), d, t, la: bplace.lat, lo: bplace.lon, tz: bplace.tz, p: bplace.label }, true); }
    catch { msg.textContent = "Your chart could not be calculated. Please check the date and try again."; }
  });
}
function buildNatalCard() {
  const card = document.createElement("div"); card.className = "gs-card gs-natal"; card.id = "gs-natal";
  const seen = document.querySelector(".gs .gs-ctl .gs-card"); seen.parentNode.insertBefore(card, seen.nextSibling);
  renderNatalCard();
}
// A personal link from the Sabian calculator (#chart=...) is read the same way, on this device only.
function natalFromHash() {
  const m = location.hash.match(/chart=([A-Za-z0-9_-]+)/); if (!m) return null;
  try {
    const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")), ch => ch.charCodeAt(0))));
    if (c.v !== 1 || !/^\d{4}-\d\d-\d\d$/.test(c.d) || typeof c.la !== "number" || typeof c.lo !== "number" || !c.tz) return null;
    return { v: 1, n: "", d: c.d, t: c.t || null, la: c.la, lo: c.lo, tz: c.tz, p: c.p || "" };
  } catch { return null; }
}

// ---------- today's Sabian symbols (always today, whatever moment the wheel shows)
let today = null;
function computeToday() {
  const j = nowJD(), sun = calc(j, 0, SWIEPH | SPEED), moon = calc(j, 1, SWIEPH | SPEED);
  if (sun.ret < 0 || moon.ret < 0) return null;
  // the Moon's next whole degree and next sign, by bisection on its longitude
  const cross = target => {
    let a = j, b = j + 3;
    const f = t => ((calc(t, 1, SWIEPH).lon - target + 540) % 360) - 180;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (f(m) < 0) a = m; else b = m; }
    return (a + b) / 2;
  };
  const nextDeg = Math.floor(moon.lon) + 1, nextSign = (Math.floor(moon.lon / 30) + 1) * 30;
  return { sun: sun.lon, moon: moon.lon, moonNextDeg: cross(nextDeg % 360), moonNextSign: cross(nextSign % 360), nextSignIndex: (Math.floor(moon.lon / 30) + 1) % 12 };
}
function whenText(j) {
  const f = localFields(j), hh = Math.floor(f.h + 1e-9), mm = Math.floor((f.h - hh) * 60 + 1e-6), t = `${two(hh)}:${two(mm)}`;
  const n = localFields(nowJD());
  if (f.y === n.y && f.m === n.m && f.d === n.d) return `today at ${t}`;
  return `on ${f.d} ${MONTHS[f.m - 1]} at ${t}`;
}
function symbolBlock(label, glyph, lon, extra) {
  const pos = fmtPos(lon), sb = sabian(lon), r = sb.row || {};
  const art = r.url ? `<a class="gs-td-link" href="${esc(r.url)}" target="_blank" rel="noopener">Read the article: ${esc(r.title || sb.key)}</a>` : "";
  return `<div class="gs-td-item">
    <p class="gs-td-label"><span class="gs-sym">${glyph}︎</span> ${label} at ${pos.text}</p>
    <p class="gs-td-deg">${esc(sb.key)}°</p>
    <p class="gs-td-symbol">${esc(r.symbol || "")}</p>
    ${r.keyword ? `<p class="gs-td-kw">${esc(r.keyword)}</p>` : ""}
    ${art}${extra || ""}
  </div>`;
}
function renderToday() {
  const box = $("today"); if (!box || !today) return;
  const n = localFields(nowJD());
  const moonExtra = `<p class="gs-td-next">The Moon moves into its next Sabian degree ${whenText(today.moonNextDeg)}, and into ${SIGNS[today.nextSignIndex]} ${whenText(today.moonNextSign)}.</p>`;
  box.innerHTML = `<h2>Today's Sabian symbols</h2><p class="gs-td-date">${n.d} ${MONTHS[n.m - 1]} ${yearText(n.y)}, times for ${esc(place.label)}</p>
    <div class="gs-td-grid">${symbolBlock("The Sun", "☉", today.sun)}${symbolBlock("The Moon", "☽", today.moon, moonExtra)}</div>`;
}
function buildTodayCard() {
  const card = document.createElement("div"); card.className = "gs-card gs-today"; card.id = "gs-today";
  const grid = document.querySelector(".gs .gs-grid"); grid.parentNode.insertBefore(card, grid);
}

// ---------- coming up: the next three months of lunations, eclipses, sign changes and stations
let events = [], allEvents = [], evFilter = "all", evActive = null;
const GLYPH = Object.fromEntries(BODIES.map(([n, , g]) => [n, g]));
const EV_FILTERS = [["all", "All"], ["you", "For you"], ["moon", "Moons and eclipses"], ["ingress", "Sign changes"], ["station", "Retrogrades"]];
const evGroup = e => e.kind === "transit" || e.kind === "house" ? "you" : e.kind === "ingress" ? "ingress" : e.kind.startsWith("station") ? "station" : "moon";
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
function evText(e) {
  const pos = fmtPos(e.lon), sign = SIGNS[pos.s];
  const yourHouse = () => { const N = natal && showNatal && natal.cusps ? natal : null; const h = N ? houseIn(N.cusps, e.lon) : null; return h ? `, in your ${ORD(h)} house` : ""; };
  if (e.kind === "transit") return [`${e.body} ${e.aspect} your ${e.target}`, `${e.body} at ${pos.text}${e.retro ? ", retrograde" : ""}`];
  if (e.kind === "house") return [`${e.body} ${e.retro ? "moves back into" : "enters"} your ${ORD(e.house)} house`, `at ${pos.text}`];
  if (e.kind === "new") return [`New Moon in ${sign}`, pos.text + yourHouse()];
  if (e.kind === "full") return [`Full Moon in ${sign}`, pos.text + yourHouse()];
  if (e.kind === "solar-eclipse") return [`${cap(e.type)} solar eclipse in ${sign}`, pos.text + yourHouse()];
  if (e.kind === "lunar-eclipse") return [`${cap(e.type)} lunar eclipse in ${sign}`, pos.text + yourHouse()];
  if (e.kind === "new") return [`New Moon in ${sign}`, pos.text];
  if (e.kind === "full") return [`Full Moon in ${sign}`, pos.text];
  if (e.kind === "solar-eclipse") return [`${cap(e.type)} solar eclipse in ${sign}`, pos.text];
  if (e.kind === "lunar-eclipse") return [`${cap(e.type)} lunar eclipse in ${sign}`, pos.text];
  if (e.kind === "station-retro") return [`${e.body} turns retrograde`, `at ${pos.text}`];
  if (e.kind === "station-direct") return [`${e.body} turns direct`, `at ${pos.text}`];
  // sign changes; the mean Node always moves backwards, so "enters" for it too
  if (e.retro && e.body !== "North Node") return [`${e.body} moves back into ${SIGNS[e.sign]}`, "while retrograde"];
  return [`${e.body} enters ${SIGNS[e.sign]}`, ""];
}
function evIcon(e) {
  if (e.kind === "new") return `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="var(--moon-dark)" stroke="var(--w-line)"/></svg>`;
  if (e.kind === "full") return `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="var(--moon-lit)" stroke="var(--w-ink)" stroke-width=".8"/></svg>`;
  if (e.kind === "transit" || e.kind === "house") return `<span class="gs-sym gs-ev-you">${GLYPH[e.body] || ""}\uFE0E</span>`;
  if (e.kind.endsWith("eclipse")) return `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="var(--gold)"/><circle cx="${e.kind === "solar-eclipse" ? 12 : 13}" cy="9" r="6.2" fill="var(--card)"/></svg>`;
  return `<span class="gs-sym">${GLYPH[e.body] || ""}︎</span>`;
}
function renderEvents() {
  const box = $("ev-list"); if (!box || !events.length) return;
  let html = "", month = "";
  const mine = natal && showNatal;
  const youBtn = document.querySelector('.gs .gs-ev-filters button[data-f="you"]'); if (youBtn) youBtn.hidden = !mine;
  if (!mine && evFilter === "you") { evFilter = "all"; document.querySelectorAll(".gs .gs-ev-filters button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.f === "all"))); }
  allEvents = (mine ? events.concat(pEvents) : events.slice()).sort((a, b) => a.jd - b.jd);
  for (const [i, e] of allEvents.entries()) {
    if (evFilter !== "all" && evGroup(e) !== evFilter) continue;
    const f = localFields(e.jd), hh = Math.floor(f.h + 1e-9), mm = Math.floor((f.h - hh) * 60 + 1e-6);
    const mkey = `${MONTHS[f.m - 1]} ${yearText(f.y)}`;
    if (mkey !== month) { month = mkey; html += `<li class="gs-ev-month">${esc(mkey)}</li>`; }
    const [title, detail] = evText(e);
    let extra = "";
    if (e.kind === "house") {
      const slug = (BODIES.find(b => b[0] === e.body) || [])[3];
      if (slug && vault.has(`${slug}-in-${HOUSE_WORD[e.house - 1]}-house-meaning`)) extra = `<a class="gs-ev-sab" href="${VAULT}${slug}-in-${HOUSE_WORD[e.house - 1]}-house-meaning" target="_blank" rel="noopener">Read: ${esc(e.body)} in the ${ORD(e.house)} house</a>`;
    }
    if (e.kind === "new" || e.kind === "full" || e.kind.endsWith("eclipse")) {
      const sb = sabian(e.lon);
      if (sb.row && sb.row.url) extra = `<a class="gs-ev-sab" href="${esc(sb.row.url)}" target="_blank" rel="noopener">Sabian symbol ${esc(sb.key)}°: ${esc(sb.row.symbol)}</a>`;
      if (evActive === i) extra += lunationReading(e);
    }
    html += `<li class="gs-ev${evActive === i ? " on" : ""}"><button type="button" data-i="${i}"><span class="gs-ev-ic">${evIcon(e)}</span><span class="gs-ev-when">${f.d} ${MONTHS[f.m - 1].slice(0, 3)}<small>${two(hh)}:${two(mm)}</small></span><span class="gs-ev-what"><b>${esc(title)}</b>${detail ? `<small>${esc(detail)}</small>` : ""}</span></button>${extra}</li>`;
  }
  box.innerHTML = html || `<li class="gs-ev-empty">Nothing of this kind in the next three months.</li>`;
  $("ev-zone").textContent = `Times are local to ${place.label}${usesZone(nowJD()) ? ` (${offText(offsetMs(nowJD()))})` : ""}. Click an event to see the sky at that moment${natal && showNatal ? ", or a New Moon, Full Moon or eclipse to read what it means for you" : ""}.`;
}
// "What this New Moon / Full Moon means for you": the house of the lunation in the visitor's birth chart.
function lunationReading(e) {
  const isNew = e.kind === "new" || e.kind === "solar-eclipse";
  const what = e.kind.endsWith("eclipse") ? "this eclipse" : isNew ? "this New Moon" : "this Full Moon";
  let body;
  if (!(natal && showNatal)) body = `<p>Add your birth chart to see which area of your life ${what} touches, and what it means for you.</p><button type="button" class="gs-ev-addchart">Add my birth chart</button>`;
  else if (!natal.cusps) body = `<p>Your birth time is needed to know which house ${what} falls in. Edit your birth chart to add it.</p>`;
  else {
    const h = houseIn(natal.cusps, e.lon);
    const extra = e.kind === "solar-eclipse" ? SOLAR_ECLIPSE : e.kind === "lunar-eclipse" ? LUNAR_ECLIPSE : "";
    body = `<p>${(isNew ? NEW_MOON : FULL_MOON)[h - 1]}</p>${extra ? `<p>${extra}</p>` : ""}<p class="gs-ev-note">${HOUSE_NOTE}</p>`;
  }
  return `<div class="gs-ev-read"><h3>What ${what} means for you</h3>${body}</div>`;
}
function buildEventsCard() {
  // The card is created here so the theme section never needs editing for it.
  const left = document.createElement("div"); left.className = "gs-left";
  const wb = document.querySelector(".gs .gs-wheelbox"); wb.parentNode.insertBefore(left, wb); left.appendChild(wb);
  const card = document.createElement("div"); card.className = "gs-card gs-events";
  card.innerHTML = `<h2>Coming up in the next three months</h2>
    <div class="gs-ev-filters" role="group" aria-label="Show">${EV_FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === evFilter}">${l}</button>`).join("")}</div>
    <ul class="gs-ev-list" id="gs-ev-list"><li class="gs-ev-empty">Finding the coming events…</li></ul>
    <p class="gs-meta" id="gs-ev-zone"></p>`;
  left.appendChild(card);
  card.querySelector(".gs-ev-filters").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    evFilter = b.dataset.f; card.querySelectorAll(".gs-ev-filters button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); renderEvents();
  });
  $("ev-list").addEventListener("click", ev => {
    if (ev.target.closest(".gs-ev-addchart")) { renderNatalForm(null); const c = $("natal"); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const b = ev.target.closest("button[data-i]"); if (!b) return;
    evActive = +b.dataset.i; stop(); setJD(allEvents[evActive].jd); renderEvents();
    const top = document.querySelector(".gs .gs-sky"); if (top && top.getBoundingClientRect().top < -40) top.scrollIntoView({ behavior: "smooth" });
  });
}

// ---------- boot
let citiesReady;
(async () => {
  try {
    swe = new SwissEph(); await swe.initSwissEph(); M = swe.SweModule;
    MIN_JD = julday(-3999, 1, 1, 12, false); MAX_JD = julday(2999, 12, 31, 12, true); LMT_BEFORE = julday(1850, 1, 1, 0, true);
    const [dm, vl] = await Promise.all([fetch(asset("../dist/data/sabian_degree_map.json")).then(r => r.json()), fetch(asset("./data/vault.json")).then(r => r.json())]);
    degreeMap = dm; vault = new Set(vl);
    citiesReady = fetch(asset("../dist/data/cities.json")).then(r => r.json()).then(j => {
      cities = j.c.map(([name, cc, st, lat, lon, tzi]) => ({ name, cc, st: typeof st === "number" ? (j.r && j.r[st]) || "" : st, lat, lon, tz: j.tz[tzi], key: fold(name) }));
      // default place: the largest city in the visitor's own time zone
      let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { }
      const c = cities.find(x => x.tz === tz);
      if (c && !$("place").value) choose(c);
    });
    $("place").value = ""; placeMeta();
    buildEventsCard();
    buildNatalCard();
    await setJD(nowJD());
    { let saved = natalFromHash(), fromLink = !!saved; if (!saved) { try { saved = JSON.parse(localStorage.getItem(NATAL_KEY) || "null"); } catch { saved = null; } } if (saved && saved.d) { try { await setNatal(saved, fromLink); } catch { } } }
    setTimeout(() => { try { events = upcomingEvents(swe, M, nowJD(), 92); } catch (err) { events = []; } if (events.length) renderEvents(); else $("ev-list").innerHTML = `<li class="gs-ev-empty">The coming events could not be calculated.</li>`; }, 30);
  } catch (e) {
    $("when").textContent = `The ephemeris could not load (${e.message || e}). Reload the page to try again.`;
  }
})();
}
