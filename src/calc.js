// Gamla Healing Sabian calculator: page controller.
// Loaded as an ES module. Every other file is resolved relative to this file's own
// URL, so the same code runs from the jsDelivr CDN, a local server or the test page.
// SPDX-License-Identifier: AGPL-3.0-or-later

import SwissEph from "./lib/src/swisseph.js";
import { computeChart } from "./engine.js";

const $ = id => document.getElementById("gc-" + id);
const asset = p => new URL(p, import.meta.url).href;
const form = $("chart-form"), go = $("go"), status = $("status");
const regionName = (() => { try { const d = new Intl.DisplayNames(["en"], { type: "region" }); return cc => d.of(cc) || cc; } catch { return cc => cc; } })();
// Accent-insensitive matching. Some letters (ø, æ, ß, ł...) do not decompose, so map them by hand.
const EXTRA = { "ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ı": "i" };
const fold = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[øæœßłđðþı]/g, c => EXTRA[c]);

let swe = null, degreeMap = null, cities = null, soulBlocks = null;
// Selected place: {lat, lon, tz, label}
// The page opens on an example chart so visitors see what they get before typing.
// Oprah Winfrey: 29 Jan 1954, 04:30, Kosciusko MS. Astro-Databank Rodden rating A
// (time from her own account, not a birth certificate).
const EXAMPLE = { label: "Example chart: Oprah Winfrey, born 29 January 1954 at 04:30 in Kosciusko, Mississippi (birth time from her own account, Rodden rating A)." };
let showingExample = true;
let place = { lat: 33.058, lon: -89.5896, tz: "America/Chicago", label: "Kosciusko, MS, United States" };
let manualMode = false;

// ---------- boot: ephemeris, degree map and city list load in parallel
const boot = Promise.all([
  (async () => { const s = new SwissEph(); await s.initSwissEph(); swe = s; })(),
  fetch(asset("./data/sabian_degree_map.json")).then(r => r.json()).then(j => { degreeMap = j; }),
  fetch(asset("./data/soul_blocks.json")).then(r => r.json()).then(j => { soulBlocks = j; }).catch(() => {}),
]);
const citiesReady = fetch(asset("./data/cities.json")).then(r => r.json()).then(j => {
  cities = j.c.map(([name, cc, st, lat, lon, tzi]) => ({
    name, cc, st, lat, lon, tz: j.tz[tzi], key: fold(name),
  }));
  fillZones(j.tz);
});

boot.then(() => {
  go.disabled = false; go.textContent = "Show my symbols";
  run();
}).catch(err => {
  go.textContent = "Calculator unavailable";
  status.innerHTML = `<span class="gc-error">The ephemeris could not load (${escapeHtml(err.message || String(err))}). Reload the page to try again.</span>`;
});

// ---------- time zone select for manual entry
function fillZones(fromCities) {
  let zones = [];
  try { zones = Intl.supportedValuesOf("timeZone"); } catch { zones = fromCities.slice().sort(); }
  const sel = $("tz");
  sel.innerHTML = zones.map(z => `<option${z === place.tz ? " selected" : ""}>${z}</option>`).join("");
}

