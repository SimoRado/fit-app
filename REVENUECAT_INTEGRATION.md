# RevenueCat Test Store integration

## Scope

This is a temporary, development-only subscription screen. It does not lock fitness features or move records from SQLite or Convex. RevenueCat `CustomerInfo` supplies subscription status; no local premium flag or subscription database was added.

## Dependencies and files

- `react-native-purchases` 11.0.0: official RevenueCat React Native SDK.
- `expo-dev-client` 58.0.18: native development build for Test Store purchases.
- `src/state/subscriptions.tsx`: Clerk identity, RevenueCat lifecycle, offerings, customer info, purchase and restore.
- `src/services/subscriptionLogic.ts`: package and entitlement selectors.
- `src/app/premium-test.tsx`: temporary paywall.
- `src/app/(tabs)/profile.tsx`: temporary entry point.

## Configuration

`.env.local` is ignored by Git and has `EXPO_PUBLIC_REVENUECAT_TEST_KEY`, the public Test Store SDK key. The example file contains placeholders only. Never place a RevenueCat secret key in Expo. `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` can be set after verifying the entitlement identifier in the RevenueCat dashboard. The code rejects a non-`test_` key and disables RevenueCat configuration in release builds. RevenueCat's own release-build Test Store key safeguard remains in place.

The exact RevenueCat Offering, product, package, and entitlement IDs could not be inspected because dashboard browser control stopped before reading the project. They are not hardcoded. On a development build, the screen displays the current Offering ID, weekly/monthly package IDs, actual store prices, and active entitlement IDs. Until an entitlement ID is verified, an active entitlement is labeled **ID unverified** rather than Premium, and further purchases are disabled; set the verified ID before feature gating or production.

## Clerk identity

The provider waits for Clerk to restore the session, then configures RevenueCat with the Clerk `userId`. A later account signs in with `Purchases.logIn(userId)` directly. The UI clears old customer information immediately when Clerk changes, and purchase/restore checks that the current RevenueCat App User ID still equals the Clerk ID. Signed-out users cannot open the protected screen. RevenueCat stays configured under the previous identified ID while signed out, but its information is not rendered and no purchase is possible. No anonymous purchase account is created.

**Dashboard account safety:** Confirm the project's restore behavior before testing two unrelated Clerk accounts on one device. RevenueCat's default restore behavior can transfer store purchases between identified users. This implementation does not call restore automatically or switch via an anonymous ID.

## Run and test on Android

1. Keep the Test Store key in `.env.local` and sign in through Clerk.
2. Build a native development app: `npx expo run:android` with the Redmi Note 11 connected for USB debugging, or configure EAS and run `npx eas-cli@latest build --profile development --platform android`.
3. Start Metro with `npx expo start --dev-client`, open the installed development app on the phone, then go to **Profile → Premium — Test Subscriptions**.
4. Check that the current Offering and both weekly/monthly options load with real prices. Select Weekly, press Subscribe, and complete the RevenueCat Test Store flow yourself. Verify **PREMIUM ACTIVE** and the active entitlement ID. Repeat with Monthly using an appropriate authorized test account or after the weekly test expires. Do not confuse Expo Go preview mode with a real purchase.
5. Tap Restore Purchases and verify the returned status. Sign out, then sign into a different authorized Clerk test account and verify that the previous customer's status is not displayed. Do not restore a purchase under a second user until the dashboard transfer behavior is confirmed.

## Known limits and production work

The dashboard IDs and native purchase flow are not yet verified. Expo Go uses SDK preview behavior and cannot validate actual transactions. Network errors are shown, and cached CustomerInfo may remain visible with a warning until RevenueCat reconnects. Test Store transactions are simulated development transactions, never real billing. Before production: verify the exact Premium entitlement, confirm account transfer/restore policy, configure platform store products and public platform keys, replace the development-only key selection, add store review disclosures and final paywall design, and test on physical Android and iOS builds. Do not ship a Test Store key.
