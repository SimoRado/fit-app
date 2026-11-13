import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

describe('native social OAuth build configuration', () => {
  it('uses statically inlined public configuration and requires the Apple Android setting before local builds', () => {
    const socialAuth = readFileSync(join(root, 'src/ui/SocialAuth.tsx'), 'utf8');
    const buildScript = readFileSync(join(root, 'scripts/build-android-local.ps1'), 'utf8');
    expect(socialAuth).toContain("process.env.EXPO_PUBLIC_CLERK_APPLE_ANDROID_OAUTH_ENABLED === 'true'");
    expect(socialAuth).toContain("process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''");
    expect(buildScript).toContain("'EXPO_PUBLIC_CLERK_APPLE_ANDROID_OAUTH_ENABLED'");
    expect(buildScript).toContain('Enable the existing Clerk Apple Android browser OAuth connection');
    expect(buildScript).toContain("Set-EnvValue 'EXPO_PUBLIC_CUBYFIT_ADMOB_TESTING' 'true'");
  });

  it('enables the browser provider flag only in internal EAS build profiles', () => {
    const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8')) as {
      build: Record<string, { env?: Record<string, string> }>;
    };
    for (const profileName of ['development', 'catalog-offline-test']) {
      const env = eas.build[profileName].env;
      expect(env?.EXPO_PUBLIC_CLERK_APPLE_ANDROID_OAUTH_ENABLED).toBe('true');
      expect(env?.EXPO_PUBLIC_CUBYFIT_ADMOB_TESTING).toBe('true');
      expect(env?.EXPO_PUBLIC_ADMOB_PRODUCTION_ADS_ENABLED).toBe('false');
      expect(env?.CUBYFIT_ADMOB_BUILD_CHANNEL).toBe('eas-internal');
    }
    expect(eas.build.production?.env?.EXPO_PUBLIC_CUBYFIT_ADMOB_TESTING).not.toBe('true');
  });

  it('only exposes the Settings route through the internal build guard', () => {
    const profile = readFileSync(join(root, 'src/app/(tabs)/profile.tsx'), 'utf8');
    const account = readFileSync(join(root, 'src/app/account.tsx'), 'utf8');
    const diagnostics = readFileSync(join(root, 'src/app/admob-testing.tsx'), 'utf8');
    const rootLayout = readFileSync(join(root, 'src/app/_layout.tsx'), 'utf8');
    expect(profile).toContain('...(admobTestingEnabled ? [{ label: \'AdMob Testing\'');
    expect(account).toContain('{admobTestingEnabled && <Button title="AdMob Testing"');
    expect(account).toContain("router.push('/admob-testing')");
    expect(diagnostics).toContain('if (!admobTestingEnabled) return null;');
    expect(rootLayout).toContain('<Stack.Screen name="admob-testing"/>');
  });

  it('embeds internal-preview state in the native Expo configuration instead of depending on a release bundle environment variable', () => {
    const config = readFileSync(join(root, 'app.config.js'), 'utf8');
    const ads = readFileSync(join(root, 'src/services/adMob.ts'), 'utf8');
    expect(config).toContain("buildChannel === 'local-preview'");
    expect(config).toContain('internalBuild,');
    expect(ads).toContain('Constants.expoConfig?.extra?.admob?.internalBuild === true');
    expect(ads).not.toContain('internalBuildFlag: process.env.EXPO_PUBLIC_CUBYFIT_ADMOB_TESTING');
  });
});
