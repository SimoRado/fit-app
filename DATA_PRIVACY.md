# Fitapp data and privacy controls

## Current storage

Fitness profile details, habits, workouts, exercise sets, weight and measurement history, missions, favorites, preferences, and reminder settings are stored in SQLite on the device. Each authenticated Clerk account gets a separate SQLite file. The preserved pre-authentication guest file is never assigned automatically. Clerk manages identity and secure session-token storage. RevenueCat holds Test Store purchase and entitlement information. Convex receives fitness records only after the signed-in user chooses cloud backup in **Profile → Data & Privacy**. Notification IDs remain device-only.

## User controls

**Back up my data** enables authenticated cloud sync and queues current records. **Keep it on this device** pauses cloud transfer without deleting data. **Decide later** leaves records local. Pending changes and conflicts are displayed. Guest history can be copied into an empty account after explicit confirmation; the original guest data is preserved and the copy is not uploaded until backup is chosen separately.

**Delete this account’s local data** on Profile requires confirmation and is blocked while unsynced changes or conflicts remain. It affects only the active account's device records. It does not delete cloud records, another account's local file, the preserved guest file, the Clerk account, or a RevenueCat subscription. If cloud data remains, the user can opt to restore it later.

## Account deletion

The **Delete Account** section is informational and does not execute deletion. Complete deletion needs a trusted workflow that removes the authenticated user's Convex records while authentication still works, handles retries, then deletes the Clerk account and local file. No Clerk secret key is present in the Expo app. Account deletion must not be represented as subscription cancellation; users must manage active store subscriptions through the relevant store or RevenueCat-supported management flow. No real account deletion was performed during development.

## Current limitations

SQLite files are not additionally encrypted by Fitapp; device backup and physical-access policy need review. The new sync format does not automatically migrate records stored in older Convex domain tables. Conflicting edits remain preserved and visible as conflicts but have no manual resolution screen yet. Offline data remains available to a restored Clerk session; cloud calls require valid Convex authentication. Test Store transactions are development-only and not real purchases.
