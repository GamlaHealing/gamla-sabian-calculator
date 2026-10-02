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

// ---------- configuration from the Shopify section (data-* attributes on .gc)
const root = document.querySelector(".gc");
const cfg = {
  klaviyoKey: (root && root.dataset.klaviyoKey) || "",
  klaviyoList: (root && root.dataset.klaviyoList) || "",
  privacyUrl: (root && root.dataset.privacyUrl) || "",
  pageUrl: (root && root.dataset.pageUrl) || (location.origin + location.pathname),
};

// ---------- personal chart links
// The emailed link carries the birth details in the URL fragment (#chart=...).
// Browsers never send the fragment to the server, so Shopify and its analytics
// never see it. The page reads it and shows the full chart.
const b64url = {
  enc: str => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: str => new TextDecoder().decode(Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))),
};
function chartLink(inp) {
  const payload = { v: 1, d: inp.date, t: inp.time, la: inp.lat, lo: inp.lon, tz: inp.tz, p: inp.label || "" };
  return `${cfg.pageUrl}#chart=${b64url.enc(JSON.stringify(payload))}`;
}
function chartFromHash() {
  const m = location.hash.match(/chart=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const c = JSON.parse(b64url.dec(m[1]));
    if (c.v !== 1 || !/^\d{4}-\d\d-\d\d$/.test(c.d) || typeof c.la !== "number" || typeof c.lo !== "number" || !c.tz) return null;
    return c;
  } catch { return null; }
}
let fullMode = false;
const linked = chartFromHash();
if (linked) {
  fullMode = true; showingExample = false;
  $("birth-date").value = linked.d;
  if (linked.t) $("birth-time").value = linked.t; else { $("no-time").checked = true; $("birth-time").disabled = true; }
  place = { lat: linked.la, lon: linked.lo, tz: linked.tz, label: linked.p || `${linked.la}, ${linked.lo}` };
  $("place").value = place.label;
  $("lat").value = linked.la; $("lon").value = linked.lo;
}

