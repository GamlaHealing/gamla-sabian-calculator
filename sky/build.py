#!/usr/bin/env python3
"""Build the sky page from sky/markup.html:
  shopify/sections/sky-chart.liquid       the theme section (copy and notes editable in the theme editor)
  shopify/templates/page.sky-chart.json   the page template, pinned to a release tag
  sky/index.html                          a local test page with the same markup and default copy
Usage: python3 sky/build.py v1.3.0
"""
import json, pathlib, sys, html

tag = sys.argv[1] if len(sys.argv) > 1 else "v1.3.0"
root = pathlib.Path(__file__).resolve().parent.parent
m = (root / "sky/markup.html").read_text(encoding="utf-8")
CDN = f"https://cdn.jsdelivr.net/gh/GamlaHealing/gamla-sabian-calculator@{tag}/sky"

INTRO = "Watch the planets move in real time, or travel to any moment from 4000 BC to 2999 AD. Every placement links to its Sabian symbol and to the full article on it."
LEDGER_HEADING = "Every placement at this moment"
LEDGER_INTRO = "Each planet with its exact position, its house for the place you chose, and its Sabian degree. Follow the links to read the symbol and the placement in depth."
NOTES_HEADING = "How this sky is calculated"
NOTES = [
    ("Ephemeris", "Positions come from the Swiss Ephemeris by Astrodienst, built on NASA JPL's DE431 for 1800 to 2400 and DE441 for every other century. Each 600-year block loads only when you travel into it."),
    ("Conventions", "Tropical zodiac, Placidus houses (Whole Sign near the poles, where Placidus does not exist), mean Node. A planet at 20°02' sits in the 21st Sabian degree, following Rudhyar and Wheeler."),
    ("Calendar", "Dates before 15 October 1582 use the Julian calendar, as historians write them. There is no year 0: 1 BC is followed by 1 AD."),
    ("Clock time", "From 1850 the time shown is the legal time of the place's time zone. Before 1850 it is the local mean time of the place, the time a sundial-based clock would have kept there."),
    ("Ancient dates", "The planets stay reliable across the whole range. What becomes uncertain is the clock: the slowing of the Earth's rotation can only be estimated for the deep past, so for a precise hour long ago the Moon may fall in a neighbouring Sabian degree and the Ascendant and houses can shift by several degrees or more."),
    ("Signs and constellations", "The tropical zodiac is measured from the spring equinox of each year. Because of precession, in 4000 BC the signs lay over different constellations than they do today."),
]

# ---------- Shopify section
live = m.replace("<!--GS_BASE-->", "{{ section.settings.cdn_base }}")
live = live.replace("<!--GS_INTRO-->", '{%- if section.settings.intro != blank -%}<p class="gs-intro">{{ section.settings.intro }}</p>{%- endif -%}')
live = live.replace("<!--GS_LEDGER_HEAD-->", '<h2 id="gs-lh">{{ section.settings.ledger_heading | escape }}</h2>\n  {%- if section.settings.ledger_intro != blank -%}<p class="gs-sub">{{ section.settings.ledger_intro | escape }}</p>{%- endif -%}')
live = live.replace("<!--GS_NOTES-->", '<h2 id="gs-nh">{{ section.settings.notes_heading | escape }}</h2>\n  <div class="gs-cols">\n  {%- for block in section.blocks -%}\n   <div {{ block.shopify_attributes }}><h3>{{ block.settings.title | escape }}</h3><p>{{ block.settings.text | escape }}</p></div>\n  {%- endfor -%}\n  </div>')
live = live.replace("<!--GS_SOURCE-->", '{%- if section.settings.source_url != blank -%}<a href="{{ section.settings.source_url }}" target="_blank" rel="noopener">Source code</a> licensed AGPL-3.0.{%- endif -%}')

