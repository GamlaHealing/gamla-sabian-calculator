#!/bin/sh
# Build everything that ships.
#   dist/       the CDN bundle (served by jsDelivr from the public GitHub repo)
#   web-dist/   a local test site: dist/ plus an index.html
#   shopify/    the theme section, generated from web/markup.html so the two never drift
set -e
cd "$(dirname "$0")/.."
python3 reference/check_blocks.py > /dev/null || { echo "soul_blocks.json fails the brand check"; exit 1; }

rm -rf dist && mkdir -p dist/lib/src dist/lib/wasm dist/data
cp src/calc.js src/engine.js dist/
cp web/lib/swisseph.patched.js dist/lib/src/swisseph.js
cp node_modules/swisseph-wasm/wasm/swisseph.js node_modules/swisseph-wasm/wasm/swisseph.wasm dist/lib/wasm/
cp node_modules/swisseph-wasm/wasm/swisseph.data dist/lib/wasm/swisseph-data.wasm
cp data/sabian_degree_map.json data/cities.json content/soul_blocks.json dist/data/
cp node_modules/jspdf/dist/jspdf.umd.min.js dist/lib/

# Test pages only: stand-ins for the theme's fonts. On Shopify the section inherits the theme fonts.
FONTS='<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Inter:wght@400;600&display=swap"><style>.gc{font-family:Inter,system-ui,sans-serif;font-size:16px;line-height:1.6}.gc h1,.gc h2{font-family:"Cormorant Garamond",Georgia,serif;font-weight:400}</style>'
PLACEHOLDER='<p class="gc-hint">[Klaviyo waitlist form appears here on the live site.]</p>'

python3 - "$FONTS" "$PLACEHOLDER" <<'PY'
import sys, pathlib
fonts, placeholder = sys.argv[1], sys.argv[2]
m = pathlib.Path("web/markup.html").read_text(encoding="utf-8")
m = m.replace("<!--GC_VARS-->", "").replace("<!--GC_DATA-->", "")
test = m.replace("<!--GC_SOURCE-->", "Calculator code licensed AGPL-3.0.")
script = '<script type="module" src="calc.js"></script>'
# local test site
rm = pathlib.Path("web-dist"); import shutil
shutil.rmtree(rm, ignore_errors=True); shutil.copytree("dist", rm)
(rm / "index.html").write_text('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sabian Symbol Calculator</title>' + fonts + '<style>body{margin:0;background:#FDFCFE}</style></head><body>\n' + test + '\n' + script + '\n</body></html>\n', encoding="utf-8")
# claude.ai test artifact (the publisher adds the document skeleton)
pathlib.Path("web/calculator.html").write_text('<title>Gamla Sabian Calculator</title>\n' + fonts + '\n<style>body{background:#FDFCFE}</style>\n' + test + '\n' + script + '\n', encoding="utf-8")
# Shopify section
live = pathlib.Path("web/markup.html").read_text(encoding="utf-8").replace("<!--GC_VARS-->",
    ' style="--gc-bg: {{ section.settings.color_bg }}; --gc-text: {{ section.settings.color_text }}; --gc-band: {{ section.settings.color_band }}; --gc-band-text: {{ section.settings.color_band_text }}; --gc-button: {{ section.settings.color_button }};"')
live = live.replace("<!--GC_DATA-->",
    ' data-klaviyo-key="{{ section.settings.klaviyo_public_key | escape }}" data-klaviyo-list="{{ section.settings.klaviyo_list_id | escape }}" data-privacy-url="{{ section.settings.privacy_url }}" data-page-url="{{ shop.url }}{{ page.url }}"').replace("<!--GC_SOURCE-->", """{%- if section.settings.source_url != blank -%}<a href="{{ section.settings.source_url }}" target="_blank" rel="noopener">Calculator source code</a> licensed AGPL-3.0.{%- endif -%}""")
schema = """
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Sabian Symbol Calculator",
  "url": "{{ shop.url }}{{ request.path }}",
  "applicationCategory": "LifestyleApplication",
  "operatingSystem": "Any",
  "isAccessibleForFree": true,
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "EUR" },
  "description": "Free calculator that finds the Sabian symbol for every point in your birth chart, using the Swiss Ephemeris and the Rudhyar and Wheeler round-up convention, with a full article for each degree.",
  "publisher": { "@type": "Organization", "name": "Gamla Healing", "url": "{{ shop.url }}" }
}
</script>

{% schema %}
{
  "name": "Sabian calculator",
  "tag": "section",
  "class": "section-sabian-calculator",
  "settings": [
    { "type": "text", "id": "cdn_base", "label": "Calculator files URL",
      "info": "jsDelivr URL of the dist folder, e.g. https://cdn.jsdelivr.net/gh/USERNAME/gamla-sabian-calculator@v1.0.0/dist (no trailing slash)" },
    { "type": "text", "id": "klaviyo_public_key", "label": "Klaviyo public API key",
      "info": "The 6-character public key / Site ID (Klaviyo > Settings > API keys). Never the private key." },
    { "type": "text", "id": "klaviyo_list_id", "label": "Klaviyo list ID",
      "info": "ID of the newsletter list that receives calculator sign-ups (Klaviyo > Lists > the list > Settings)." },
    { "type": "url", "id": "privacy_url", "label": "Privacy policy link",
      "info": "Shown next to the consent checkbox." },
    { "type": "url", "id": "source_url", "label": "Source code link (AGPL)",
      "info": "Link to the public GitHub repository." },
    { "type": "header", "content": "Colours (defaults match gamlahealing.com)" },
    { "type": "color", "id": "color_bg", "label": "Background", "default": "#FDFCFE" },
    { "type": "color", "id": "color_text", "label": "Text and headings", "default": "#4A4560" },
    { "type": "color", "id": "color_band", "label": "Purple band and accents", "default": "#6760AF" },
    { "type": "color", "id": "color_band_text", "label": "Text on purple band", "default": "#FDFCFE" },
    { "type": "color", "id": "color_button", "label": "Button", "default": "#7F77DD" }
  ],
  "presets": [{ "name": "Sabian calculator" }]
}
{% endschema %}
"""
liquid = ("{%- comment -%} Gamla Healing Sabian calculator. Generated from web/markup.html by reference/build_web.sh. Edit the source, not this file. {%- endcomment -%}\n"
          + live + "\n"
          + """{%- if section.settings.cdn_base != blank -%}
<script type="module" src="{{ section.settings.cdn_base }}/calc.js"></script>
{%- else -%}
<p style="text-align:center;color:#B3261E">Sabian calculator: set the "Calculator files URL" in the theme editor.</p>
{%- endif -%}
""" + schema)
pathlib.Path("shopify/sections/sabian-calculator.liquid").write_text(liquid, encoding="utf-8")
pathlib.Path("shopify/templates/page.sabian-calculator.json").write_text('''{
  "sections": {
    "calculator": { "type": "sabian-calculator", "settings": {} }
  },
  "order": ["calculator"]
}
''', encoding="utf-8")
print("built dist/, web-dist/, web/calculator.html, shopify/")
PY
