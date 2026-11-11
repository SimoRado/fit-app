# Cubyfit food catalog release

## Local build

The original TSV is read only. Use a new `vN` for each release; the builder
refuses to overwrite existing release files.

```powershell
python scripts/build-food-catalog.py --input C:\Users\User\Downloads\opennutrition_foods.tsv --output build/catalog --version v4
python scripts/verify-food-catalog.py --input C:\Users\User\Downloads\opennutrition_foods.tsv --manifest build/catalog/manifest-v4.json
```

`build/catalog/` contains reproducible release SQLite files, gzip archives,
analysis, and a manifest with checksums. The checked-in
`assets/foods-full-v4.sqlite.gz` is the verified v4 archive used by standalone
Android and iOS builds. It is 85,427,860 bytes and remains under GitHub's
100 MB per-file limit. Do not replace it in place: generate a new immutable
`vN` archive, verify its checksums, then update the source, manifest, and tests
together.

## Before publishing

1. The supplied dataset package includes `LICENSE-ODbL.txt` and OpenNutrition's
   **modified** `LICENSE-DbCL.txt`. Copies are in `src/data/catalog/`. Publish
   both with `OPENNUTRITION_NOTICE.md` and the catalog files. Keep the
   OpenNutrition and Open Food Facts attributions wherever food data appears,
   in the app store listing, and on any website or marketing material.
2. Confirm the approved HTTPS origin for the authenticated Cloudflare Catalog
   Gateway. Do not configure the app to use an R2 public URL directly.
3. Add the approved HTTPS origin to a copy of the manifest:

```powershell
python scripts/prepare-food-manifest.py --manifest build/catalog/manifest-v4.json --base-url https://assets.example.com --output build/catalog/manifest-public-v4.json
```

4. Upload these exact immutable files to the dedicated R2 bucket:

| Local file | R2 object key |
| --- | --- |
| `build/catalog/foods-full-v4.sqlite.gz` | `nutrition/full/foods-full-v4.sqlite.gz` |
| `build/catalog/manifest-public-v4.json` | `nutrition/manifest-v4.json` |
| `src/data/catalog/LICENSE-ODbL.txt` | `nutrition/LICENSE-ODbL.txt` |
| `src/data/catalog/LICENSE-DbCL.txt` | `nutrition/LICENSE-DbCL.txt` |
| `src/data/catalog/OPENNUTRITION_NOTICE.md` | `nutrition/OPENNUTRITION_NOTICE.md` |

The full gzip object must be served as a gzip file (`Content-Type:
application/gzip`) without `Content-Encoding: gzip` for a future optional
catalog update flow. Versioned files receive an immutable cache policy. Publish
the manifest last, after the object and license notices have been checked.

Configure `EXPO_PUBLIC_CATALOG_GATEWAY_URL` only for a future explicit catalog
update flow. Normal nutrition startup and food search never request the
manifest, Worker, R2, or Clerk. The app does not read a direct R2 manifest URL
or use a public download fallback. R2 upload keys must never enter the app or
`EXPO_PUBLIC_*` configuration.

## v4 development distribution

The full v4 gzip, the two license files, the notice, and
`nutrition/manifest-v4.json` were uploaded to `cubyfit-assets` with create-only
S3 writes. The manifest URL for development testing is
`https://pub-344481ff25f64697b40d1190b71a57fb.r2.dev/nutrition/manifest-v4.json`.
The app uses the authenticated Worker route. The ignored local `.env.local`
configures `EXPO_PUBLIC_CATALOG_GATEWAY_URL`; `EXPO_PUBLIC_CATALOG_MANIFEST_URL`
is not used. The R2 `r2.dev` object URL remains a direct public-access bypass
until the bucket setting is disabled after successful device validation. The
`r2.dev` endpoint is rate-limited and is not the production distribution
address. Set a production Worker custom-domain URL before release.

The v4 manifest is immutable. Publish a new versioned manifest for future
catalog updates and change the configured manifest URL only after verifying
the new catalog. Add the OpenNutrition and Open Food Facts attribution to the
app store listing before distributing the app there.

`exercises/images/` is reserved. This release has no exercise media.

## Mobile behavior

The complete v4 archive is a static Expo asset. On first Nutrition launch the
app streams it from the installed binary into a staging SQLite file in app
document storage, verifies the archive SHA-256, SQLite SHA-256, integrity,
schema, and food count, then atomically promotes it and records its file
metadata. Subsequent launches reuse the validated 313,692,160-byte database
without hashing it again unless its file metadata changes. The archive is not
copied into document storage, so the persistent catalog uses one full SQLite
copy only. An interrupted initialization leaves only a staging file, which is
discarded before a safe retry. If storage is insufficient or validation fails,
the bundled starter remains available and personal data is unaffected.

The catalog is shared on the device. Meals, quantities, custom foods, and
nutrition history remain in the existing Clerk-account SQLite files and follow
the existing Convex backup-consent setting.

Use a standalone Android or iOS build to verify first-launch extraction; a
Metro session proves JavaScript behavior but cannot prove standalone startup.