schema = {
    "name": "Sky in motion",
    "tag": "section",
    "class": "section-sky-chart",
    "settings": [
        {"type": "text", "id": "cdn_base", "label": "Sky chart files URL",
         "info": "jsDelivr URL of the sky folder, e.g. https://cdn.jsdelivr.net/gh/GamlaHealing/gamla-sabian-calculator@v1.3.0/sky (no trailing slash)"},
        {"type": "url", "id": "source_url", "label": "Source code link (AGPL)"},
        {"type": "inline_richtext", "id": "intro", "label": "Introduction", "default": INTRO},
        {"type": "text", "id": "ledger_heading", "label": "Placements heading", "default": LEDGER_HEADING},
        {"type": "textarea", "id": "ledger_intro", "label": "Placements introduction", "default": LEDGER_INTRO},
        {"type": "text", "id": "notes_heading", "label": "Notes heading", "default": NOTES_HEADING},
    ],
    "blocks": [{"type": "note", "name": "Note", "settings": [
        {"type": "text", "id": "title", "label": "Title"},
        {"type": "textarea", "id": "text", "label": "Text"}]}],
    "max_blocks": 12,
    "presets": [{"name": "Sky in motion", "blocks": [{"type": "note", "settings": {"title": t, "text": x}} for t, x in NOTES]}],
}
ld = """<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "The Sky in Motion",
  "url": "{{ shop.url }}{{ request.path }}",
  "applicationCategory": "LifestyleApplication",
  "operatingSystem": "Any",
  "isAccessibleForFree": true,
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "EUR" },
  "description": "Live astrology chart of the sky with every planet's sign, house and Sabian degree, for any moment from 4000 BC to 2999 AD, calculated with the Swiss Ephemeris.",
  "publisher": { "@type": "Organization", "name": "Gamla Healing", "url": "{{ shop.url }}" }
}
</script>"""
script = """{%- if section.settings.cdn_base != blank -%}
<script type="module" src="{{ section.settings.cdn_base }}/sky.js"></script>
{%- else -%}
<p style="text-align:center;color:#B3261E">Sky chart: set the "Sky chart files URL" in the theme editor.</p>
{%- endif -%}"""
section = ("{%- comment -%} Gamla Healing sky in motion. Generated from sky/markup.html by sky/build.py. Edit the source, not this file. {%- endcomment -%}\n"
           + live + "\n" + script + "\n\n" + ld + "\n\n{% schema %}\n" + json.dumps(schema, ensure_ascii=False, indent=2) + "\n{% endschema %}\n")
(root / "shopify/sections").mkdir(parents=True, exist_ok=True)
(root / "shopify/sections/sky-chart.liquid").write_text(section, encoding="utf-8")

# ---------- page template (settings stored, so the page works on first load)
order = [f"note_{i+1}" for i in range(len(NOTES))]
tpl = {"sections": {"sky": {"type": "sky-chart",
        "blocks": {k: {"type": "note", "settings": {"title": t, "text": x}} for k, (t, x) in zip(order, NOTES)},
        "block_order": order,
        "settings": {"cdn_base": CDN, "source_url": "https://github.com/GamlaHealing/gamla-sabian-calculator",
                     "intro": INTRO, "ledger_heading": LEDGER_HEADING, "ledger_intro": LEDGER_INTRO, "notes_heading": NOTES_HEADING}}},
       "order": ["sky"]}
(root / "shopify/templates").mkdir(parents=True, exist_ok=True)
(root / "shopify/templates/page.sky-chart.json").write_text(json.dumps(tpl, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# ---------- local test page (served from the repo root: python3 -m http.server, open /sky/)
e = html.escape
test = m.replace("<!--GS_BASE-->", ".")
test = test.replace("<!--GS_INTRO-->", f'<p class="gs-intro">{e(INTRO)}</p>')
test = test.replace("<!--GS_LEDGER_HEAD-->", f'<h2 id="gs-lh">{e(LEDGER_HEADING)}</h2><p class="gs-sub">{e(LEDGER_INTRO)}</p>')
test = test.replace("<!--GS_NOTES-->", f'<h2 id="gs-nh">{e(NOTES_HEADING)}</h2><div class="gs-cols">' + "".join(f"<div><h3>{e(t)}</h3><p>{e(x)}</p></div>" for t, x in NOTES) + "</div>")
test = test.replace("<!--GS_SOURCE-->", "Source code licensed AGPL-3.0.")
fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Inter:wght@400;600&display=swap"><style>body{margin:0;font-family:Inter,system-ui,sans-serif;font-size:16px;line-height:1.55}.gs h1,.gs h2{font-family:"Cormorant Garamond",Georgia,serif;font-weight:500}</style>'
(root / "sky/index.html").write_text('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The Sky in Motion (test page)</title>'
    + fonts + '</head><body>\n' + test + '\n<script type="module" src="sky.js"></script>\n</body></html>\n', encoding="utf-8")
print("built", tag)
