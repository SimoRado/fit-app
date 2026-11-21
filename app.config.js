const APP_ID = /^ca-app-pub-\d+~\d+$/;
const UNIT_ID = /^ca-app-pub-\d+\/\d+$/;
const IOS_SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const withLocalAndroidBuildSettings = require('./plugins/withLocalAndroidBuildSettings');
const withAndroidWorkManagerRoomKeepRule = require('./plugins/withAndroidWorkManagerRoomKeepRule');
const withAndroidDevVariant = require('./plugins/withAndroidDevVariant');

module.exports = ({ config }) => {
  const androidAppId = process.env.GOOGLE_ADMOB_APP_ID;
  const androidInterstitialUnitId = process.env.GOOGLE_ADMOB_AD_UNIT_ID;
  // This is written into the native Expo manifest during prebuild. It is
  // deliberately not inferred from __DEV__ or a user-controlled setting so a
  // distributed production binary cannot expose diagnostic controls.
  const buildChannel = process.env.CUBYFIT_ADMOB_BUILD_CHANNEL;
  const internalBuild = buildChannel === 'local-dev' || buildChannel === 'local-preview' || buildChannel === 'eas-internal';
  const productionBuild = buildChannel === 'production';
  // The EAS CLI resolves this dynamic config locally to discover the project
  // before it can load the selected EAS environment. The actual Expo Build
  // worker exposes EAS_BUILD=true and has the production environment loaded.
  // Keep the fail-closed check on that worker; CUBYFIT_VALIDATE_PRODUCTION_CONFIG
  // enables the same check for an intentional local preflight.
  const validateProductionConfig = productionBuild
    && (process.env.EAS_BUILD === 'true' || process.env.CUBYFIT_VALIDATE_PRODUCTION_CONFIG === 'true');
  const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL?.trim().replace(/\/+$/, '');
  const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  if (validateProductionConfig) {
    if (convexUrl !== 'https://different-cat-438.convex.cloud') throw new Error('Production builds require EXPO_PUBLIC_CONVEX_URL to target different-cat-438.');
    if (!clerkPublishableKey.startsWith('pk_live_')) throw new Error('Production builds require the matching Clerk production publishable key.');
  }
  if (internalBuild) {
    if (convexUrl !== 'https://greedy-scorpion-117.convex.cloud') throw new Error('Internal Cubyfit builds must target the development Convex deployment.');
    if (!clerkPublishableKey.startsWith('pk_test_')) throw new Error('Internal Cubyfit builds must use the development Clerk instance.');
  }
  if (!APP_ID.test(androidAppId ?? '')) throw new Error('GOOGLE_ADMOB_APP_ID must be a valid Android AdMob App ID (with ~).');
  if (!UNIT_ID.test(androidInterstitialUnitId ?? '')) throw new Error('GOOGLE_ADMOB_AD_UNIT_ID must be a valid Android interstitial unit ID (with /).');

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      withLocalAndroidBuildSettings,
      withAndroidWorkManagerRoomKeepRule,
      withAndroidDevVariant,
      ['react-native-google-mobile-ads', {
        androidAppId,
        // No iOS ad requests are made. This official sample App ID keeps the
        // linked native SDK buildable until a separate iOS AdMob app exists.
        iosAppId: IOS_SAMPLE_APP_ID,
        delayAppMeasurementInit: true,
      }],
    ],
    extra: {
      ...config.extra,
      admob: {
        androidInterstitialUnitId,
        internalBuild,
        // A release JS bundle must opt in separately before using live units.
        productionBuild,
      },
    },
  };
};
