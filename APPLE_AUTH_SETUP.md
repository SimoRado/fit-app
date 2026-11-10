# Apple authentication setup

Updated 2026-11-09. Fitapp uses the existing Clerk account as the only authentication identity. Apple sign-in does not create a separate Fitapp account system.

## Current implementation

- The installed `@clerk/expo` 4.15.0 provides `useSignInWithApple` for native iOS authentication and documents `oauth_apple` through `useSSO` for browser-based flows on other platforms.
- iOS uses Clerk's native hook and Expo's official localized Apple authentication button. The hook exchanges Apple's identity token with Clerk and supports sign-up and sign-in. Apple cancellation is silent; other failures receive a safe, non-secret message.
- Android uses Clerk's `oauth_apple` browser strategy and the existing `betterday://oauth-callback` deep link. Clerk development instances provide shared Apple OAuth credentials; enable the Apple connection in Clerk and leave custom credentials off for this development setup.
- Both flows activate only the session ID returned by Clerk, then enter the existing protected router. The root screen opens the current Clerk user's fitness profile or the existing onboarding screen.
- Clerk SecureStore token caching, Convex identity, SQLite account selection, RevenueCat identity, and Sentry handling remain in the existing providers. Local databases are selected by Clerk user ID, never by Apple or Google email.
- The iOS bundle identifier is `com.bettereveryday.fitness`, matching the existing Android package name. The iOS Sign in with Apple capability is enabled in Expo config. Expo's and Clerk's config plugins generate native settings; there is no checked-in `ios/` project to edit.
- No Apple-specific dependencies were needed: `expo-apple-authentication` and `expo-crypto` were already installed at Expo SDK 58-compatible versions.

The native iOS Apple button is enabled only after the matching Clerk connection is set up and device availability is confirmed. Before then, sign-in and sign-up show a disabled **Continue with Apple** control with an explanation. Android shows the browser Apple button when configured in a development build. When the Android flag is on in Expo Go, it shows a disabled Apple control explaining that a development build is required. Android hides the control when its flag is off:

```env
EXPO_PUBLIC_CLERK_APPLE_ANDROID_OAUTH_ENABLED=false
EXPO_PUBLIC_CLERK_APPLE_IOS_NATIVE_ENABLED=false
```

Set a flag to `true` only after completing that platform's Clerk setup below. Then restart Metro so Expo embeds the updated public variable in the JavaScript bundle. Keep these values `false` until the applicable dashboard configuration is complete. A flag is a local display gate, not proof that Clerk or Apple is configured.

## Android: Clerk browser OAuth

Clerk's Expo SDK supplies the supported `oauth_apple` strategy on Android. Apple does not provide a native Sign in with Apple SDK for Android, so this opens a browser and returns to Fitapp through the existing app scheme.

1. In the **existing Clerk development instance**, open **SSO connections** and add **Apple** for all users. The app owner reports that Apple sign-up and sign-in are now enabled there; this workspace cannot inspect the dashboard directly.
2. For the development instance, leave **Use custom credentials** off so Clerk uses its shared development credentials.
3. In Clerk **Native applications**, confirm **Native API** is enabled and the existing Android app package `com.bettereveryday.fitness` is registered. Add `betterday://oauth-callback` under **Allowlist for mobile SSO redirect**. This is the callback already used by Google.
4. `EXPO_PUBLIC_CLERK_APPLE_ANDROID_OAUTH_ENABLED=true` is now set in the ignored local `.env.local` file. Expo SDK 58 loads it for local development; reload the development client after Metro picks it up. Keep `.env.example` false as the safe default for other environments.
5. Test one new Apple identity and one returning identity on the installed Fitapp Android development build. Verify the Clerk user ID, onboarding/dashboard destination, Convex identity, local database, and RevenueCat customer ID.

The Android flow needs the Apple connection enabled in Clerk, but it needs no additional Android native library, Apple native capability, App ID Prefix, Services ID, Apple key, or separate authentication provider. Clerk's development shared credentials are not production credentials. A production web OAuth connection requires an Apple Developer Program account and custom Apple Services ID, Team ID, Key ID, private key, domain, and return URL.

