const APP_ID = /^ca-app-pub-\d+~\d+$/;
const UNIT_ID = /^ca-app-pub-\d+\/\d+$/;
const IOS_SAMPLE_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

module.exports = ({ config }) => {
  const androidAppId = process.env.GOOGLE_ADMOB_APP_ID;
  const androidInterstitialUnitId = process.env.GOOGLE_ADMOB_AD_UNIT_ID;
  if (!APP_ID.test(androidAppId ?? '')) throw new Error('GOOGLE_ADMOB_APP_ID must be a valid Android AdMob App ID (with ~).');
  if (!UNIT_ID.test(androidInterstitialUnitId ?? '')) throw new Error('GOOGLE_ADMOB_AD_UNIT_ID must be a valid Android interstitial unit ID (with /).');

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
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
        // A release JS bundle must opt in separately before using live units.
        productionBuild: process.env.CUBYFIT_ADMOB_BUILD_CHANNEL === 'production',
      },
    },
  };
};
