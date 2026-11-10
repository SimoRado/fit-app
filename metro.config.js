const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname, {
  includeWebReplay: false,
  includeWebFeedback: false,
  enableSourceContextInDevelopment: false,
});

// Metro passes Windows paths with backslashes to custom resolvers. Sentry's
// feedback resolver checks these paths using POSIX separators, so it can stub
// @sentry/feedback while leaving the browser wrapper that calls it in the
// bundle. That wrapper then crashes during module loading because its import
// is undefined. Apply the same exclusion to the wrappers after normalizing
// separators, while keeping Sentry's resolver for every other module.
const sentryResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform, oldMetroModuleName) => {
  const origin = String(context.originModulePath ?? '').replace(/\\/g, '/');
  const request = String(oldMetroModuleName ?? moduleName).replace(/\\/g, '/');
  const isBrowserFeedbackWrapper = origin.includes('/@sentry/browser/') &&
    /(?:^|\/)feedback(?:Sync|Async)(?:\.js)?$/i.test(request);

  if (isBrowserFeedbackWrapper) return { type: 'empty' };
  return sentryResolver(context, moduleName, platform, oldMetroModuleName);
};

module.exports = config;
