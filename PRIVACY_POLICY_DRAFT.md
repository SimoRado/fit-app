# Cubyfit Privacy Policy — publication draft

> **Do not publish this draft yet.** Replace the operator, address, contact, minimum-age and legal-basis fields; verify the provider, retention and release settings listed after the policy. The current public `/privacy` route remains a placeholder.

**Last updated: November 18, 2026**

Cubyfit is a fitness, nutrition, habit-tracking and personal-growth application operated by **[LEGAL OPERATOR NAME]**, based at **[BUSINESS POSTAL ADDRESS, COUNTRY]** ("Cubyfit," "we," or "us"). This policy describes the information used by the mobile app and the website at [cubyfit.app](https://cubyfit.app), and how to exercise your privacy choices.

**Privacy contact:** [PRIVACY SUPPORT EMAIL]

## 1. Information we process

**Account and authentication.** When you create or use an account, we process your name, email address, account identifier, sign-in method, verification and recovery information, and information provided by Google or Apple if you choose those sign-in methods. Clerk provides authentication and stores the credentials and sessions needed for it. Cubyfit does not maintain a separate database of account passwords.

**Fitness and personal-growth records.** Depending on what you enter and use, the app stores your date of birth, height, starting and target weight, fitness and growth goals, exercise experience, workouts and routines (including sets, notes and progress), body measurements, habits and their schedules/completion history, missions, nutrition targets, meal entries and custom foods, preferences and motivational-card favorites. Reminders and notification schedules are stored on your device. Some of these records may be treated as sensitive under applicable law.

**Subscriptions.** RevenueCat and the relevant app store process the account and product identifiers, offering, purchase, entitlement and subscription status needed to provide Cubyfit Pro. Google Play or Apple's App Store processes the payment transaction. You do not enter a payment card directly into the Cubyfit app.

**Technical, diagnostic and advertising information.** The app and its providers may process app version, device and operating-system information, error and performance events, network information such as IP address, service identifiers, and advertising identifiers and ad interactions where applicable. We do not intentionally send your individual meal entries, body measurements or habit records to AdMob for targeting. The exact device and advertising fields processed by SDKs depend on platform settings and provider behavior.

**Website and catalog access.** Vercel serves the public website and may process ordinary request information. When you check for or download the protected food catalog, the Cloudflare gateway receives an authenticated token and source IP address and uses account-derived rate-limit and temporary download-session information. The catalog itself is not a copy of your personal food diary. If you contact support, we process the information you provide in that request.

## 2. Local storage and optional cloud backup

The app saves supported fitness, nutrition and habit records in an account-specific SQLite database on your device first. Guest records are kept in a separate local database. A downloaded food catalog and some app-wide settings are stored separately from an account's fitness database.

Cloud backup is optional. Choosing **Back up my data** allows supported records, including profile, workouts, habits, nutrition entries and progress, to synchronize with Convex under your authenticated account. Choosing **Keep it on this device** pauses this fitness-data synchronization. Pending local changes and conflicts can remain on the device. The choice does not turn off Clerk authentication, RevenueCat subscription checks, Convex authentication, Sentry diagnostics, catalog access or advertising-related processing.

Device and operating-system backup or transfer features may copy local app files independently of Cubyfit's cloud-backup setting. The account-specific SQLite file is protected by the device's app storage controls but is not separately encrypted by Cubyfit with SQLCipher.

## 3. Why we use information

We use information to create and secure accounts; provide requested fitness, nutrition, workout, habit and progress features; save preferences; perform optional cloud backup and restoration; calculate requested estimates; verify subscription access; schedule local reminders when enabled; deliver and measure ads for eligible free users subject to applicable choices; diagnose failures; prevent abuse of protected services; respond to support and deletion requests; and meet applicable obligations.

We do not retain identifiable fitness statistics solely for our own business analytics after the account-deletion process completes. We do not sell personal fitness records as a customer-data product.

**[BEFORE PUBLICATION: specify the applicable legal bases for each purpose and jurisdiction, including how any required consent may be withdrawn. Do not imply that the UMP choice controls other providers.]**

## 4. Advertising choices

The Android app may show Google AdMob interstitial ads to eligible free users. Google UMP obtains and manages advertising privacy choices where its configured messages require them. Availability of a message and whether ad requests are permitted depend on the applicable region, configuration and your choices. Advertising providers may process device and advertising identifiers, IP address, ad interactions and related technical information under their own notices.

The app checks UMP's ad-request permission before loading an interstitial. Declining an optional advertising choice does not disable the core fitness features. Cubyfit Pro's current offering describes an experience without ads; the exact purchased benefits are shown at checkout.

**[BEFORE PUBLICATION: the ordinary account/settings screen does not yet expose the UMP privacy-options form. Add and verify the required entry point before promising that users can revisit choices there. Verify regional AdMob messages, vendors and actual release-device network behavior.]**

## 5. Providers

We use **Clerk** for sign-in and account management; **Convex** for authenticated backend operations and optional cloud backup; **RevenueCat** for subscription management; **Google Play** and **Apple** for platform purchases and subscriptions; **Google AdMob and UMP** for ads and advertising choices; **Sentry** for error reporting and reliability; **Cloudflare** for protected food-catalog delivery and access controls; and **Vercel** to host the public website. These providers process information needed for their roles and may apply their own privacy notices and retention terms. A cloud-backup choice does not prevent those other services from processing the information needed for their functions.

## 6. International processing

Providers may process data outside your country of residence. The locations and safeguards depend on the final service configuration and applicable law. **[BEFORE PUBLICATION: identify the operator's jurisdiction, relevant processing locations and transfer mechanism or safeguard for intended markets; assess requirements under Moroccan Law 09-08, GDPR and other applicable laws with qualified counsel.]**

## 7. Retention

Account information and application records are kept while needed to provide the service, unless deleted or subject to an applicable obligation. Local fitness records remain until removed through the supported app or device process. Synced records remain in Convex while backup is enabled and until the applicable deletion process removes them; pausing backup does not itself delete an existing cloud copy.

After an account-deletion request is accepted, a server job blocks new private cloud operations and removes account-owned active Convex records, then requests deletion of the matching RevenueCat customer and Clerk identity. If a stage fails, the job retries and completion may be delayed. A limited Convex deletion-status job containing account identifiers, a receipt, stage and timestamps remains for approximately 30 days **after completion** to help devices finish local cleanup; incomplete jobs remain until resolved.

The device that observes completion removes the matching account-specific SQLite database. Other devices cannot be erased remotely. A device offline during deletion can keep a local copy; if it reconnects after the status record expires, automatic cleanup may no longer be possible and the user may need to clear that device's app data. Separate guest data and other accounts' local data are not part of this account deletion. Operating-system backups and downloaded common catalog files are outside this account-specific cleanup.

Store billing records, provider security logs, diagnostics, advertising records and backups may be retained under the relevant provider's rules or applicable obligations. The current deletion job does not directly purge Sentry events, Google ad records, Cloudflare quota/session state, app-store transactions or provider backups. **[BEFORE PUBLICATION: verify and state meaningful provider retention periods and any actual legal exceptions; do not promise a fixed deletion deadline across those systems.]**

## 8. Account deletion

In the signed-in app, open **Account → Data & Privacy → Delete Account**. You must type `DELETE-ACCOUNT`, confirm an email code through Clerk, and submit the request. Once accepted, the app shows progress while the server processes it. The process removes account-owned cloud fitness records and requests removal of the associated identity and matching subscription customer record. Matching local data on a device is removed only when that device observes completion, subject to the limits in Section 7.

Account deletion does **not** cancel an active Google Play or App Store subscription. Cancel it separately in the relevant store. The public [account-deletion page](https://cubyfit.app/delete-account) will explain the process and how to request help if you cannot access the app. **[BEFORE PUBLICATION: this public page currently contains a placeholder and no working request channel; complete it before linking it as an available outside-app deletion path.]**

## 9. Your choices and rights

Depending on applicable law, you may request access, correction or deletion; object to or restrict certain processing; withdraw consent where processing relies on it; request information about transfers; or exercise other applicable rights. Contact **[PRIVACY SUPPORT EMAIL]**. We may verify your identity before acting on account-related requests. You may be able to complain to the relevant data-protection authority.

Within the app you can manage optional cloud backup and delete local account records separately from deleting the account. Disabling cloud backup pauses new fitness-data synchronization; it does not automatically erase data already stored in Convex.

## 10. Security

We use authenticated access, account-specific storage, access controls on cloud records and encrypted connections for service traffic. Supported secure-storage mechanisms hold authentication tokens and the local deletion receipt. The account-specific fitness SQLite database is not separately encrypted by Cubyfit. No system is completely secure. Report suspected unauthorized access to **[PRIVACY SUPPORT EMAIL]**.

## 11. Children

**[BEFORE PUBLICATION: decide and implement the minimum permitted age, age-screening and any parental-consent or ad treatment required in release markets. Replace this section with the final policy; the draft does not establish an age rule.]**

## 12. Changes

We may update this policy to reflect service, provider or legal changes. We will update its effective date and provide additional notice or seek consent where required.

## 13. Contact

**Cubyfit**  
Operator: **[LEGAL OPERATOR NAME]**  
Postal address: **[BUSINESS POSTAL ADDRESS, COUNTRY]**  
Privacy email: **[PRIVACY SUPPORT EMAIL]**  
Website: [cubyfit.app](https://cubyfit.app)

---

## Publication checks (not part of the policy)

1. Fill every bracketed item and obtain legal review for the actual operator, markets, legal bases, cross-border safeguards, age rule and retention schedule.
2. Implement the public UMP privacy-options entry point and test regional consent behavior; then replace the Section 4 bracketed note with accurate user instructions.
3. Complete the `/delete-account` website request path, support contact and Play Console URL; then replace the Section 8 bracketed note.
4. Verify Sentry, Clerk, RevenueCat, Convex, Cloudflare, Vercel, AdMob and store retention/configuration. Review the final Android/iOS Data Safety/Privacy labels against release builds.
5. Verify this policy is reachable from inside the app, not only the paywall, and replace the existing live website placeholder only after final review.
