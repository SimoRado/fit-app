import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function envNames(source: string) {
  return [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map(match => match[1]);
}

describe('credential boundaries', () => {
  it('keeps server-only deletion credentials outside client runtime source', () => {
    const clientSources = [
      'src/app/_layout.tsx',
      'src/state/subscriptions.tsx',
      'src/core/monitoring.ts',
      'src/data/foodCatalog.ts',
    ].map(path => readFileSync(join(root, path), 'utf8')).join('\n');
    const serverSource = readFileSync(join(root, 'convex/accountDeletionActions.ts'), 'utf8');

    expect(envNames(clientSources)).not.toEqual(expect.arrayContaining([
      'CLERK_SECRET_KEY', 'CLERK_JWT_KEY', 'REVENUECAT_SECRET_KEY', 'SENTRY_AUTH_TOKEN',
    ]));
    expect(envNames(serverSource)).toEqual(expect.arrayContaining([
      'CLERK_SECRET_KEY', 'CLERK_JWT_KEY', 'REVENUECAT_SECRET_KEY',
    ]));
  });

  it('does not designate server-only credential names as Expo public configuration', () => {
    const example = readFileSync(join(root, '.env.example'), 'utf8');
    const publicNames = [...example.matchAll(/^(EXPO_PUBLIC_[A-Z0-9_]+)=/gm)].map(match => match[1]);

    expect(publicNames).not.toEqual(expect.arrayContaining([
      'EXPO_PUBLIC_CLERK_SECRET_KEY', 'EXPO_PUBLIC_CLERK_JWT_KEY',
      'EXPO_PUBLIC_REVENUECAT_SECRET_KEY', 'EXPO_PUBLIC_SENTRY_AUTH_TOKEN',
    ]));
  });

  it('keeps local environment files and signing material ignored by Git', () => {
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
    for (const pattern of ['.env.*', '*.pem', '*.p8', '*.p12', '*.key', '*.keystore']) {
      expect(ignore).toContain(pattern);
    }
  });
});