// ---------- boot: ephemeris, degree map and city list load in parallel
const boot = Promise.all([
  (async () => { const s = new SwissEph(); await s.initSwissEph(); swe = s; })(),
  fetch(asset("./data/sabian_degree_map.json")).then(r => r.json()).then(j => { degreeMap = j; }),
  fetch(asset("./data/soul_blocks.json")).then(r => r.json()).then(j => { soulBlocks = j; }).catch(() => {}),
]);
const citiesReady = fetch(asset("./data/cities.json")).then(r => r.json()).then(j => {
  cities = j.c.map(([name, cc, st, lat, lon, tzi]) => ({
    name, cc, st: typeof st === "number" ? (j.r && j.r[st]) || "" : st, lat, lon, tz: j.tz[tzi], key: fold(name),
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
  $("toggle-manual").textContent = manualMode ? "Use the town list instead" : "Enter coordinates instead";
  input.disabled = manualMode;
});
$("no-time").addEventListener("change", e => { $("birth-time").disabled = e.target.checked; });

// ---------- calculate
form.addEventListener("submit", e => { e.preventDefault(); run(); });
// The example label disappears as soon as the visitor changes anything.
form.addEventListener("input", () => { showingExample = false; fullMode = false; });
form.addEventListener("change", () => { showingExample = false; fullMode = false; });

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
  const label = manualMode ? `${lat}, ${lon}` : place.label;
  return { date, time, lat, lon, tz, label };
}

let last = null;   // most recent { chart, inp }, used by the email form and the PDF

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
  last = { chart, inp };
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
function sabianLabel(lon, html = true) {
  const signs = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
  const sign = signs[Math.floor(lon / 30)], deg = Math.min(Math.floor(lon % 30) + 1, 30);
  const row = degreeMap[`${sign} ${deg}`];
  return `${sign} ${deg}°${row ? ` (${html ? escapeHtml(row.symbol) : row.symbol})` : ""}`;
}

const BIG_THREE = new Set(["Sun", "Moon", "Ascendant"]);
const SERVICES_URL = "https://www.gamlahealing.com/collections/astrology-services";
const MORE_TITLE = "This chart is a summary";
const MORE_TEXT = "What you hold here is a short summary of your birth chart: one Sabian symbol for each main placement, and four paragraphs on your soul direction. Your chart holds much more. The aspects between your planets, the rulers of your houses, Chiron, Black Moon Lilith, the Part of Fortune, the asteroids and your current transits each add their own layer. Sylvain works through all of them in depth in his evolutionary astrology readings and in-depth astrological dossiers.";
const MORE_LINK = "Explore the astrology services";
const ORD = n => n + ({ 1: "st", 2: "nd", 3: "rd" }[n] || "th");
const signOf = p => p.position.split(" ")[1];

// The four soul-direction blocks for a chart: [label, text|null].
// Each block is looked up by exact key in soul_blocks.json. Nothing is generated.
function soulBlocksFor(pts, known) {
  const pluto = pts.find(p => p.point === "Pluto"), nn = pts.find(p => p.point === "North Node");
  const keys = [
    [`Pluto in ${signOf(pluto)}`, "pluto_sign", signOf(pluto)],
    known && pluto.house ? [`Pluto in the ${ORD(pluto.house)} house`, "pluto_house", String(pluto.house)] : null,
    [`North Node in ${signOf(nn)}`, "node_sign", signOf(nn)],
    known && nn.house ? [`North Node in the ${ORD(nn.house)} house`, "node_house", String(nn.house)] : null,
  ].filter(Boolean);
  return keys.map(([label, group, key]) => {
    const b = soulBlocks && soulBlocks[group] && soulBlocks[group][key];
    return [label, b && b.status === "approved" ? b.text : null];
  }).filter(([, text]) => text);
}

function ascendantNote(m, inp, pts) {
  const asc = pts.find(p => p.point === "Ascendant");
  const w = ascendantWindow(m.julian_day_ut, inp.lat, inp.lon, asc.longitude);
  const from = shiftClock(inp.time, w.early), to = shiftClock(inp.time, w.late);
  const span = from === to ? `only for a birth at ${from}` : `for births from ${from} to ${to}`;
  return { html: `<strong>Your Ascendant depends on your exact birth time.</strong> It moves about one degree every four minutes. For this date and place, ${asc.sabian} is your Ascendant ${span}. At ${shiftClock(inp.time, w.early - 1)} it would be ${sabianLabel(w.before)}, and at ${shiftClock(inp.time, w.late + 1)} it would be ${sabianLabel(w.after)}. Use the time on your birth certificate rather than a remembered one.`,
    text: `Your Ascendant depends on your exact birth time. It moves about one degree every four minutes. For this date and place, ${asc.sabian} is your Ascendant ${span}. At ${shiftClock(inp.time, w.early - 1)} it would be ${sabianLabel(w.before, false)}, and at ${shiftClock(inp.time, w.late + 1)} it would be ${sabianLabel(w.after, false)}. Use the time on your birth certificate rather than a remembered one.` };
}

function renderResults(chart, inp) {
  const m = chart.meta, known = m.birth_time_known;
  const pts = chart.points.filter(p => p.tier === "free");
  const firstBy = {};
  const notes = [];
  if (known) notes.push(ascendantNote(m, inp, pts).html);
  for (const w of m.warnings) {
    if (/unavailable/.test(w)) continue;           // dossier-only bodies
    notes.push(escapeHtml(w).replace(/ deg ([NS])/, "° $1").replace(/^([^.:]+[.:])/, "<strong>$1</strong>"));
  }

  const rowList = pts.map(p => {
    const dupOf = firstBy[p.sabian]; if (!dupOf) firstBy[p.sabian] = p.point;
    const uncertain = !known && p.point === "Moon";
    if (!fullMode && !BIG_THREE.has(p.point)) {
      return `<tr class="gc-lock"><td class="gc-pt">${p.point}</td><td class="gc-sab" colspan="4"><span class="gc-locked">Included in your full chart, sent by email</span></td></tr>`;
    }
    return `<tr>
      <td class="gc-pt">${p.point}</td>
      <td class="gc-num gc-pos">${p.position}</td>
      <td class="gc-num gc-hs">${p.house ? `House ${p.house}` : ""}</td>
      <td class="gc-sab"><span class="gc-deg">${p.sabian}</span> <span class="gc-sym">${escapeHtml(p.symbol || "")}</span><span class="gc-kw">${escapeHtml(p.keyword || "")}${uncertain ? " · uncertain without a birth time" : ""}</span>${dupOf ? `<span class="gc-dup">Same degree as your ${dupOf}</span>` : ""}</td>
      <td class="gc-art">${p.article_url ? `<a href="${p.article_url}" target="_blank" rel="noopener">${escapeHtml(p.article_title)}</a>` : ""}</td>
    </tr>`;
  });
  const ledger = (trs, head = true) => `<div class="gc-ledger-scroll"><table class="gc-ledger">
      ${head ? `<thead><tr><th>Point</th><th>Position</th><th>House</th><th>Sabian symbol</th><th>Article</th></tr></thead>` : ""}
      <tbody>${trs.join("")}</tbody>
    </table></div>`;

  const offset = m.utc_offset.replace(/^([+-]\d\d)(\d\d)(\d\d)?$/, (_, h, mi, s) => `UTC${h}:${mi}${s ? ":" + s : ""}`);
  const mine = fullMode ? `
    <div class="gc-mine">
      <span class="gc-eyebrow">Your personal Sabian chart</span>
      <p class="gc-mine-title">${escapeHtml(inp.label || "")}</p>
      <button type="button" class="gc-primary" id="gc-pdf">Download as PDF</button>
      <p class="gc-hint">Bookmark this page to come back to your chart at any time.</p>
    </div>` : "";
  const unlock = fullMode ? "" : unlockCard(showingExample);

  $("results").innerHTML = `
    ${mine}
    ${showingExample ? `<p class="gc-example">${escapeHtml(EXAMPLE.label)} Enter your own details above to see yours.</p>` : ""}
    <div class="gc-meta">
      <span>${known ? `${escapeHtml(inp.time)} local = ${m.universal_time}` : "Birth time unknown, calculated for local noon"}</span>
      <span>${escapeHtml(inp.tz)} (${offset} on that date)</span>
      ${m.house_system ? `<span>${m.house_system} houses</span>` : ""}
    </div>
    ${notes.length ? `<div class="gc-notes">${notes.map(n => `<p class="gc-note">${n}</p>`).join("")}</div>` : ""}
    ${fullMode ? ledger(rowList) : `
    ${ledger(rowList.filter((_, i) => BIG_THREE.has(pts[i].point)))}
    ${unlock}
    <span class="gc-eyebrow gc-rest-title">Also in your full chart</span>
    ${ledger(rowList.filter((_, i) => !BIG_THREE.has(pts[i].point)), false)}`}`;
  $("results").hidden = false;
  wireUnlock();
  const pdfBtn = $("pdf");
  if (pdfBtn) pdfBtn.addEventListener("click", () => downloadPdf(pdfBtn));

  // Soul direction: full text in full mode, labels only in preview.
  const blocks = soulBlocksFor(pts, known);
  $("soul-list").innerHTML = blocks.map(([label, text]) => fullMode
    ? `<li><span class="gc-tag">${label}</span><p class="gc-soul-text">${escapeHtml(text)}</p></li>`
    : `<li><span class="gc-tag">${label}</span><span class="gc-locked">Included in your full chart, sent by email</span></li>`).join("");
  $("soul").hidden = !blocks.length;

  // After the soul band: the paid-dossier teaser, only on a personal chart.
  $("after").innerHTML = fullMode ? `
    <aside class="gc-more">
      <span class="gc-eyebrow">Going deeper</span>
      <p class="gc-more-title">${MORE_TITLE}</p>
      <p>${escapeHtml(MORE_TEXT)}</p>
      <ul class="gc-more-list"><li>Soul Mission</li><li>Aspects</li><li>House rulers</li><li>Chiron</li><li>Black Moon Lilith</li></ul>
      <ul class="gc-more-list"><li>Part of Fortune</li><li>Asteroids</li><li>Transits</li></ul>
      <a class="gc-primary gc-more-btn" href="${SERVICES_URL}">${MORE_LINK}</a>
    </aside>` : "";
}

// ---------- email form: subscribe to the newsletter, receive the full chart by email
function unlockCard(example) {
  const privacy = cfg.privacyUrl ? ` <a href="${escapeHtml(cfg.privacyUrl)}" target="_blank" rel="noopener">Privacy policy</a>.` : "";
  return `
    <section class="gc-unlock" aria-labelledby="gc-unlock-title">
      <span class="gc-eyebrow">Your full Sabian chart</span>
      <p class="gc-unlock-title" id="gc-unlock-title">Get every placement in a personal PDF</p>
      <p>We will email you a link to your complete chart: the Midheaven, every planet from Mercury to Pluto, both lunar nodes and your four soul-direction paragraphs, each with its Sabian symbol and a link to the full article.<span class="gc-oneline">Open it, read it, and download it as a PDF.</span></p>
      ${example ? `<p class="gc-unlock-msg"><strong>Enter your own birth details above first.</strong> This is still the example chart.</p>` : `
      <form id="gc-unlock-form" novalidate>
        <div class="gc-unlock-row">
          <input type="email" id="gc-email" required autocomplete="email" placeholder="Your email address" aria-label="Your email address">
          <button type="submit" class="gc-primary" id="gc-unlock-go">Send me my chart</button>
        </div>
        <div class="gc-consent">
          <input type="checkbox" id="gc-consent" required>
          <label for="gc-consent">Subscribe me to the Gamla Healing newsletter and send me my Sabian chart. To do this, Gamla Healing stores my email address, birth details and Sabian placements with its email provider, Klaviyo. I can unsubscribe at any time, and my data is deleted on request.${privacy}</label>
        </div>
      </form>`}
      <div class="gc-unlock-msg" id="gc-unlock-msg" role="status"></div>
    </section>`;
}

function wireUnlock() {
  const f = $("unlock-form");
  if (!f) return;
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("unlock-msg"), btn = $("unlock-go");
    const email = $("email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "Enter a valid email address."; return; }
    if (!$("consent").checked) { msg.textContent = "Tick the box to confirm you want the newsletter and your chart."; return; }
    if (!last) return;
    const link = chartLink(last.inp);
    const pts = last.chart.points.filter(p => p.tier === "free");
    const bySabian = name => { const p = pts.find(x => x.point === name); return p ? `${p.sabian} ${p.symbol || ""}`.trim() : ""; };
    const properties = {
      sabian_chart_link: link,
      sabian_birth_date: last.inp.date,
      sabian_birth_time: last.inp.time || "unknown",
      sabian_birth_place: last.inp.label || "",
      sabian_sun: bySabian("Sun"),
      sabian_moon: bySabian("Moon"),
      sabian_ascendant: bySabian("Ascendant"),
      sabian_placements: pts.map(p => `${p.point}: ${p.sabian} ${p.symbol || ""}`.trim()),
      sabian_signup_date: new Date().toISOString().slice(0, 10),
    };
    if (!cfg.klaviyoKey || !cfg.klaviyoList) {
      // Test page: Klaviyo is not connected, so show what would be sent.
      msg.innerHTML = `<strong>Test mode: Klaviyo is not connected.</strong> On the live site this email would now receive a confirmation request, then a link to the full chart. The link would be:<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`;
      return;
    }
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      await klaviyoSubscribe(email, properties);
      f.hidden = true;
      msg.innerHTML = `<strong>Almost there.</strong> Check your inbox and confirm your email address. Your chart arrives right after. If nothing comes within a few minutes, look in your spam folder.`;
    } catch (err) {
      btn.disabled = false; btn.textContent = "Send me my chart";
      msg.textContent = "Something went wrong while sending. Try again in a moment.";
    }
  });
}

