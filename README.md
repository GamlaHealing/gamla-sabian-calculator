# Gamla Healing Sabian Calculator

Free Sabian symbol calculator for [gamlahealing.com](https://www.gamlahealing.com). Enter birth data, see every chart point with its Sabian symbol under the Rudhyar/Wheeler round-up convention, linked to the full article for that degree.

Runs in the visitor's browser. The Sun, Moon and Ascendant are shown free; the full chart (14 placements and four soul-direction paragraphs) is sent by email as a personal link with an in-browser PDF download, after the visitor subscribes with consent. Only then are the email, birth details and placements sent to Klaviyo. See KLAVIYO.md and PRIVACY-DRAFTS.md.

## Layout

```
reference/gamla_chart_engine.py   Python reference engine (pyswisseph). The source of truth.
reference/make_golden.py          Runs the reference on 54 charts -> tests/golden_charts.json
reference/build_degree_json.py    data/sabian_degree_map.csv -> data/sabian_degree_map.json
src/engine.js                     Browser/Node port (swisseph-wasm). Must match the reference.
src/calc.js                       Page controller: form, place search, results, soul-direction blocks.
web/markup.html                   The page's HTML and scoped CSS (source for the Shopify section).
content/soul_blocks.json          44 pre-written soul-direction blocks (only status "approved" is shown).
reference/build_web.sh            Builds dist/ (CDN bundle), web-dist/ (local test) and shopify/.
dist/                             What jsDelivr serves to the live site. Rebuilt, never hand-edited.
shopify/                          Theme section + page template to paste into the Shopify theme.
tests/run_golden.mjs              Checks src/engine.js against every golden chart
data/                             Degree map (360 rows)
ephe/                             Astrodienst ephemeris files, identical to the ones bundled in swisseph-wasm
```

## Conventions

- Tropical zodiac, Placidus houses. Whole Sign fallback above ~66.56° latitude, with a visible note.
- Sabian degree = floor(degree in sign) + 1, capped at 30. Positions are truncated to the minute, never rounded.
- Mean North Node, mean Lilith. Part of Fortune reverses for night charts (Sun below the horizon).
- Unknown birth time: calculated for local noon; houses, angles and Part of Fortune omitted.
- Local times that never existed or happened twice are computed like Python's `zoneinfo` (fold=0) and flagged.

## Run the checks

```
pip install pyswisseph timezonefinder
npm install
python3 reference/make_golden.py   # only when the reference changes
npm test                           # expect: 54/54 charts match
```

## Licence

AGPL-3.0-or-later, because it uses the Swiss Ephemeris under its AGPL option. The Sabian articles, symbol texts and interpretive text blocks on gamlahealing.com are content, not part of this code, and are not licensed under it.
