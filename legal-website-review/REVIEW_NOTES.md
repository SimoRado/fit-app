# Cubyfit legal website review copy — 18 November 2026

This is a source review copy of the clean Git project at `C:\fit-legal` (`SimoRado/cubyfit-legal`). The original project and live Vercel deployment were not modified. Copy only the reviewed source changes into the actual project after publication blockers are resolved; the review copy's `next.config.ts` adds a local `turbopack.root` solely to build from beneath `C:\Fit`.

## Source changes proposed for the website

- `src/app/privacy/page.tsx`: drafted policy, operator identities, data inventory, local/backup distinction, provider and retention limits, rights, age and transfer review markers.
- `src/app/terms/page.tsx`: drafted terms, intended illustrative prices/trial with store checkout controlling actual offers, cancellation and unresolved governing-law/support fields.
- `src/app/delete-account/page.tsx`: precise in-app steps, deletion scope, offline/status-expiry limitation and clearly pending outside-app request channel.
- `src/components/LegalDraft.tsx` (new): accessible section outline, common draft warning and navigation to home/other legal pages.
- `src/app/globals.css`: small typography, lists, anchors, scroll margin and mobile outline styles; existing color system and system font retained.

The site's existing header/footer links already navigate among home, the three legal pages and support. Robots and per-page metadata keep draft documents unindexed. The `/contact` page remains an explicit placeholder until a working address exists.

## Evidence and publication blockers

1. DNS MX points to `route1/2/3.mx.cloudflare.net` and TXT includes Cloudflare's SPF include. This suggests Cloudflare Email Routing, **not** a verified `support@cubyfit.app` mailbox or forwarding rule. Check custom addresses, verified destination, monitoring and a real receipt/reply test. Establish privacy/deletion aliases and an authorized identity-verification/manual-deletion process before publishing the external request path. Only then commit to a seven-calendar-day acknowledgement target.
2. The current app validates birth dates in a 0–120 range **after** account authentication and does not screen out under-13 users. No age-driven ad-request treatment was found. Clerk, Convex, RevenueCat and Sentry initialize independently of UMP. The proposed 13+ worldwide policy therefore requires a neutral age screen and SDK/advertising design review, region-specific parental consent decisions and store target-audience configuration before release. An App Store 13+ content rating does not itself implement account eligibility.
3. Production RevenueCat products, USD prices, annual trial eligibility and exact Pro benefits require store and dashboard verification. The source reads store price strings and does not guarantee a trial. Do not publish the intended $5.99/$59.99/14-day offer as a generally available offer without checking checkout.
4. The deletion job covers the fifteen owner-indexed Convex tables, then matching RevenueCat and Clerk records; the matching device's account SQLite file is removed after confirmed completion. No separate identifiable business-analytics warehouse was found in source. Sentry, AdMob, Cloudflare gateway state, store records, shared catalog, guest records and provider/OS backups are outside that job. A completed status receipt expires in about 30 days; a device that reconnects later may need manual local clearing.
5. Resolve controller/operator and service contact identity, postal address, legal bases, CNDP/transfer assessment, provider retention periods, age/consent treatment, governing-law clause and actual store terms with qualified review. Reconcile Play Data Safety and in-app UMP privacy-options access with release settings. Replace every bracketed field and `Before publication` note, remove draft notices, and set an actual effective/last-updated date only for the approved published policy.
6. The actual website source and local preview use Arial/Helvetica system fonts; there is no Google Fonts stylesheet, remote font CSS, `@font-face`, third-party tracking script or new font file in the review. No font self-hosting change is needed.

## Checks

- `npm run lint`: passed.
- `npm run build`: passed with Next.js 16.4.6; routes `/`, `/privacy`, `/terms`, `/delete-account`, `/contact` prerendered.
- Local HTTP smoke test: all five routes 200; desktop and 390px mobile layouts inspected in the browser. The mobile outline is height-limited and scrollable; the draft remains readable.
- Live `https://cubyfit.app/privacy` still showed its original placeholder during inspection. No deployment was performed.

Run `npm ci`, `npm run lint`, `npm run build` from this review copy to reproduce checks. The mobile app, DNS, Vercel project, billing and backend were not changed in this work.
