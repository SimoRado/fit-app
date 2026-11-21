/** Prevent a distributable release from silently using Clerk's test instance. */
export function allowsClerkPublishableKey(key: string, development: boolean, internalBuild: boolean) {
  return development || internalBuild || key.startsWith('pk_live_');
}
