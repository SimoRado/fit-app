export const CUBYFIT_DEVELOPMENT_CONVEX_URL = 'https://greedy-scorpion-117.convex.cloud';
export const CUBYFIT_PRODUCTION_CONVEX_URL = 'https://different-cat-438.convex.cloud';
export const CUBYFIT_DEVELOPMENT_CLERK_ISSUER = 'https://supreme-civet-424.clerk.accounts.dev';
export const CUBYFIT_PRODUCTION_CLERK_ISSUER = 'https://clerk.cubyfit.app';

export type CubyfitAuthEnvironment = 'development' | 'production';

export function usesExpectedConvexDeployment(url: string, environment: 'development' | 'production') {
  const expected = environment === 'production' ? CUBYFIT_PRODUCTION_CONVEX_URL : CUBYFIT_DEVELOPMENT_CONVEX_URL;
  return url.trim().replace(/\/+$/, '') === expected;
}

/** Prevent a distributable release from silently using Clerk's test instance. */
export function allowsClerkPublishableKey(key: string, development: boolean, internalBuild: boolean) {
  return development || internalBuild || key.startsWith('pk_live_');
}

/**
 * Clerk publishable keys encode the instance's Frontend API host as base64url.
 * Reading this public metadata lets us reject a test key from a different Clerk
 * instance before Clerk restores a session or Convex opens a protected socket.
 */
export function clerkIssuerFromPublishableKey(key: string): string | null {
  const match = /^pk_(?:test|live)_([A-Za-z0-9_-]+)$/.exec(key.trim());
  if (!match || typeof globalThis.atob !== 'function') return null;
  try {
    const encoded = match[1].replace(/-/g, '+').replace(/_/g, '/');
    const host = globalThis.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')).replace(/\$$/, '');
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
  } catch {
    return null;
  }
}

export function validateCubyfitAuthConfiguration(convexUrl: string, publishableKey: string): CubyfitAuthEnvironment {
  const normalizedUrl = convexUrl.trim().replace(/\/+$/, '');
  const environment = normalizedUrl === CUBYFIT_DEVELOPMENT_CONVEX_URL
    ? 'development'
    : normalizedUrl === CUBYFIT_PRODUCTION_CONVEX_URL
      ? 'production'
      : null;
  if (!environment) throw new Error('Cubyfit authentication configuration error: the Convex URL is not a recognized Cubyfit deployment.');

  const expectedPrefix = environment === 'development' ? 'pk_test_' : 'pk_live_';
  if (!publishableKey.startsWith(expectedPrefix)) {
    throw new Error(`Cubyfit authentication configuration error: ${environment} Convex requires a ${expectedPrefix} Clerk publishable key.`);
  }

  const expectedIssuer = environment === 'development' ? CUBYFIT_DEVELOPMENT_CLERK_ISSUER : CUBYFIT_PRODUCTION_CLERK_ISSUER;
  const issuer = clerkIssuerFromPublishableKey(publishableKey);
  if (issuer !== expectedIssuer) {
    throw new Error(`Cubyfit authentication configuration error: the Clerk key does not belong to the ${environment} Clerk issuer.`);
  }
  return environment;
}