// Klaviyo client-side API (public key only, designed for browsers).
// 1. subscribe the email to the list (the list's own double opt-in applies)
// 2. save the chart details as custom profile properties, which the Klaviyo email uses
async function klaviyoSubscribe(email, properties) {
  const url = path => `https://a.klaviyo.com/client/${path}/?company_id=${encodeURIComponent(cfg.klaviyoKey)}`;
  const headers = { "Content-Type": "application/json", "revision": "2026-07-15" };
  const sub = await fetch(url("subscriptions"), { method: "POST", headers, body: JSON.stringify({
    data: { type: "subscription",
      attributes: { custom_source: "Sabian calculator",
        profile: { data: { type: "profile", attributes: { email, properties } } } },
      relationships: { list: { data: { type: "list", id: cfg.klaviyoList } } } } }) });
  if (!sub.ok) throw new Error(`subscription ${sub.status}`);
  const prof = await fetch(url("profiles"), { method: "POST", headers, body: JSON.stringify({
    data: { type: "profile", attributes: { email, properties } } }) });
  if (!prof.ok) throw new Error(`profile ${prof.status}`);
  // 3. an event, so returning subscribers who ask for another chart also get an email
  //    (Klaviyo flow "Requested Sabian Chart"). Not fatal if it fails.
  await fetch(url("events"), { method: "POST", headers, body: JSON.stringify({
    data: { type: "event", attributes: {
      properties: { sabian_chart_link: properties.sabian_chart_link, sabian_birth_place: properties.sabian_birth_place,
                    sabian_sun: properties.sabian_sun, sabian_moon: properties.sabian_moon, sabian_ascendant: properties.sabian_ascendant },
      metric: { data: { type: "metric", attributes: { name: "Requested Sabian Chart" } } },
      profile: { data: { type: "profile", attributes: { email } } } } } }) }).catch(() => {});
}

