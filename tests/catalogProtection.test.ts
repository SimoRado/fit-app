import { describe, expect, it } from 'vitest';
import { cachedManifest, catalogGatewayEndpoints, downloadRetryDelay, failedManifestMemo, nextManifestRetry, needsLargeDownloadConfirmation, shouldDownloadCatalog, successfulManifestMemo, trustedCatalogInstallation, unchangedInvalidCatalog, type CatalogInstallationRecord } from '../src/data/catalogProtection';

describe('local catalog request protection', () => {
  it('requires the authenticated gateway and never derives a direct R2 fallback URL', () => {
    expect(catalogGatewayEndpoints('https://cubyfit-catalog-gateway.example.workers.dev/', 'v4')).toEqual({
      manifestUrl: 'https://cubyfit-catalog-gateway.example.workers.dev/v1/manifest',
      downloadUrl: 'https://cubyfit-catalog-gateway.example.workers.dev/v1/catalog/full/v4',
    });
    expect(catalogGatewayEndpoints('', 'v4')).toBeNull();
    expect(catalogGatewayEndpoints(undefined, 'v4')).toBeNull();
    expect(catalogGatewayEndpoints('http://catalog.example', 'v4')).toBeNull();
    expect(catalogGatewayEndpoints('https://catalog.example/path', 'v4')).toBeNull();
    expect(catalogGatewayEndpoints('https://catalog.example', 'https://public-r2.example/object')).toBeNull();
  });

  it('reuses a recently checked manifest instead of making another request', () => {
    const now = 1_000_000;
    const memo = successfulManifestMemo('https://catalog.example/v1/manifest', now, '{"version":"v4"}');
    expect(cachedManifest(memo, memo.endpoint, now + 14 * 60_000)).toBe('{"version":"v4"}');
    expect(cachedManifest(memo, memo.endpoint, now + 16 * 60_000)).toBeNull();
  });

  it('backs off failed checks exponentially and respects a longer Retry-After', () => {
    const endpoint = 'https://catalog.example/v1/manifest';
    const first = failedManifestMemo(null, endpoint, 10_000);
    const second = failedManifestMemo(first, endpoint, 70_000, 5 * 60_000);
    expect(nextManifestRetry(first, endpoint, 10_000)).toBe(60_000);
    expect(second.retryAt).toBe(70_000 + 5 * 60_000);
  });

  it('skips already-installed matching versions and confirms repeat large downloads', () => {
    expect(shouldDownloadCatalog('v4', 'v4', true)).toBe(false);
    expect(shouldDownloadCatalog('v4', 'v5', true)).toBe(true);
    expect(shouldDownloadCatalog('v4', 'v4', false)).toBe(true);
    expect(needsLargeDownloadConfirmation(0, false)).toBe(false);
    expect(needsLargeDownloadConfirmation(1, false)).toBe(true);
    expect(needsLargeDownloadConfirmation(0, true)).toBe(true);
    expect(needsLargeDownloadConfirmation(0, false, 1)).toBe(true);
    expect(needsLargeDownloadConfirmation(0, false, 0, true)).toBe(true);
  });

  it('backs off failed full-download retries while honoring Retry-After', () => {
    expect(downloadRetryDelay(1)).toBe(30_000);
    expect(downloadRetryDelay(3)).toBe(120_000);
    expect(downloadRetryDelay(20)).toBe(30 * 60_000);
    expect(downloadRetryDelay(1, 60 * 60_000)).toBe(60 * 60_000);
  });

  it('reuses a previously validated full catalog after restart using file metadata', () => {
    const record: CatalogInstallationRecord = {
      name: 'foods-full-v4.sqlite', version: 'v4', count: 326759,
      sha256: 'a'.repeat(64), sqliteBytes: 313692160, schemaVersion: 1,
      databasePath: 'file:///documents/cubyfit-food-catalog/foods-full-v4.sqlite',
      modifiedAt: 1000, validatedAt: 2000, status: 'ready',
    };
    const file = { uri: record.databasePath!, size: 313692160, modificationTime: 1000 };
    expect(trustedCatalogInstallation(record, file, 1, record.sha256!, record.sqliteBytes!)).toBe(true);
    expect(trustedCatalogInstallation(record, { ...file, modificationTime: 3000 }, 1, record.sha256!, record.sqliteBytes!)).toBe(false);
    expect(trustedCatalogInstallation(record, { ...file, size: 1 }, 1, record.sha256!, record.sqliteBytes!)).toBe(false);
    expect(trustedCatalogInstallation({ ...record, status: 'invalid' }, file, 1, record.sha256!, record.sqliteBytes!)).toBe(false);
  });

  it('keeps an unchanged invalid catalog in fallback state until the file changes', () => {
    const record: CatalogInstallationRecord = { name: 'foods-full-v4.sqlite', version: 'v4', count: 326759,
      status: 'invalid', observedBytes: 100, modifiedAt: 2000 };
    expect(unchangedInvalidCatalog(record, { size: 100, modificationTime: 2000 })).toBe(true);
    expect(unchangedInvalidCatalog(record, { size: 100, modificationTime: 3000 })).toBe(false);
  });
});
