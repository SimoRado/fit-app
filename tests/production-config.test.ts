import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allowsClerkPublishableKey, usesExpectedConvexDeployment } from '../src/core/productionConfig';

describe('production credential configuration', () => {
  it('rejects Clerk test keys in distributable release builds', () => {
    expect(allowsClerkPublishableKey('pk_test_example', false, false)).toBe(false);
    expect(allowsClerkPublishableKey('pk_live_example', false, false)).toBe(true);
  });

  it('continues to allow development and explicitly marked internal builds', () => {
    expect(allowsClerkPublishableKey('pk_test_example', true, false)).toBe(true);
    expect(allowsClerkPublishableKey('pk_test_example', false, true)).toBe(true);
  });

  it('keeps Cubyfit Dev and production on their existing, separate Convex deployments', () => {
    expect(usesExpectedConvexDeployment(' https://greedy-scorpion-117.convex.cloud/ ', 'development')).toBe(true);
    expect(usesExpectedConvexDeployment('https://different-cat-438.convex.cloud', 'production')).toBe(true);
    expect(usesExpectedConvexDeployment('https://different-cat-438.convex.cloud', 'development')).toBe(false);
    expect(usesExpectedConvexDeployment('https://greedy-scorpion-117.convex.cloud', 'production')).toBe(false);
  });

  it('defines production and internal smoke profiles that fail closed on the wrong backend or Clerk instance', () => {
    const eas = JSON.parse(readFileSync(join(process.cwd(), 'eas.json'), 'utf8')) as { build: Record<string, { environment?: string; distribution?: string; env?: Record<string, string>; android?: { buildType?: string } }> };
    const appConfig = readFileSync(join(process.cwd(), 'app.config.js'), 'utf8');
    expect(eas.build.production?.environment).toBe('production');
    expect(eas.build.production?.env?.CUBYFIT_ADMOB_BUILD_CHANNEL).toBe('production');
    expect(eas.build['production-smoke']).toMatchObject({ environment: 'production', distribution: 'internal', android: { buildType: 'apk' } });
    expect(eas.build['production-smoke']?.env?.CUBYFIT_ADMOB_BUILD_CHANNEL).toBe('production');
    expect(appConfig).toContain("process.env.EAS_BUILD === 'true'");
    expect(appConfig).toContain('CUBYFIT_VALIDATE_PRODUCTION_CONFIG');
    expect(appConfig).toContain("convexUrl !== 'https://different-cat-438.convex.cloud'");
    expect(appConfig).toContain("clerkPublishableKey.startsWith('pk_live_')");
  });
});
