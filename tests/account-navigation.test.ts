import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), 'src/app', path), 'utf8');

describe('account navigation', () => {
  it('opens Profile from the dashboard avatar and Account from Profile', () => {
    const dashboard = source('(tabs)/index.tsx');
    const rootLayout = source('_layout.tsx');
    const tabLayout = source('(tabs)/_layout.tsx');

    expect(dashboard).toMatch(/accessibilityLabel="Profile"[^>]*onPress=\{\(\) => router\.navigate\('\/profile'\)\}/);
    expect(readFileSync(join(process.cwd(), 'src/ui/ProfileSheets.tsx'), 'utf8')).toContain("router.push('/account')");
    // `href: null` hides AND redirects a tab in this expo-router version; Profile must stay navigable.
    expect(tabLayout).not.toMatch(/options={{ href: null }}/);
    expect(rootLayout).toMatch(/<Stack\.Protected guard=\{signedIn\}[\s\S]*<Stack\.Screen name="account"\/>[\s\S]*<\/Stack\.Protected>/);
    expect(tabLayout).not.toMatch(/<Tabs\.Screen name="account"/);
  });

  it('links Account to the existing subscription, privacy, and fitness profile screens', () => {
    const account = source('account.tsx');
    for (const route of ['/paywall', '/cloud-sync']) {
      expect(account).toContain(`router.push('${route}')`);
    }
    expect(account).toContain("router.navigate('/(tabs)/profile')");
    expect(source('cloud-sync.tsx')).toContain("router.push('/delete-account')");
    expect(account).toContain('await signOut()');
    expect(account).toContain('await clearAccountReminders()');
  });
});
