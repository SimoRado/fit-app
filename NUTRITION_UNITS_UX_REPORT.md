# Nutrition logging and measurements

## Changes

- `src/ui/NutritionSheets.tsx`: Removed the food entry date picker. New entries use the Nutrition calendar's selected day; edits keep the entry's original day. The selected meal remains available and is saved with the entry. Added a connected two-option unit control, More units, decimal input, live nutrition preview, and an immediate save guard.
- `src/core/foodUnits.ts`: Added quantity parsing, exact mass conversions, US volume definitions, and conversion through the selected food's verified catalog serving weight.
- `src/data/foodCatalog.ts`: Added an indexed lookup for one food when restoring an edited entry's serving metadata.
- `src/data/nutrition.ts`: Stores original quantity and unit in the existing account-local `preferences` table, in the same transaction as the food entry; removes this metadata when the entry is deleted. The original `grams` and nutrient snapshot remain canonical. No schema or Convex change was needed.
- `src/state/app.tsx` and `src/app/(tabs)/profile.tsx`: Added a Metric / US customary preference to Profile, defaulting to Metric and persisting in the existing account preferences.
- `tests/food-units.test.ts` and `tests/performance-ux.test.ts`: Added conversion, preference, date-flow, and legacy UI contract coverage; updated the old test that required a date field in the food sheet.

## Catalog evidence

Inspected the bundled full SQLite catalog (`326,759` foods) and starter catalog. The `foods` table contains ID, name, category, nutrition per 100 g, `serving_name`, `serving_quantity`, `serving_grams`, and `serving_json`. `serving_json` commonly provides one `common` and one `metric` representation of the same serving, not an independent set of household measures. In the full catalog, 282,641 rows have positive serving quantity and gram weight; 31,227 weighted `cup`, 13,201 `tbsp`, 3,672 `tsp`, 336 `fl oz`, and 37 `mL` rows are present. These are row counts, not guarantees that every food in those categories can use volume.

Examples from actual rows:

| Food row | Catalog serving | Result |
| --- | --- | --- |
| Whole Milk | 1 cup, no gram weight | Mass only; volume cannot be justified from this row. |
| 1% Low-Fat Milk | 1 cup = 244 g | Mass and volume available for this exact row. |
| Olive Oil | 1 tbsp = 14 g | Mass and volume available. |
| Paprika | 1 tsp = 2.3 g | Mass and volume available. |
| Table Salt | 1 tsp = 6 g | Mass and volume available. |
| All-Purpose Flour | 1 cup = 125 g | Mass and volume available. |
| Sugar | 1 tsp = 4 g | Mass and volume available. |
| Rice, Cooked | 1 cup = 160 g | Uses this cooked row's weight. |
| White Jasmine Rice by Wegmans | 0.25 cup = 45 g | Uses this distinct product row's weight; preparation state is not inferred. |
| Chicken Breast | No exact plain row with a verified household serving found | Mass only for plain entries; some specific chicken breast products have weighted pieces. |

## Conversion and compatibility

Mass uses exact grams per kilogram, international avoirdupois ounce, and pound. Volume uses US cup, tablespoon, teaspoon, and fluid ounce definitions. A volume-to-mass conversion is offered only when the **selected catalog row** has a positive serving quantity and gram weight for a recognized volume measure. A weighted piece or slice is available only for its exact food row. No density is inferred from a food name, and raw and cooked rice are never treated as interchangeable.

The selector limits related volume choices by the catalog serving type: a teaspoon reference offers teaspoons and tablespoons, while a cup reference offers cups, milliliters, and tablespoons. Mass remains available through More units. This avoids presenting every volume unit for every food.

Reference factors: [NIST mass conversion table](https://www.nist.gov/system/files/documents/2024/01/14/NIST%20HB%2044%202024%20Appendix%20C%20General%20Tables%20of%20Units%20of%20Measurement.pdf) and [NIST US volume conversion table](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9).

Nutrition is calculated from unrounded equivalent grams against the food's per-100-g values. Switching units retains that canonical amount, even though the visible quantity is formatted for entry. Existing logs without unit metadata stay in grams. Editing keeps the saved nutrient reference rather than replacing it with a possibly changed catalog value. The preference and entry unit metadata live in the existing per-account database and participate in its existing optional preference backup behavior.

The full catalog is not loaded into JavaScript memory for unit selection. Search remains the existing indexed query; one lookup fetches serving metadata for an edited entry. The existing background catalog preparation, SQLite write serialization, and save behavior remain in place.

## Verification and limitations

- TypeScript: passed (`npx tsc --noEmit --pretty false`).
- ESLint: passed (`npm run lint`).
- Full tests: 41 files passed, 285 tests passed, 1 skipped (`npx vitest run --maxWorkers 2 --no-file-parallelism`). An obsolete test asserting a date field in the food sheet was updated to assert its absence instead.
- Redmi: `adb devices` reported no connected device during this task. The installed standalone APK contains the previous JavaScript bundle. No APK was built, installed, or used for a claim of device validation.
- The connected two-option control and both Volt appearances still need device visual review. A JavaScript update must reach a compatible development client or a later preview APK before the Redmi can exercise this new flow.
- Some catalog entries, including the exact `Whole Milk` row, provide a serving label without weight. Those entries intentionally omit volume units. Custom foods and old entries with no verified serving metadata offer mass units only.
- A manual legacy entry with no recorded grams now keeps its portion blank while editing; it is never silently assigned 100 g.
- Catalog `cup` labels do not carry a regional volume definition. The app explicitly presents them as **US cup** and uses the US volume standard. This should be checked against any non-US source labels before broader international deployment.
- A temporary decompressed catalog audit copy is in the Git-ignored `builds/local/food-catalog-audit.sqlite` (313,692,160 bytes). Automated cleanup was blocked by the command execution policy; it contains only the bundled public catalog and can be removed locally when permitted.
