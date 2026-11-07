# Account deletion and security notes

## Scope

Fitapp's Convex data is owned by the authenticated Clerk identity's `tokenIdentifier` (`issuer` plus `subject`). Every private public query and mutation uses this owner and now rejects requests once that owner has a deletion job. The public `health.ping` returns no personal data. `identity.current` returns only the caller's identity. The receipt-based deletion status exposes only the stage and a nonsensitive error category to a holder of an unguessable receipt.

## Cloud inventory

The user-owned Convex tables are `profiles`, `habits`, `habitCompletions`, `missions`, `missionCompletions`, `exercises` (custom only), `routines`, `workouts` (nested exercises and sets), `weights`, `measurements`, `restDays`, `favorites`, `preferences`, `syncRecords`, and `syncOperations`. Each is removed through an owner index in batches of 50. The schema has no file references and no current code writes to Convex storage. The bundled exercise catalog is not in Convex and is not deleted.

## Workflow

The client requires the literal `DELETE` and Clerk email-code reverification. A signed Clerk session token is passed to a Convex action only for cryptographic verification; the Convex identity and verified token must have the same subject and issuer, and the signed `fva` claim must show a factor verified within 10 minutes. The client never sends a target user ID. A durable job is created before any external deletion. Creating it immediately blocks all private Convex reads and writes, including queued sync operations.

A scheduled internal action repeatedly removes cloud records. It then searches RevenueCat API v2 for the Clerk user ID, verifies the matching alias set, requests customer deletion, and confirms a subsequent GET returns 404. It refuses any customer with another nonanonymous alias, leaving the job for review. Then it deletes the Clerk user through the Backend API. Missing customers and users are treated idempotently. Temporary failures retain the job, record a safe error category, and schedule exponential retry. Completion receipts are retained for 30 days to allow a returning device to clean up its SQLite file, then expire. Incomplete jobs are retained until resolved.

The current device stores its receipt in Expo SecureStore, checks the public status on reopening, closes and removes only the matching account's SQLite database, and signs out that account. A disconnected device cannot be erased remotely; it retries status on reconnection. Its stale cloud writes remain blocked by the server.

## Development configuration required

Only the development Convex deployment `greedy-scorpion-117` is in scope. `CLERK_FRONTEND_API_URL` is configured there. Before account deletion can be exercised, configure these trusted Convex environment variables in that development deployment:

- `CLERK_JWT_KEY`: Clerk JWT verification public key for the same development instance.
- `CLERK_SECRET_KEY`: Clerk Backend API secret for that development instance.
- `REVENUECAT_SECRET_KEY`: RevenueCat API v2 secret with customer read and read/write permissions for the Test Store project.
- `REVENUECAT_PROJECT_ID`: the matching RevenueCat project ID.

Do not put these values in `EXPO_PUBLIC_` variables or the mobile bundle. Test only with disposable Clerk, Convex, and RevenueCat Test Store identities. A RevenueCat customer deletion does not cancel an App Store or Google Play subscription. The app shows `CustomerInfo.managementURL` when RevenueCat supplies one.

## Remaining risks

The account-specific SQLite files use Expo SQLite without SQLCipher and are not encrypted by Fitapp. Expo SecureStore protects the small pending receipt; device OS controls protect app storage, but a compromised or rooted device may read SQLite. Existing records require a separate, carefully planned migration if encryption is added later. No Clerk `user.deleted` webhook is configured; the durable scheduled job is the primary cleanup mechanism. Email-code reverification requires that Clerk offer an email-code factor for the account. No real disposable-account end-to-end deletion has been run while the trusted credentials are unavailable. No device was attached for interactive Android verification.