// ---------- PDF, made in the visitor's browser with jsPDF (no server)
function loadScript(src) {
  return new Promise((ok, fail) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
}
// The PDF uses the built-in Helvetica, which covers Latin-1 only. Fold anything else.
const pdfSafe = s => String(s).replace(/[^\x20-\x7E\xA0-\xFF]/g, c => EXTRA[c] || EXTRA[c.toLowerCase()] || c.normalize("NFD").replace(/[^\x20-\x7E\xA0-\xFF]/g, ""));

async function downloadPdf(btn) {
  if (!last) return;
  const label = btn.textContent; btn.disabled = true; btn.textContent = "Preparing PDF…";
  try {
    if (!window.jspdf) await loadScript(asset("./lib/jspdf.umd.min.js"));
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const { chart, inp } = last, m = chart.meta, known = m.birth_time_known;
    const pts = chart.points.filter(p => p.tier === "free");
    const css = getComputedStyle(root);
    const hex = v => { const h = (css.getPropertyValue(v).trim() || "#000000").replace("#", ""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
    const BAND = hex("--gc-band"), TEXT = hex("--gc-text"), PANEL = [246, 244, 251], MUTED = [119, 115, 138];
    const W = 210, M = 16, CW = W - 2 * M;
    let y = 0;
    const page = () => { doc.addPage(); y = M; };
    const need = h => { if (y + h > 297 - 18) page(); };
    const para = (t, size = 10, color = TEXT, style = "normal", width = CW, x = M, lh = 1.45) => {
      doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color);
      const lines = doc.splitTextToSize(pdfSafe(t), width);
      const h = lines.length * size * 0.3528 * lh;
      need(h); doc.text(lines, x, y + size * 0.3528, { lineHeightFactor: lh }); y += h; return h;
    };

    // header band
    doc.setFillColor(...BAND); doc.rect(0, 0, W, 38, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text("GAMLA HEALING  ·  SABIAN SYMBOLS", M, 13);
    doc.setFont("times", "normal"); doc.setFontSize(24); doc.text("Your Sabian Chart", M, 25);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.text(pdfSafe(`${inp.label || ""}   ${inp.date}${known ? "   " + inp.time : "   birth time unknown"}`), M, 32.5);
    y = 48;

    para(`${known ? `${inp.time} local = ${m.universal_time}` : "Birth time unknown, calculated for local noon."}   ${inp.tz}   ${m.house_system ? m.house_system + " houses" : ""}`, 8.5, MUTED);
    y += 4;
    if (known) {
      const t = ascendantNote(m, inp, pts).text;
      doc.setFontSize(9); const lines = doc.splitTextToSize(pdfSafe(t), CW - 10); const h = lines.length * 9 * 0.3528 * 1.45 + 8;
      need(h); doc.setFillColor(...PANEL); doc.rect(M, y, CW, h, "F"); doc.setFillColor(...BAND); doc.rect(M, y, 1.4, h, "F");
      doc.setTextColor(...TEXT); doc.setFont("helvetica", "normal"); doc.text(lines, M + 6, y + 4 + 9 * 0.3528, { lineHeightFactor: 1.45 }); y += h + 6;
    }
    for (const w of m.warnings) if (!/unavailable/.test(w)) { para(w.replace(/ deg ([NS])/, " ° $1").replace(" ° ", "° "), 9, MUTED); y += 3; }

    // placements
    doc.setFont("times", "normal"); doc.setFontSize(16); doc.setTextColor(...TEXT); need(12); doc.text("Your placements", M, y + 6); y += 12;
    pts.forEach((p, i) => {
      const dark = i % 2 === 1;
      doc.setFontSize(9.5);
      const symLines = doc.splitTextToSize(pdfSafe(`${p.sabian}  ${p.symbol || ""}`), 92);
      const h = 7 + symLines.length * 4.6 + 4.2 + (p.article_title ? 4.6 : 0);
      need(h + 2);
      if (dark) { doc.setFillColor(...BAND); } else { doc.setFillColor(...PANEL); }
      doc.roundedRect(M, y, CW, h, 2.5, 2.5, "F");
      if (!dark) { doc.setFillColor(...BAND); doc.rect(M, y, 1.4, h, "F"); }
      const fg = dark ? [255, 255, 255] : TEXT, sub = dark ? [235, 233, 248] : MUTED;
      doc.setTextColor(...fg); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(pdfSafe(p.point), M + 5, y + 7);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...sub);
      doc.text(pdfSafe(p.position + (p.house ? `   House ${p.house}` : "")), M + 5, y + 12);
      doc.setTextColor(...fg); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
      doc.text(symLines, M + 78, y + 7, { lineHeightFactor: 1.35 });
      let yy = y + 7 + symLines.length * 4.6 - 0.6;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...sub);
      doc.text(pdfSafe(p.keyword || ""), M + 78, yy); yy += 4.6;
      if (p.article_url) {
        doc.setTextColor(...(dark ? [255, 255, 255] : BAND));
        const t = pdfSafe("Read: " + p.article_title);
        doc.textWithLink(t.length > 70 ? t.slice(0, 68) + "..." : t, M + 78, yy, { url: p.article_url });
      }
      y += h + 2;
    });

    // soul direction
    const blocks = soulBlocksFor(pts, known);
    if (blocks.length) {
      page();
      doc.setFillColor(...BAND); doc.rect(0, 0, W, 30, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("SOUL DIRECTION", M, 12);
      doc.setFont("times", "normal"); doc.setFontSize(20); doc.text("Where your chart points you", M, 23);
      y = 40;
      para("Read through the lens of evolutionary astrology: Pluto shows what your soul is working through, and the North Node shows the direction of growth.", 9.5, MUTED);
      y += 4;
      for (const [lbl, text] of blocks) {
        need(20); para(lbl.toUpperCase(), 8.5, BAND, "bold"); y += 1.5; para(text, 10.5, TEXT, "normal", CW, M, 1.55); y += 6;
      }
    }

    // coming next + footer notes
    need(40); y += 2;
    para(MORE_TITLE, 12, TEXT, "bold"); y += 1.5;
    para(MORE_TEXT, 10); y += 2;
    need(6); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...BAND);
    doc.textWithLink(MORE_LINK + ": gamlahealing.com/collections/astrology-services", M, y + 3.5, { url: SERVICES_URL }); y += 6;
    y += 6;
    para("Positions from the Swiss Ephemeris (Astrodienst). Tropical zodiac, Placidus houses, mean lunar nodes. Sabian degrees use the Rudhyar and Wheeler round-up convention: 20°02' falls in the 21st degree.", 8, MUTED);
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.textWithLink("gamlahealing.com", M, 289, { url: "https://www.gamlahealing.com" });
      doc.text(`${i} / ${n}`, W - M, 289, { align: "right" });
    }
    const safeName = (inp.date + "-" + (inp.label || "chart").split(",")[0]).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9-]+/g, "-");
    doc.save(`sabian-chart-${safeName}.pdf`);
  } catch (err) {
    alertBox(`The PDF could not be created (${err.message || err}). Try again, or use your browser's Print menu to save this page as a PDF.`);
  } finally { btn.disabled = false; btn.textContent = label; }
}
function alertBox(t) { const s = $("status"); if (s) s.innerHTML = `<span class="gc-error">${escapeHtml(t)}</span>`; }

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
