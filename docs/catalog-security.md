# OpenNutrition catalog security

## Current status

The v4 object is currently reachable through the bucket's public `r2.dev`
development URL. Anyone who obtains that URL can download the 85,427,860-byte
archive without signing in; the URL is replayable and the app's local limits do
not protect R2 from direct requests. Cloudflare documents `r2.dev` as a
development endpoint with variable throttling, not production access control.
Keep it enabled only while the authenticated gateway is being tested.

The local app now supports an authenticated Worker gateway. Production builds
fail closed when `EXPO_PUBLIC_CATALOG_GATEWAY_URL` is not configured. The test
Worker is deployed at
`https://cubyfit-catalog-gateway.radouanmohammed654.workers.dev`, and local
development is configured to use it through ignored `.env.local`. The
`cubyfit-assets` public development URL remains enabled. Live checks confirmed
that unauthenticated, expired-token, and unknown-key requests are denied, and
the unsupported method is rejected. A valid signed-in Clerk token was not
available during deployment, so authenticated manifest/authorization, full
transfer and resume, and cross-account tests remain pending before the public
R2 URL can be disabled.

The mobile app now fails closed when the authenticated gateway origin is
missing or invalid. It no longer reads `EXPO_PUBLIC_CATALOG_MANIFEST_URL` or
uses a manifest's direct R2 URL as a development fallback. The complete v4
archive is bundled with the app and installed locally on first Nutrition use,
so normal food search never calls the gateway, R2, or Clerk. The local
environment keeps the gateway origin only for future explicit catalog updates;
the old direct manifest URL setting was removed.

## Controls implemented

### App

- The installed full catalog is SHA-256 and SQLite integrity checked during
  installation and whenever its persisted file metadata changes. Routine
  startup checks file size and modification time, schema version, and row
  count without hashing the 314 MB file. An intact matching version is reused
  without requesting a new authorization or preparing the starter asset first.
- The bundled complete archive is streamed from the installed app into one
  verified SQLite file in app document storage, apart from account-specific
  meal databases. Account changes do not trigger catalog downloads or
  extraction. The compressed archive is not copied to document storage.
- A single in-process promise serializes concurrent installs. A valid existing
  compressed file is reused. An explicitly paused transfer stores Expo's
  resumable state without its Authorization header; a fresh Clerk token is
  requested when resuming.
- Downloads are checked for compressed and SQLite checksums, SQLite integrity,
  schema compatibility, and row count before the active catalog pointer is
  changed. Failed installs leave the last working catalog and personal meal
  records in place. A failed startup validation keeps the suspect file for
  explicit recovery and opens the bundled starter catalog. A read failure
  triggers checksum and full integrity checks before falling back.
- Manifest checks are cached for 15 minutes. Failed checks back off from 1
  minute up to 6 hours; failed downloads back off from 30 seconds up to 30
  minutes (or honor a shorter server `Retry-After`). Repeated large downloads
  require confirmation. A manual check can refresh the manifest after one
  minute. Account changes pause an active transfer, and a resumed task uses
  Expo's `resumeAsync()` with a fresh Clerk token.

### Gateway

`cloudflare/catalog-gateway/src/index.ts` contains a Cloudflare Worker backed
by the `cubyfit-assets` R2 binding and a SQLite-backed Durable Object. The
Worker validates Clerk RS256 JWT signatures using the configured Clerk JWKS,
checks issuer, `aud=convex`, subject, expiry and not-before time, and derives
the account key from the verified token subject. It does not accept a client
supplied account identifier. The Clerk issuer is the public dev issuer already
used by this app; production Clerk environments must change the Worker
configuration before deployment.

The Worker serves only the configured v4 manifest and exact v4 object key.
It has no upload or delete route. The R2 bucket binding remains server-side;
no R2 access key is required by the Worker or included in the mobile app.
Clerk JWKS fetches are cached for 10 minutes, coalesced within an isolate,
and forced refreshes after an unknown key are throttled to one per 30 seconds
per isolate to reduce forged-key request amplification.
Every catalog transfer requires a current Clerk JWT and a server-issued
account session. A session ID is not a one-use URL: the signed-in account can
reuse it to resume an interrupted transfer while it remains active. The
gateway allows HTTP byte ranges, allows at most twice the archive size to be
served during that session, expires sessions after 48 hours, and rejects a
second simultaneous stream for that account. A completed session cannot be
replayed. Sharing a live JWT and session can still share access until those
limits expire.
Active streams refresh their lease about every 30 seconds. If a finish update
is lost, the reserved bytes remain charged to the session until it expires;
the five-minute stale-lease recovery therefore cannot refund bytes that may
already have been delivered. This can exhaust a session early after a network
failure, but keeps the configured byte allowance bounded.

