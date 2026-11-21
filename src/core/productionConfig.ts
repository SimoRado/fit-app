export const CUBYFIT_DEVELOPMENT_CONVEX_URL = 'https://greedy-scorpion-117.convex.cloud';
export const CUBYFIT_PRODUCTION_CONVEX_URL = 'https://different-cat-438.convex.cloud';

export function usesExpectedConvexDeployment(url: string, environment: 'development' | 'production') {
  const expected = environment === 'production' ? CUBYFIT_PRODUCTION_CONVEX_URL : CUBYFIT_DEVELOPMENT_CONVEX_URL;
  return url.trim().replace(/\/+$/, '') === expected;
}

/** Prevent a distributable release from silently using Clerk's test instance. */
export function allowsClerkPublishableKey(key: string, development: boolean, internalBuild: boolean) {
  return development || internalBuild || key.startsWith('pk_live_');
}
