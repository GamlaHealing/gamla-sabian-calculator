# Launch checklist, v1.0.0

About an hour end to end. Nothing here touches the live site until step 5.

## 1. GitHub (10 min)

1. github.com → **New repository**
   - Name: `gamla-sabian-calculator`
   - **Public** (jsDelivr only serves public repos, and the AGPL licence expects the source to be available)
   - Tick **Add a README**? No, leave unticked (the repo already has one).
   - **Choose a license: GNU Affero General Public License v3.0**
2. In the new repo: **Add file → Upload files**, drag in the *contents* of the unzipped `gamla-sabian-calculator` folder (all folders, including `dist`). Commit.
3. Right sidebar → **Releases → Create a new release** → tag `v1.0.0` → Publish.
4. Check the CDN works by opening, in a browser (replace USERNAME):
   `https://cdn.jsdelivr.net/gh/USERNAME/gamla-sabian-calculator@v1.0.0/dist/calc.js`
   You should see JavaScript code. The first request can take a minute.

## 2. Klaviyo waitlist form (10 min)

1. Klaviyo → **Sign-up forms → Create form → Embedded**.
2. One field: email. Connect it to a new list, e.g. **Sabian Dossier Waitlist**, with double opt-in on.
3. Suggested text (brand voice, no em dashes):
   - Button: `Join the waitlist`
   - Success: `You're on the list. Check your inbox to confirm your email.`
4. Publish the form and copy its **form ID** (the 6 characters in `klaviyo-form-XXXXXX` in the embed code).

## 3. Shopify theme (15 min)

1. **Online Store → Themes → … → Duplicate** your live theme first (backup).
2. On the live theme: **… → Edit code**.
   - **Sections → Add a new section** → name `sabian-calculator` → replace everything with the contents of `shopify/sections/sabian-calculator.liquid` → Save.
   - **Templates → Add a new template** → type *page*, JSON, name `sabian-calculator` → replace everything with `shopify/templates/page.sabian-calculator.json` → Save.

## 4. The page (10 min)

1. **Online Store → Pages → Add page**
   - Title: `Sabian Symbol Calculator`
   - Content: leave empty (the section carries everything)
   - Theme template: `sabian-calculator`
   - Visibility: **Hidden** for now
   - Search engine listing:
     - Page title (67 chars): `Sabian Symbol Calculator: Every Point in Your Chart | Gamla Healing`
     - Meta description (154 chars): `Free Sabian symbol calculator. Enter your birth details to find the Sabian symbol of your Sun, Moon, Ascendant and every planet, each with a full article.`
     - URL handle: `sabian-calculator`
2. **Customize** the theme → switch the top dropdown to **Pages → sabian-calculator** → click the section and fill in:
   - Calculator files URL: `https://cdn.jsdelivr.net/gh/USERNAME/gamla-sabian-calculator@v1.0.0/dist`
   - Klaviyo embedded form ID: from step 2
   - Source code link: `https://github.com/USERNAME/gamla-sabian-calculator`
   - Colours: leave the defaults. They were sampled from gamlahealing.com (background #FDFCFE, text #4A4560, purple band #6760AF, button #7F77DD). Fonts come from your theme automatically.
   - Save.

## 5. Test, then go live (15 min)

Preview the hidden page on desktop and phone:

- [ ] The Oprah example loads by itself within a few seconds
- [ ] Your own chart gives Gemini 14° Ascendant, Aquarius 23° Sun, Pluto in Scorpio in the 6th
- [ ] Unknown birth time hides houses, Ascendant and Midheaven
- [ ] Tromsø shows the Whole Sign note
- [ ] Article links open the right articles
- [ ] The Klaviyo form appears and a test email arrives in the list
- [ ] Fonts and colours match the rest of the site

Then set Visibility to **Visible**, add the page to the main menu, and tell Claude it is live so the article-linking step can start.

## Updating later

Change the source, run `reference/build_web.sh`, upload, tag a new release (`v1.0.1`), and change the version in the theme setting. A new tag guarantees every visitor gets the new files at once; jsDelivr caches tagged versions permanently.