Expo Go cannot receive the app's `betterday://oauth-callback` redirect because it does not register Fitapp's custom URL scheme. Open the installed **Better Every Day development build** for Android Apple OAuth testing. In development, the Apple availability diagnostic logs only platform, runtime, public feature flags, button state, and a reason code; it does not log credentials or tokens.

The dashboard's mobile SSO redirect allowlist and a complete Android Apple login cannot be inspected from this workspace. Confirm `betterday://oauth-callback` in Clerk and test on a device before treating the flow as operational. The Android button is visible in the local development bundle now that its flag is enabled.

## iOS: native Apple authentication

The code and Expo configuration are ready for native Clerk Sign in with Apple, but this workspace has no paid Apple Developer Program membership and no iOS build has been configured or tested. Clerk requires the exact App ID Prefix and Bundle ID to register a native application. The project does not invent an App ID Prefix, Team ID, certificate, key, or Services ID.

After Apple Developer Program access is available:

1. In the Apple Developer portal, register the App ID `com.bettereveryday.fitness` and enable **Sign in with Apple**. Copy the exact **App ID Prefix** shown for that App ID. Do not assume the prefix; Apple may show a value distinct from the Team ID.
2. In the existing Clerk development instance, open **Native applications**, enable the **Native API**, and add an iOS app with that exact App ID Prefix and bundle identifier `com.bettereveryday.fitness`.
3. In Clerk **SSO connections**, enable Apple for sign-up and sign-in. Save the native application and Apple connection settings.
4. Set `EXPO_PUBLIC_CLERK_APPLE_IOS_NATIVE_ENABLED=true` in the development build environment.
5. Create and install an iOS development build, then test on a physical iPhone. The Expo Apple button is rendered only when the setting is enabled and `AppleAuthentication.isAvailableAsync()` confirms the device supports it.

To build with EAS after Apple signing access is configured:

```sh
npx eas-cli@latest build --profile development --platform ios
npx expo start --dev-client
```

The existing `development` EAS profile is already a development-client profile. EAS will need valid Apple signing credentials for an iPhone install. Native Apple sign-in itself cannot be verified by JavaScript bundling or Android tests; no claim of a working iOS sign-in is made until an iOS build has been tested.

## Apple identity, names, and email privacy

- Apple may return the user's real email or an app-specific private relay address. Clerk handles Apple's token and provider identity. Fitapp does not use email to select, join, or migrate local data.
- Apple supplies the name only on the initial authorization, and a user can withhold it. Clerk's native hook forwards first and last name when Apple provides them. The existing onboarding form pre-fills from Clerk when a name is available; otherwise it asks the user for the fitness profile name. A returning user with an existing profile skips onboarding.
- No Apple-authenticated user is asked to create or enter a password. Email/password remains available only as its existing, separate Clerk sign-in method.
- If Clerk sends account email to Apple private relay addresses, configure Clerk's Email Source with Apple's private email relay service as described in Clerk's [Apple connection guide](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/apple). This requires Apple Developer access and an allowed sender address.
- Clerk documents automatic linking when an OAuth provider returns the same verified email as an existing Clerk account. Its documented flow assumes one owner per verified email. This app performs no additional account linking and never merges SQLite, Convex, or RevenueCat data by email; those remain keyed to the verified Clerk user ID. Apple's private relay address may differ from a Google or password account email and therefore may result in a distinct Clerk user and distinct local database. If the product must require user consent before Clerk links two verified matching emails, confirm a supported Clerk policy before enabling Apple: the documented Expo flow does not expose a per-sign-in opt-out for Clerk's automatic matching behavior.

For a first-time Hide My Email test, use an Apple account that has not authorized Fitapp before and choose **Hide My Email** in Apple's sheet. Apple will not ask for the name again after the first authorization. To repeat the initial-consent case, remove the test user in Clerk and revoke Fitapp under the Apple account's **Sign in with Apple** settings before trying again.

## Verification status

Automated tests can cover the configured-platform gates, cancellation/error messages, Clerk session activation, profile routing, and Clerk-user-ID database isolation. Those checks simulate application decisions; they do not authenticate with Apple. A successful Android browser flow still requires an enabled Clerk connection and a connected Android build. Native iOS authentication still requires the Apple Developer setup and an iOS development build described above.