// ---------- place autocomplete
const input = $("place"), list = $("place-list");
let matches = [], active = -1;
function labelOf(c) { return [c.name, c.st, regionName(c.cc)].filter(Boolean).join(", "); }
function search(q) {
  const k = fold(q.trim()); if (k.length < 2 || !cities) return [];
  const first = k.split(",")[0].trim();
  const pre = [], inner = [];
  for (const c of cities) {
    if (c.key.startsWith(first)) { pre.push(c); if (pre.length >= 8) break; }
    else if (inner.length < 8 && c.key.includes(first)) inner.push(c);
  }
  return pre.concat(inner).slice(0, 8);
}
function render() {
  list.innerHTML = matches.map((c, i) =>
    `<li role="option" id="gc-opt-${i}" aria-selected="${i === active}" data-i="${i}"><span>${escapeHtml(labelOf(c))}</span><small>${c.tz}</small></li>`).join("");
  list.hidden = matches.length === 0;
  input.setAttribute("aria-expanded", String(!list.hidden));
  if (active >= 0) input.setAttribute("aria-activedescendant", `gc-opt-${active}`); else input.removeAttribute("aria-activedescendant");
}
function choose(c) {
  place = { lat: c.lat, lon: c.lon, tz: c.tz, label: labelOf(c) };
  input.value = place.label; matches = []; active = -1; render();
  $("lat").value = c.lat; $("lon").value = c.lon; $("tz").value = c.tz;
  showPlaceMeta();
}
function showPlaceMeta() {
  const ns = place.lat >= 0 ? "N" : "S", ew = place.lon >= 0 ? "E" : "W";
  $("place-meta").textContent = `${Math.abs(place.lat).toFixed(4)}° ${ns}, ${Math.abs(place.lon).toFixed(4)}° ${ew} · ${place.tz}`;
}
input.addEventListener("input", async () => {
  place = null; $("place-meta").textContent = "Choose a place from the list.";
  await citiesReady; matches = search(input.value); active = matches.length ? 0 : -1; render();
});
input.addEventListener("keydown", e => {
  if (list.hidden) return;
  if (e.key === "ArrowDown") { active = (active + 1) % matches.length; render(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { active = (active - 1 + matches.length) % matches.length; render(); e.preventDefault(); }
  else if (e.key === "Enter" && active >= 0) { choose(matches[active]); e.preventDefault(); }
  else if (e.key === "Escape") { matches = []; render(); }
});
list.addEventListener("mousedown", e => { const li = e.target.closest("li"); if (li) { e.preventDefault(); choose(matches[+li.dataset.i]); } });
input.addEventListener("blur", () => setTimeout(() => { matches = []; render(); }, 100));

$("toggle-manual").addEventListener("click", () => {
  manualMode = !manualMode;
  $("manual").hidden = !manualMode;
  $("toggle-manual").setAttribute("aria-expanded", String(manualMode));
  $("toggle-manual").textContent = manualMode ? "Use the town list instead" : "My town is not listed: enter coordinates";
  input.disabled = manualMode;
});
$("no-time").addEventListener("change", e => { $("birth-time").disabled = e.target.checked; });

// ---------- calculate
form.addEventListener("submit", e => { e.preventDefault(); run(); });
// The example label disappears as soon as the visitor changes anything.
form.addEventListener("input", () => { showingExample = false; });
form.addEventListener("change", () => { showingExample = false; });

function readInput() {
  const date = $("birth-date").value;
  if (!date) throw new Error("Enter your birth date.");
  const noTime = $("no-time").checked;
  const time = noTime ? null : $("birth-time").value;
  if (!noTime && !time) throw new Error("Enter your birth time, or tick “I don't know my birth time”.");
  let lat, lon, tz;
  if (manualMode) {
    lat = parseFloat($("lat").value); lon = parseFloat($("lon").value); tz = $("tz").value;
    if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) throw new Error("Latitude must be between −90 and 90, longitude between −180 and 180.");
  } else {
    if (!place) throw new Error("Choose your birth place from the list, or enter coordinates.");
    ({ lat, lon, tz } = place);
  }
  const y = +date.slice(0, 4);
  if (y < 1800 || y > 2399) throw new Error("The ephemeris covers births from 1800 to 2399.");
  return { date, time, lat, lon, tz };
}

function run() {
  if (!swe) return;
  let inp;
  try { inp = readInput(); } catch (err) {
    status.innerHTML = `<span class="gc-error">${escapeHtml(err.message)}</span>`;
    $("results").hidden = true; $("soul").hidden = true;   // never leave an old chart on screen
    return;
  }
  status.textContent = "";
  const chart = computeChart(swe, degreeMap, inp);
  renderResults(chart, inp);
}

// Which birth-clock minutes give the same Ascendant Sabian degree, and what the
// neighbouring degrees are. Pure ephemeris: steps the time a minute at a time.
function ascendantWindow(jd, lat, lon, ascLon) {
  const ascAt = m => swe.houses(jd + m / 1440, lat, lon, "P").ascmc[0];
  const base = Math.floor(ascLon);
  let early = 0, late = 0;
  while (early > -90 && Math.floor(ascAt(early - 1)) === base) early--;
  while (late < 90 && Math.floor(ascAt(late + 1)) === base) late++;
  return { early, late, before: ascAt(early - 1), after: ascAt(late + 1) };
}
function shiftClock(hhmm, minutes) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function sabianLabel(lon) {
  const signs = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
  const sign = signs[Math.floor(lon / 30)], deg = Math.min(Math.floor(lon % 30) + 1, 30);
  const row = degreeMap[`${sign} ${deg}`];
  return `${sign} ${deg}°${row ? ` (${escapeHtml(row.symbol)})` : ""}`;
}

function renderResults(chart, inp) {
  const m = chart.meta, known = m.birth_time_known;
  const pts = chart.points.filter(p => p.tier === "free");
  const firstBy = {};
  const notes = [];

  if (known) {
    const asc = pts.find(p => p.point === "Ascendant");
    const w = ascendantWindow(m.julian_day_ut, inp.lat, inp.lon, asc.longitude);
    const from = shiftClock(inp.time, w.early), to = shiftClock(inp.time, w.late);
    const span = from === to ? `only for a birth at ${from}` : `for births from ${from} to ${to}`;
    notes.push(`<strong>Your Ascendant depends on your exact birth time.</strong> It moves about one degree every four minutes. For this date and place, ${asc.sabian} is your Ascendant ${span}. At ${shiftClock(inp.time, w.early - 1)} it would be ${sabianLabel(w.before)}, and at ${shiftClock(inp.time, w.late + 1)} it would be ${sabianLabel(w.after)}. Use the time on your birth certificate rather than a remembered one.`);
  }
  for (const w of m.warnings) {
    if (/unavailable/.test(w)) continue;           // dossier-only bodies
    notes.push(escapeHtml(w).replace(/ deg ([NS])/, "° $1").replace(/^([^.:]+[.:])/, "<strong>$1</strong>"));
  }

  const rows = pts.map(p => {
    const dupOf = firstBy[p.sabian]; if (!dupOf) firstBy[p.sabian] = p.point;
    const uncertain = !known && p.point === "Moon";
    return `<tr class="${uncertain ? "gc-uncertain" : ""}">
      <td class="gc-pt">${p.point}</td>
      <td class="gc-num gc-pos">${p.position}</td>
      <td class="gc-num gc-hs">${p.house ? `House ${p.house}` : ""}</td>
      <td class="gc-sab"><span class="gc-deg">${p.sabian}</span> <span class="gc-sym">${escapeHtml(p.symbol || "")}</span><span class="gc-kw">${escapeHtml(p.keyword || "")}${uncertain ? " · uncertain without a birth time" : ""}</span>${dupOf ? `<span class="gc-dup">Same degree as your ${dupOf}</span>` : ""}</td>
      <td class="gc-art">${p.article_url ? `<a href="${p.article_url}" target="_blank" rel="noopener">${escapeHtml(p.article_title)}</a>` : ""}</td>
    </tr>`;
  }).join("");

  const offset = m.utc_offset.replace(/^([+-]\d\d)(\d\d)(\d\d)?$/, (_, h, mi, s) => `UTC${h}:${mi}${s ? ":" + s : ""}`);
  $("results").innerHTML = `
    ${showingExample ? `<p class="gc-example">${escapeHtml(EXAMPLE.label)} Enter your own details above to see yours.</p>` : ""}
    <div class="gc-meta">
      <span>${known ? `${escapeHtml(inp.time)} local = ${m.universal_time}` : "Birth time unknown, calculated for local noon"}</span>
      <span>${escapeHtml(inp.tz)} (${offset} on that date)</span>
      ${m.house_system ? `<span>${m.house_system} houses</span>` : ""}
    </div>
    ${notes.length ? `<div class="gc-notes">${notes.map(n => `<p class="gc-note">${n}</p>`).join("")}</div>` : ""}
    <div class="gc-ledger-scroll"><table class="gc-ledger">
      <thead><tr><th>Point</th><th>Position</th><th>House</th><th>Sabian symbol</th><th>Article</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <aside class="gc-more">
      <span class="gc-eyebrow">In the personal dossier</span>
      <p class="gc-more-title">Your chart has more to say</p>
      <p>The free calculator covers the planets, the angles and the lunar nodes. The personal Sabian dossier adds the rest of your chart, each with its Sabian symbol, its house and Sylvain's writing on that degree:</p>
      <ul class="gc-more-list">
        <li>Chiron</li><li>Black Moon Lilith</li><li>Part of Fortune${known ? "" : " <small>(needs a birth time)</small>"}</li>
        <li>Ceres</li><li>Pallas</li><li>Juno</li><li>Vesta</li>
      </ul>
      <p>The dossier is in preparation. Join the waitlist to hear first when it opens.</p>
      <button type="button" class="gc-primary gc-to-waitlist">Join the waitlist</button>
    </aside>`;
  $("results").hidden = false;
  const toWaitlist = $("results").querySelector(".gc-to-waitlist");
  if (toWaitlist) toWaitlist.addEventListener("click", () => $("dossier").scrollIntoView({ behavior: "smooth", block: "start" }));

  // Soul direction preview: which of the pre-written blocks this chart would use.
  const pluto = pts.find(p => p.point === "Pluto"), nn = pts.find(p => p.point === "North Node");
  const sign = p => p.position.split(" ")[1];
  const ord = n => n + ({ 1: "st", 2: "nd", 3: "rd" }[n] || "th");
  // Each block is looked up by exact key in content/soul_blocks.json. Nothing is generated.
  const blocks = [
    [`Pluto in ${sign(pluto)}`, "pluto_sign", sign(pluto)],
    known && pluto.house ? [`Pluto in the ${ord(pluto.house)} house`, "pluto_house", String(pluto.house)] : null,
    [`North Node in ${sign(nn)}`, "node_sign", sign(nn)],
    known && nn.house ? [`North Node in the ${ord(nn.house)} house`, "node_house", String(nn.house)] : null,
  ].filter(Boolean);
  // Only approved blocks are ever shown. A missing or unapproved block is simply left out.
  const items = blocks.map(([label, group, key]) => {
    const b = soulBlocks && soulBlocks[group] && soulBlocks[group][key];
    return b && b.status === "approved"
      ? `<li><span class="gc-tag">${label}</span><p class="gc-soul-text">${escapeHtml(b.text)}</p></li>` : "";
  }).join("");
  $("soul-list").innerHTML = items;
  $("soul").hidden = !items;
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