The default configurable account limits in `wrangler.jsonc` are:

| Control | Default |
| --- | ---: |
| New full-catalog authorizations | 2 per rolling 24 hours |
| New full-catalog authorizations | 5 per rolling 7 days |
| Authorization requests | 10 per rolling hour |
| Manifest requests | 30 per rolling hour |
| Transfer starts | 20 per rolling hour |
| Active transfer sessions | 1 per account |
| Session lifetime | 48 hours |
| Bytes served within one session | 2 times the configured archive size |
| Edge IP requests | 120 per 60 seconds per Cloudflare location |

The account counters and stream lease are serialized by one Durable Object per
verified account, so parallel requests and additional devices share the same
quotas. Interrupted retries reuse the existing session and do not consume a
new-catalog allowance. Hourly request and transfer limits can still reject
very frequent retries temporarily.

The IP binding is Cloudflare's built-in Workers Rate Limiting API. Its counters
are approximate and local to a Cloudflare location, and users behind the same
NAT share that IP threshold. The app's expected request volume is far below the
default threshold, but this is a coarse edge guard, not a global hard quota.
Authoritative per-account limits remain in the Durable Object. IP values are
passed only to Cloudflare's rate-limit binding; the Worker does not persist or
log them.
Anonymous and invalid-token requests are rejected before Durable Object and
R2 reads, but still consume Worker requests and rate-limit checks. Unknown-key
tokens can also cause a bounded Clerk JWKS refresh. Distributed traffic can
therefore still exhaust a Free Worker allowance; the current public `r2.dev`
URL separately bypasses the gateway until real-device validation is complete.

## Cloudflare rollout checklist

1. Verified the saved R2 endpoint account matches Wrangler's authenticated
   account, and `cubyfit-assets` is present in that account. Wrangler read the
   v4 object (85,427,860 bytes); its SHA-256 matched the local v4 manifest.
   The v4 manifest object also reports 326,759 foods. The gateway pins these
   values in `wrangler.jsonc`; a mismatch fails closed.
2. Checked all Worker scripts in the account (none existed); namespace ID
   `83140001` had no existing binding conflict.
3. Deployed the test Worker and SQLite-backed Durable Object to the matched
   account. For a later redeploy, run from the project root:

   ```powershell
   npx wrangler@latest deploy --config cloudflare/catalog-gateway/wrangler.jsonc
   ```

   Deployment created the Worker and SQLite-backed Durable Object namespace.

The public R2 objects contain the catalog and license/attribution files, not
credentials. The gateway source contains the public Clerk issuer and object
names only. It uses an R2 Worker binding, so it does not require the bucket's
S3 access key or secret. The mobile app receives only the public gateway URL
and a short-lived Clerk bearer token; the downloader strips Authorization
headers from persisted resume state. No catalog request was added to Convex.
Existing Convex personal-data synchronization validates Clerk identity and
record ownership, but does not impose general request throttles. It remains
separate from the catalog quotas in this change.
4. The local `.env.local` now contains the public test gateway URL; it is ignored
   by Git. Configure the EAS development environment separately only if an EAS
   development build is needed. This URL is public configuration, not a
   credential. The current EAS build log did not contain this variable, so
   builds that need the bundled JS to download catalogs must set it in EAS.
   Metro development uses the ignored local setting. Do not place R2 S3 keys in
   app or Expo variables.
5. Still test signed-in manifest retrieval, authorization limits, a complete
   download, range resume, and cross-account isolation on a development build.
   Only after these checks succeed, disable **Public Development URL** access
   for `cubyfit-assets`. Leaving it enabled keeps the direct-download bypass
   open even when the Worker works.
6. Production should use a Worker custom domain and a private R2 bucket. Cloudflare
   recommends Workers custom domains/routes over `workers.dev` for production.
   A Cloudflare-managed zone/domain is required before a custom domain can be
   attached; no domain is configured or purchased by this change. The bucket's
   public custom-domain delivery mode should remain off if the Worker is the
   only public path. After the custom domain and WAF are verified, disable the
   Worker's `workers.dev` route so it cannot bypass domain-level WAF rules.
7. Once the production domain is known, set
   `EXPO_PUBLIC_CATALOG_GATEWAY_URL=https://<approved-gateway-domain>` in the
   production build environment. Keep the manifest URL configurable in the
   app; the gateway returns the approved catalog URL under its own origin.
