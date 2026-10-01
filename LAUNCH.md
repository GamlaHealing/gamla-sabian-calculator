# Launch checklist, v1.1.0

v1.1 changes the offer: visitors see their **Sun, Moon and Ascendant** for free. The other 11 placements and the soul-direction paragraphs come by email, as a link to their personal chart page with a **Download as PDF** button, after they subscribe to the newsletter.

About 90 minutes end to end. Nothing touches the live site until the page is made visible in step 6.

## 1. GitHub: upload v1.1.0 (10 min)

The repository `GamlaHealing/gamla-sabian-calculator` already exists.

1. Unzip `gamla-sabian-calculator-v1.1.0.zip`.
2. In the repository: **Add file → Upload files**, drag in the *contents* of the unzipped folder (all folders and files). GitHub replaces the old versions. **Commit changes**.
3. **Releases → Draft a new release** → new tag `v1.1.0` → **Publish release**.
4. Check: `https://cdn.jsdelivr.net/gh/GamlaHealing/gamla-sabian-calculator@v1.1.0/dist/calc.js` shows code containing `klaviyoSubscribe`.

(A new tag is needed because jsDelivr keeps `v1.0.0` cached forever.)

## 2. Klaviyo (30 min)

Follow `KLAVIYO.md`: one list with double opt-in, your public API key, two flows, the email copy. Note the **public API key** and the **list ID**.

## 3. Privacy policy (15 min)

Follow `PRIVACY-DRAFTS.md`: add the paragraph to your Shopify privacy policy (Settings → Policies), fill in the two bracketed items, and accept Klaviyo's Data Processing Agreement.

## 4. Shopify theme files (10 min)

1. **Online Store → Themes → … → Duplicate** your live theme (backup).
2. Live theme → **… → Edit code**:
   - **Sections → Add a new section** → `sabian-calculator` → paste `shopify/sections/sabian-calculator.liquid` → Save.
     (If you already added it for v1.0, replace its whole content.)
   - **Templates → Add a new template** → page, JSON, `sabian-calculator` → paste `shopify/templates/page.sabian-calculator.json` → Save.

## 5. The page (10 min)

1. **Online Store → Pages → Add page**
   - Title: `Sabian Symbol Calculator`, content empty, template `sabian-calculator`, Visibility **Hidden**
   - Search engine listing:
     - Page title (71 chars): `Sabian Symbol Calculator: Sun, Moon, Ascendant and More | Gamla Healing`
     - Meta description (148 chars): `Free Sabian symbol calculator: see the Sabian symbols of your Sun, Moon and Ascendant instantly, and get every placement in a personal PDF by email.`
     - URL handle: `sabian-calculator` (the chart links in emails point to this address, so do not change it later)
2. **Customize** → top dropdown **Pages → sabian-calculator** → click the section:
   - Calculator files URL: `https://cdn.jsdelivr.net/gh/GamlaHealing/gamla-sabian-calculator@v1.1.0/dist`
   - Klaviyo public API key: from step 2
   - Klaviyo list ID: from step 2
   - Privacy policy link: your privacy policy page
   - Source code link: `https://github.com/GamlaHealing/gamla-sabian-calculator`
   - Colours: leave the defaults.
   - Save.

## 6. Test, then go live (15 min)

Preview the hidden page on desktop and phone:

- [ ] The Oprah example loads by itself; Sun, Moon and Ascendant are shown, the other 11 rows say they come by email
- [ ] With the example still showing, the email box asks you to enter your own details first
- [ ] Your own chart: Gemini 14° Ascendant, Aquarius 23° Sun, Virgo 13° Moon
- [ ] Email test, both cases in `KLAVIYO.md` step 5: confirmation, chart email, chart page, PDF download
- [ ] The PDF shows all 14 placements and your four soul-direction paragraphs
- [ ] Fonts and colours match the rest of the site

Then set Visibility to **Visible**, add the page to the menu, and tell Claude it is live.

## Updating later

Change the source, run `reference/build_web.sh`, upload, tag a new release (`v1.1.1`), and change the version in the theme setting.
