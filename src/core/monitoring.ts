import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { sanitizeMonitoringEvent } from './monitoringSanitizer';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
export const monitoringEnabled = Boolean(dsn);
const environment = __DEV__ ? 'development' : 'production';
const version = Constants.expoConfig?.version ?? 'unknown';
const lastReport = new Map<string, number>();

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: `com.bettereveryday.fitness@${version}`,
    dist: String(Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? '1'),
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableAutoSessionTracking: false,
    tracesSampleRate: __DEV__ ? 0 : 0.05,
    integrations: [Sentry.expoRouterIntegration()],
    beforeBreadcrumb: breadcrumb => breadcrumb.category === 'navigation' ? { ...breadcrumb, data: undefined } : null,
    // Error strings and URLs can contain fitness data or auth callbacks.
    beforeSend: sanitizeMonitoringEvent,
  });
}

/** Report only failures that were handled locally and would otherwise be lost. */
export function reportFailure(area: string, _cause: unknown) {
  if (!monitoringEnabled) return;
  const now = Date.now();
  if (now - (lastReport.get(area) ?? 0) < 5 * 60_000) return;
  lastReport.set(area, now);
  Sentry.captureException(new Error(`Fitapp ${area} failure`), {
    tags: { area },
  });
}

export function clearMonitoringUser() { if (monitoringEnabled) Sentry.setUser(null); }

export function sendDevelopmentTestEvent() {
  if (!__DEV__ || !monitoringEnabled) return false;
  Sentry.captureException(new Error('Fitapp developer test: handled exception'), { tags: { area: 'developer-test' } });
  return true;
}
