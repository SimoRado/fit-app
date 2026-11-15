// Installed Cubyfit identities. The debug APK gets the `.dev` suffix from
// plugins/withAndroidDevVariant.js so it installs beside the preview APK.
export const CUBYFIT_APP_ID = 'com.bettereveryday.fitness';
export const CUBYFIT_DEV_APP_ID = `${CUBYFIT_APP_ID}.dev`;
export const EXPO_GO_APP_IDS = ['host.exp.exponent', 'host.exp.Exponent'];

export type CubyfitVariant = 'preview' | 'dev' | null;

export function cubyfitVariant(nativeApplicationId: string | null | undefined): CubyfitVariant {
  if (nativeApplicationId === CUBYFIT_APP_ID) return 'preview';
  if (nativeApplicationId === CUBYFIT_DEV_APP_ID) return 'dev';
  return null;
}

/**
 * The OAuth callback scheme the *installed* binary registers. A development
 * client reads its Expo config from Metro, which always reports the base
 * scheme, so the native application ID is the reliable source here.
 */
export function oauthScheme(nativeApplicationId: string | null | undefined, configScheme: unknown): unknown {
  if (typeof configScheme !== 'string') return configScheme;
  return cubyfitVariant(nativeApplicationId) === 'dev' ? `${configScheme}-dev` : configScheme;
}