8. Add a WAF rate-limit rule on the custom-domain gateway for bursts against
   `/v1/manifest`, `/v1/authorize`, and `/v1/catalog/full/*`. The current plan
   and zone plan are not verified. WAF is not available on the `r2.dev`
   development URL; Cloudflare lists a single WAF rate-limit rule on Free and
   more on paid zone plans. Choose a threshold that does not penalize shared
   mobile-network IPs. Do not use IP-only WAF limits as the account quota.
9. In Cloudflare Billing > Billable Usage, review/create a budget alert if the
   account is Pay-as-you-go. Alerts notify; they do not pause services or cap
   spending. Review product usage notifications separately.

Do not remove the existing `r2.dev` URL until steps 3–5 have passed. Once it is
disabled, the Worker remains the only download route and its R2 binding can
continue reading the private bucket.

## Cost and capacity notes

The full SQLite database installed on a device is 313,692,160 bytes (about
0.314 GB); the R2 gzip object is 85,427,860 bytes (about 0.085 GB). R2 stores
the compressed object, manifest, and small notices/licenses, so storage remains
far below R2's 10 GB Standard free tier. One release upload uses only a few
Class A operations. Each full download normally performs one R2 Class B object
read; each manifest request performs another R2 read. R2 egress is free,
including the 85 MB transfer.

At 100,000 complete downloads, the archive transfer is about 8.54 TB, R2
egress remains $0, and roughly 100,000 archive reads plus manifest reads are
below the 10 million monthly Class B free allowance. With the gateway, each
ordinary first install uses approximately three Worker requests (manifest,
authorization, archive) and four Durable Object requests (quota/session
checks and transfer begin/finish), plus roughly one lease heartbeat per 30
seconds of active streaming, excluding retries. For
100,000 first installs in one day, that is about 300,000 Worker requests and
at least 400,000 Durable Object requests: above their respective Free daily
limits. Streaming heartbeats add to the Durable Object total.
On Workers Paid, 300,000 Worker requests and 400,000 Durable Object requests
are within the current monthly included request allotments, but the plan has a
$5/month minimum. The account's actual plan, billing alerts, and usage remain
unverified. Cloudflare Free overages can cause requests to fail; paid usage
and alerts are not a spending hard cap.

## Verification coverage and limits

`tests/catalogGateway.test.ts` covers signed and tampered/expired tokens,
JWKS failure, parallel authorizations, account-specific quotas, two users
behind one IP, edge IP throttling/failure, one active stream, interrupted
range retry, cross-account session denial, stale-stream byte reservations,
lease heartbeats, replay denial after completion, restricted paths, and the
rewritten gateway manifest URL. `tests/catalogProtection.test.ts` covers
manifest cooldown/backoff, repeat-download confirmation, installation-record
reuse, and installed-version skip logic. Existing nutrition tests cover meal
snapshots, persistence after reopen, account scoping, and sync ownership.

The test Worker was redeployed with the lease fix as version
`0289ca02-7ca6-4e71-8ae2-35406f79335d`. Live anonymous requests to the
manifest, authorization, and catalog routes returned HTTP 401; the public R2
development object still returned HTTP 200 and 85,427,860 bytes. TypeScript,
ESLint, all 166 automated tests, and Android bundle export passed before the
bundled-full change. The next standalone export must contain the 85,427,860-byte
full archive and must not make a normal nutrition request to R2.
Expo Doctor reports 13 SDK 58 patch-version mismatches and the existing
prebuilt Android Sentry configuration warning. The EAS build log shows Expo
Doctor exited 1 but Gradle subsequently completed successfully; that EAS build
environment did not include `EXPO_PUBLIC_CATALOG_GATEWAY_URL`. This machine has
no connected Android device or running Metro server, and no valid disposable
Clerk session was available. Authenticated Cloudflare quotas, gateway downloads
and range resume, true restart/offline behavior, and Android download
performance remain unverified on a real device. The direct `r2.dev` bypass
remains active until those checks pass.

On desktop SQLite, the full catalog's ranked FTS query returned up to 90
candidates with warm medians of about 0.2 ms for `msemen`, 2 ms for
`couscous`, 8 ms for `chicken breast`, 16 ms for `rice`, and 6 ms for `eggs`
and `oats`. The indexed empty-query browse measured about 0.08 ms, versus
roughly 62 ms for the previous full-table ordering. These are local desktop
measurements; Android cold-start and warm-search timing still needs a device.
The final Android export includes the 11,898,880-byte starter asset and excludes
both full-catalog files.
