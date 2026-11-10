import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), 'src/app', path), 'utf8');

describe('account navigation', () => {
  it('opens the existing protected Account stack screen from the dashboard avatar', () => {
    const dashboard = source('(tabs)/index.tsx');
    const rootLayout = source('_layout.tsx');
    const tabLayout = source('(tabs)/_layout.tsx');

    expect(dashboard).toMatch(/accessibilityLabel="Account"[^>]*onPress=\{\(\) => router\.push\('\/account'\)\}/);
    expect(rootLayout).toMatch(/<Stack\.Protected guard=\{signedIn\}[\s\S]*<Stack\.Screen name="account"\/>[\s\S]*<\/Stack\.Protected>/);
    expect(tabLayout).not.toMatch(/<Tabs\.Screen name="account"/);
  });

  it('links Account to the existing subscription, privacy, and fitness profile screens', () => {
    const account = source('account.tsx');
    for (const route of ['/premium-test', '/cloud-sync', '/(tabs)/profile']) {
      expect(account).toContain(`router.push('${route}')`);
    }
    expect(source('cloud-sync.tsx')).toContain("router.push('/delete-account')");
    expect(account).toContain('await signOut()');
    expect(account).toContain('await clearAccountReminders()');
  });
});
