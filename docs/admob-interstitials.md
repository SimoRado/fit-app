# Cubyfit AdMob interstitials

## Configuration

Install `react-native-google-mobile-ads` with `npx expo install react-native-google-mobile-ads`. The Expo config plugin is in `app.config.js`. It reads the two Android identifiers from the ignored local `.env.local` file or the corresponding EAS build environment:

| Variable | Purpose | Format |
| --- | --- | --- |
| `GOOGLE_ADMOB_APP_ID` | Android AdMob **App ID** in the generated Android manifest | `ca-app-pub-…~…` |
| `GOOGLE_ADMOB_AD_UNIT_ID` | Android **interstitial ad unit** passed to ad requests | `ca-app-pub-…/…` |

The config validates both formats. These IDs are public identifiers, but the project's convention is to keep environment specific values out of Git. Expo exposes the ad unit through `Constants.expoConfig.extra.admob`; the plugin writes the App ID at native build time. Changing the App ID or adding this native package requires a new APK. A JS update alone cannot add the native module or change the Android manifest.

Android development and internal preview bundles use Google's official interstitial test unit, `ca-app-pub-3940256099942544/1033173712`. Live inventory requires **all** of the following: a non development JS bundle, `EXPO_PUBLIC_ADMOB_PRODUCTION_ADS_ENABLED=true`, `CUBYFIT_ADMOB_BUILD_CHANNEL=production` at build/export time, and a valid configured unit. Leave both switches off for every internal preview. Do not test a live unit on a personal development device. The official test unit is a request unit; the Android App ID remains the Cubyfit App ID in the native manifest.

The native library is linked for iOS builds, but Cubyfit does not request or display iOS ads. The plugin uses Google's published sample iOS App ID solely to keep the linked SDK configured. Add an iOS AdMob app and design its consent and placement separately before enabling iOS production ads. The library's v17 native prerequisites include React Native 0.86+, New Architecture, Android API 24+, and iOS 15.1+.

## Consent and privacy

The manager runs only after a signed in account has a local profile and a resolved free RevenueCat state. It calls UMP `AdsConsent.gatherConsent()` on the safe home/workout list screen, which refreshes consent information and presents Google's form when required. If the refresh fails, it checks UMP's cached `canRequestAds` status. It initializes the Mobile Ads SDK and loads ads only when UMP permits requests. A denied or unknown permission prevents ad requests. The Profile Settings list shows **Ad privacy options** when UMP reports the option is required; opening it pauses ads and checks the new permission before resuming. The app supplies no keywords, meal data, workout records, health metrics, or fitness history as ad request targeting data.

Set up and publish the applicable consent messages in AdMob **Privacy & messaging**. Test regulated geography behavior with UMP test device configuration before release. Review the app's privacy notice and Google Play **Data safety** declarations against the SDK's actual data collection and your regions. In Play Console, declare that the app contains ads. Verify any app ads.txt and AdMob app verification requirements for the release. The SDK and UMP flow alone do not establish legal compliance.

## Eligibility and placement

The existing RevenueCat `CustomerInfo` is the sole Premium source. Any active entitlement for the verified Clerk/RevenueCat account suppresses ads, including when the configured Premium entitlement ID is not yet verified. Unloaded, loading, purchase, restore, error, account mismatch, or otherwise unresolved status suppresses requests and display. A confirmed free state can request ads. Purchase and restore state changes are reflected through the existing subscription provider. No RevenueCat network call is made for each ad opportunity.

The single placement is a newly completed workout after its SQLite transaction succeeds, the completion sheet closes, and navigation returns to Home or workout history. Editing an already completed workout, saving a draft, exercise sets, rest timers, meal logging, tab changes, onboarding, account screens, payments, startup, and app exit do not create an opportunity. If no ad is loaded, navigation continues normally. The manager checks eligibility, consent, foreground state, route, readiness, and cap again at presentation.

The centrally persisted caps are:

- First five minutes after each app launch: no interstitial.
- Eight minutes between actual displays.
- At most three actual displays in any rolling 24 hours.
- An ad older than one hour is discarded and reloaded.

Only the native `OPENED` event records a display. A failed load or show does not consume a cap. One manager owns the interstitial and its listeners. It retries failures with a capped delay and removes the current ad when Premium or unresolved status arrives.

## Subscription release prerequisite

Debug development builds use the existing `EXPO_PUBLIC_REVENUECAT_TEST_KEY`. Every non-debuggable build, including a standalone internal preview, selects `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` (or `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` on iOS). This is necessary because the RevenueCat SDK intentionally crashes if a Test Store key is configured in a release build. A missing production key or a Test Store key in release leaves entitlement unresolved and disables ads. Internal preview still uses the Google test ad unit. Configure the existing RevenueCat project, platform store products, and `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` before enabling live ads. The weekly/monthly products and purchase/restore flow are unchanged.

## Build and verification

Expo Go and an older development client without the three Google Mobile Ads native modules skip ads. The currently installed Cubyfit development client predates AdMob and requires a new native APK. Build a new development client or standalone preview APK; a Metro reload of the old APK cannot add native classes. Do not uninstall the existing installation unless you intend to replace it. The local generated Android project is ignored by Git; maintain signing configuration when making a release build.

Manual test flow (development only):

1. Configure the local IDs and keep the production switches off. Build and install a development APK when ready, then launch its Metro session. Verify a Google **Test Ad** label; never use a live ad unit here.
2. Sign in to a free account with a completed local profile. Confirm the UMP message and Profile privacy option behavior for a test device and relevant geography. Wait five minutes after launch.
3. Complete a workout with a recorded set, then finish and save it. The completion sheet and navigation should finish before the interstitial appears. If an ad has not loaded, the workout should still be saved and the app should continue.
4. Repeat within eight minutes and verify no second ad. Repeat after the interval and check the rolling daily limit. Restart the app and confirm the cap remains.
5. Activate or restore Premium in the existing RevenueCat screen. Confirm that no further ad requests or interstitials occur. Test airplane mode and a failed ad load; workouts and navigation should remain usable.
6. Check development logs under `[Cubyfit ads]` for initialization, consent, loaded, shown, dismissed, failed, Premium, and frequency messages. Logs contain no account or fitness details.

Known limits: this integration has no iOS ad placement; the device must have a newly built native client for real ad testing; an account without resolved RevenueCat status does not receive ads. Google may return no fill even when consent and the local caps allow a request. Review the current Expo Doctor report and test release signing before Play submission.

References: [Expo config](https://docs.expo.dev/workflow/configuration.md), [Expo environment variables](https://docs.expo.dev/guides/environment-variables.md), [Invertase Expo installation](https://docs.page/invertase/react-native-google-mobile-ads/installation/expo), [consent](https://docs.page/invertase/react-native-google-mobile-ads/european-user-consent), [interstitials](https://docs.page/invertase/react-native-google-mobile-ads/ad-formats/interstitial), [Google Android test ads](https://developers.google.com/admob/android/test-ads).
