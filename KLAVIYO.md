# Klaviyo setup for the Sabian calculator (v1.1)

How it works: the visitor sees their Sun, Moon and Ascendant for free. To get the rest, they enter their email and tick the consent box. The page then sends three things to Klaviyo:

1. **Subscription** to the list you choose (with that list's double opt-in).
2. **Profile properties** on their contact, used by the emails:

| Property | Example |
|---|---|
| `sabian_chart_link` | `https://www.gamlahealing.com/pages/sabian-calculator#chart=eyJ2Ijox...` |
| `sabian_birth_date` | `1990-02-11` |
| `sabian_birth_time` | `12:21` or `unknown` |
| `sabian_birth_place` | `Chambéry, France` |
| `sabian_sun` / `sabian_moon` / `sabian_ascendant` | `Aquarius 23° A Big Bear Waving Its Paws` |
| `sabian_placements` | list of all 14 placements |
| `sabian_signup_date` | `2026-10-01` |

3. **An event** called `Requested Sabian Chart`, carrying the same chart link, so a returning subscriber who calculates a second chart (a partner's, a child's) also gets an email.

The chart link opens their full chart on your site with a **Download as PDF** button. The birth details sit after the `#` in the link, which browsers never send to Shopify, so they do not end up in your Shopify logs or analytics.

> Not verified yet: I built the requests from Klaviyo's public documentation but could not test against a real Klaviyo account. Do the test in step 5 before going live.

## 1. The list

Audience → Lists & segments → Create new → List: `Sabian Chart Subscribers`.
In its settings, set **double opt-in** on. Copy the **list ID** (in the list's settings or its URL, 6 characters).

You can include this list in your normal newsletter sends, so these people get your newsletter like everyone else.

## 2. Your public API key

Settings → API keys → **Public API key / Site ID** (6 characters). Never use or share the private key.

## 3. Flow 1: first chart (new subscribers)

Flows → Create flow → Build your own → name `Sabian chart: first request`.

- **Trigger:** List → *When someone is added to this list* → `Sabian Chart Subscribers`. (With double opt-in, this fires after they confirm.)
- **Action:** Email, sent immediately. Copy below, with `{{ person|lookup:'sabian_chart_link' }}` as the button link.
- Set it **Live**.

## 4. Flow 2: another chart (people already on the list)

Flows → Create flow → Build your own → name `Sabian chart: repeat request`.

- **Trigger:** Metric → `Requested Sabian Chart` (it appears in the list after the first test submission).
- **Flow filters:**
  - *Has been added to list `Sabian Chart Subscribers`… at least once over all time*
  - *Has been added to list `Sabian Chart Subscribers`… zero times in the last 1 day*. This stops brand-new subscribers getting both emails.
- **Action:** Email, sent immediately. Same copy, but the button link is `{{ event.sabian_chart_link }}`, so it always points to the chart they just calculated.
- Set it **Live**.

## Email copy (brand voice, no em dashes)

**Subject:** Your Sabian chart is ready
**Preview text:** Every placement in your chart, with its symbol and its article.

> Hello,
>
> Your Sabian chart is ready. It holds the Sabian symbol of your Sun, Moon, Ascendant, Midheaven, every planet from Mercury to Pluto and both lunar nodes, with a link to the full article for each degree, and the four soul-direction paragraphs for your Pluto and North Node.
>
> **[Open my Sabian chart]** ← button, link as above
>
> On the page, press **Download as PDF** to keep a copy. Bookmark the page to come back to it at any time.
>
> Each Sabian symbol is one of 360 images, one for every degree of the zodiac. Read slowly. The symbol that surprises you is often the one worth staying with.
>
> Sylvain
> Gamla Healing

(Flow 1 version can add one line at the top: *Thank you for confirming your email.*)

## 5. Test before going live

With the page still hidden, use two email addresses of your own:

1. **New address:** submit a chart → confirmation email arrives → confirm → "Your Sabian chart is ready" arrives → the button opens the full chart → **Download as PDF** works.
2. **Same address again, different birth details:** submit → the repeat email arrives once, with the new chart.
3. In Klaviyo, open the test profile and check the `sabian_…` properties are there.

If step 1's email never arrives, check Flow 1's trigger list and that the flow is Live. If the properties are missing, tell Claude, since the request format may need adjusting.
