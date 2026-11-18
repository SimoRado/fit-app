# Delete Your Cubyfit Account — webpage publication draft

> **Do not publish yet.** The live `/delete-account` page is a placeholder. The support mailbox below must exist, be monitored and have a verified identity-check and manual processing procedure before this copy becomes a public deletion request path.

**Your account. Your data. Your choice.**

You can request permanent deletion of your Cubyfit account and associated personal information. This action cannot be undone. Deleting the account does not cancel an app-store subscription.

## Delete your account in the app

1. Open Cubyfit and sign in.
2. Go to **Account → Data & Privacy → Delete Account**.
3. Read the warning and type **`DELETE-ACCOUNT`** exactly.
4. Request and complete the Clerk email-code verification.
5. Tap **Permanently delete account**.

The app displays the deletion job's progress. A completed request removes the matching account database from the device when it receives completion status.

## Cannot access the app?

Email **[ACCOUNT DELETION SUPPORT EMAIL]** with the subject **Cubyfit Account Deletion Request**. State that you want to delete your account and include the email address associated with it. We may ask you to use a secure identity-verification step before processing the request. **Never email your password, one-time verification code or session token.**

**[BEFORE PUBLICATION: implement and document an authorized manual process that verifies ownership and invokes the same complete account-deletion workflow, tracks failures, confirms completion and handles a user who cannot use the app. Do not tell users to email an unmonitored address or imply that sending an email triggers the current in-app deletion job automatically. Specify expected response timing once established.]**

## What the in-app process removes

The deletion job blocks new private cloud operations and removes account-owned active Convex records: profile, habits, completion history and progress, missions, workouts and routines, weights and measurements, favorites, preferences, and synchronized nutrition targets, food logs and custom foods. It also removes sync records and operation history. It then deletes the matching RevenueCat customer when its aliases are safe to remove and deletes the Clerk identity. A failure leaves the job pending for retry rather than falsely marking it complete.

We do not keep identifiable fitness statistics solely for our own business analytics after the account-deletion process completes. The matching account-specific SQLite database on a device is deleted when that device observes completion.

## What may remain

- A limited Convex deletion-status job with account identifiers, receipt, stage and timestamps remains for approximately **30 days after completion** to support device cleanup. Incomplete jobs persist while they are being resolved.
- Offline devices cannot be erased remotely. If one reconnects after deletion tracking expires, its account-specific local copy may require the device holder to clear app data manually. Separately saved guest data and other accounts' local databases are outside this account's deletion job.
- App-store billing and transaction records, Sentry diagnostic events, Google ad and UMP records, Cloudflare access-control state, provider backups and operating-system backups are not directly erased by this job. Their applicable retention processes and legal obligations may differ.

See the [Privacy Policy](https://cubyfit.app/privacy) for more detail. **[BEFORE PUBLICATION: verify provider retention periods and provide a practical support route for local copies and exceptional deletion failures.]**

## Cancel a subscription separately

Deleting your account **does not cancel** a Google Play or App Store subscription. To stop future renewal, manage it at the store where you purchased it:

- [Google Play subscriptions](https://play.google.com/store/account/subscriptions)
- [Apple subscriptions](https://apps.apple.com/account/subscriptions)

If you need help with subscription access, contact **[SUPPORT EMAIL]**.

## Questions

For questions about deletion or your privacy rights, contact **[PRIVACY SUPPORT EMAIL]**. Read the [Privacy Policy](https://cubyfit.app/privacy) and [Terms of Use](https://cubyfit.app/terms).

**Cubyfit — [LEGAL OPERATOR NAME]**

---

## Publication checks (not part of the webpage)

1. Confirm the deletion/support mailbox, ownership verification, authorized operator and response process. Document how manual requests invoke the actual Clerk/Convex/RevenueCat deletion workflow without exposing a secret or bypassing recent-authentication protections.
2. Replace brackets, verify the exact menu path in the release build and confirm account/deletion data categories with production deployment.
3. Publish to the **existing** Vercel project and verify `/delete-account`, `/privacy`, `/terms`, and the contact link, without replacing the site's design or configuration.
4. Only then submit this functional URL in Google Play's Data Safety/account-deletion fields.
