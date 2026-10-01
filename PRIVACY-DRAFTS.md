# Privacy drafts for the Sabian calculator (v1.1)

Drafted by Claude on 1 October 2026. **Not legal advice.** Sylvain chose to launch with these drafts without a legal check; the points marked **Risk** are the ones a lawyer would most likely question.

## 1. Consent text on the form (already in the page)

> Subscribe me to the Gamla Healing newsletter and send me my Sabian chart. To do this, Gamla Healing stores my email address, birth details and Sabian placements with its email provider, Klaviyo. I can unsubscribe at any time, and my data is deleted on request. Privacy policy.

The box is unticked by default and must be ticked to submit.

**Risk: tying the free chart to the newsletter.** Under the GDPR, consent must be "freely given", and making a free item conditional on newsletter consent is contested (Article 7(4)). Many EU businesses do it ("download in exchange for subscribing"), and it is stated plainly here, which helps. The cautious alternative is two boxes: one required to receive the chart, one optional for the newsletter. That would mean sending the chart email as a non-marketing message, which needs a different Klaviyo setup. Worth asking about when you do get a legal check.

## 2. Paragraph for the Shopify privacy policy

Add under a heading such as **Sabian Symbol Calculator**:

> **Sabian Symbol Calculator**
>
> Our Sabian Symbol Calculator works in your web browser. The birth date, time and place you enter are used to calculate your chart on your own device and are not sent to us when you simply use the calculator.
>
> If you ask to receive your full Sabian chart by email, we collect your email address, your birth date, birth time (if known) and birth place, and the Sabian placements calculated from them. We use this data to send you your chart and our newsletter, on the basis of your consent (Article 6(1)(a) GDPR). Your chart link contains your birth details so that the page can display your chart; anyone you share the link with can see them.
>
> This data is stored by our email service provider, Klaviyo, Inc., which acts as our data processor. Klaviyo is based in the United States; transfers are covered by [the EU–US Data Privacy Framework / the European Commission's Standard Contractual Clauses]*.
>
> We keep this data while you are subscribed. If you unsubscribe, we delete your birth details and Sabian placements within 30 days, and your email address within 12 months unless you subscribe again. You can withdraw your consent and unsubscribe at any time through the link in every email, and you can ask us to access, correct or delete your data by writing to [contact email]. You also have the right to lodge a complaint with a data protection authority; in Spain this is the Agencia Española de Protección de Datos (aepd.es).

\* **To fill in:** check which mechanism Klaviyo currently uses (its Data Processing Agreement and the Data Privacy Framework list at dataprivacyframework.gov). I could not verify Klaviyo's current certification.

## 3. What you commit to by publishing this

- **Deletion within 30 days after an unsubscribe:** set up a monthly reminder to delete the `sabian_*` properties of unsubscribed profiles. Klaviyo can show unsubscribed profiles as a segment; deletion is manual unless automated later.
- **Requests by email:** answer access or deletion requests within one month.
- **Accept Klaviyo's Data Processing Agreement** in your Klaviyo account if you have not already.

## 4. Points to raise if you get a legal check later

1. Coupling the chart to the newsletter (section 1).
2. Whether birth time and place count as more sensitive than ordinary contact data (best understanding: no, they are not special-category data under Article 9).
3. The international transfer wording for Klaviyo.
4. Whether your Spanish autónomo registration needs any additional notice wording.
