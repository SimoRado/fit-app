import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { transformManifest, transformBuildGradle } = require('../plugins/withAndroidDevVariant.js');

const manifest = `<activity android:name=".MainActivity">
      <intent-filter>
        <data android:scheme="betterday"/>
        <data android:scheme="exp+better-every-day"/>
      </intent-filter>
      <intent-filter>
        <data android:scheme="clerk" android:host="com.bettereveryday.fitness.hosted-callback"/>
      </intent-filter>`;

const gradle = `android {
    defaultConfig {
        applicationId 'com.bettereveryday.fitness'
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
        }
    }
}`;

describe('Android dev variant config plugin', () => {
  it('routes every app-owned scheme through per-build-type placeholders', () => {
    const out = transformManifest(manifest, 'betterday');
    expect(out).toContain('android:scheme="${cubyfitScheme}"');
    expect(out).toContain('android:scheme="${cubyfitDevClientScheme}"');
    expect(out).toContain('android:host="${applicationId}.hosted-callback"');
    expect(out).not.toContain('"betterday"');
    expect(transformManifest(out, 'betterday')).toBe(out);
  });

  it('suffixes only the debug package and keeps release on the verified identity', () => {
    const out = transformBuildGradle(gradle, 'betterday', 'exp+better-every-day');
    expect(out).toContain("applicationId 'com.bettereveryday.fitness'");
    const debug = out.slice(out.indexOf('debug {'), out.indexOf('release {'));
    const release = out.slice(out.indexOf('release {'));
    expect(debug).toContain("applicationIdSuffix '.dev'");
    expect(debug).toContain("cubyfitScheme: 'betterday-dev'");
    expect(release).not.toContain('applicationIdSuffix');
    expect(out).toMatch(/defaultConfig \{\n[^}]*cubyfitScheme: 'betterday', cubyfitDevClientScheme: 'betterday'/);
    expect(transformBuildGradle(out, 'betterday', 'exp+better-every-day')).toBe(out);
  });

  it('removes a literal scheme that a later non-clean prebuild re-adds', () => {
    const once = transformManifest(manifest, 'betterday');
    const reAdded = once.replace('<data android:scheme="${cubyfitScheme}"/>', '<data android:scheme="${cubyfitScheme}"/>\n        <data android:scheme="betterday"/>\n        <data android:scheme="exp+better-every-day"/>');
    const out = transformManifest(reAdded, 'betterday');
    expect(out).not.toContain('"betterday"');
    expect(out).not.toContain('exp+better-every-day');
    expect(out.match(/\$\{cubyfitScheme\}/g)).toHaveLength(1);
    expect(out.match(/\$\{cubyfitDevClientScheme\}/g)).toHaveLength(1);
  });

  it('fails loudly when the generated template changes', () => {
    expect(() => transformManifest('<manifest/>', 'betterday')).toThrow();
    expect(() => transformBuildGradle('android {}', 'betterday', 'x')).toThrow();
  });
});
