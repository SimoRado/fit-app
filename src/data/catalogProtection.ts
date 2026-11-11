export type CatalogManifestMemo = {
  endpoint: string;
  fetchedAt: number;
  failures: number;
  retryAt: number;
  json: string;
};

export const CATALOG_CHECK_COOLDOWN_MS = 15 * 60 * 1000;
export const CATALOG_RETRY_BASE_MS = 60 * 1000;
export const CATALOG_RETRY_MAX_MS = 6 * 60 * 60 * 1000;
export const DOWNLOAD_RETRY_BASE_MS = 30 * 1000;
export const DOWNLOAD_RETRY_MAX_MS = 30 * 60 * 1000;

export function cachedManifest(memo: CatalogManifestMemo | null, endpoint: string, now: number): string | null {
  if (memo?.endpoint === endpoint && now - memo.fetchedAt < CATALOG_CHECK_COOLDOWN_MS) return memo.json;
  return null;
}

export function nextManifestRetry(memo: CatalogManifestMemo | null, endpoint: string, now: number) {
  if (memo?.endpoint !== endpoint) return 0;
  return Math.max(0, memo.retryAt - now);
}

export function failedManifestMemo(memo: CatalogManifestMemo | null, endpoint: string, now: number, retryAfterMs = 0): CatalogManifestMemo {
  const failures = memo?.endpoint === endpoint ? Math.min(memo.failures + 1, 20) : 1;
  const exponential = Math.min(CATALOG_RETRY_BASE_MS * (2 ** Math.min(failures - 1, 12)), CATALOG_RETRY_MAX_MS);
  return {
    endpoint,
    fetchedAt: memo?.endpoint === endpoint ? memo.fetchedAt : 0,
    failures,
    retryAt: now + Math.max(exponential, Math.min(Math.max(0, retryAfterMs), CATALOG_RETRY_MAX_MS)),
    json: memo?.endpoint === endpoint ? memo.json : '',
  };
}

export function successfulManifestMemo(endpoint: string, now: number, json: string): CatalogManifestMemo {
  return { endpoint, fetchedAt: now, failures: 0, retryAt: 0, json };
}

export function downloadRetryDelay(failures: number, retryAfterMs = 0) {
  const exponent = Math.max(0, Math.min(Math.ceil(failures) - 1, 10));
  return Math.max(Math.min(DOWNLOAD_RETRY_BASE_MS * (2 ** exponent), DOWNLOAD_RETRY_MAX_MS), Math.min(Math.max(0, retryAfterMs), 6 * 60 * 60 * 1000));
}

export function needsLargeDownloadConfirmation(completedDownloads: number, installed: boolean, priorAttempts = 0, resumable = false) {
  return installed || completedDownloads > 0 || priorAttempts > 0 || resumable;
}

export function shouldDownloadCatalog(installedVersion: string | null, requestedVersion: string, installedChecksumMatches: boolean) {
  return !(installedVersion === requestedVersion && installedChecksumMatches);
}

export type CatalogInstallationRecord = {
  name: string;
  version: string;
  count: number;
  sha256?: string;
  sqliteBytes?: number;
  observedBytes?: number;
  schemaVersion?: number;
  databasePath?: string;
  modifiedAt?: number | null;
  validatedAt?: number;
  status?: 'ready' | 'invalid';
};

export function trustedCatalogInstallation(
  record: CatalogInstallationRecord,
  file: { uri: string; size: number; modificationTime: number | null },
  schemaVersion: number,
  expectedSha256: string,
  expectedBytes: number,
) {
  return record.status === 'ready' && record.schemaVersion === schemaVersion &&
    record.databasePath === file.uri && record.sha256 === expectedSha256 &&
    record.sqliteBytes === expectedBytes && file.size === expectedBytes &&
    Number.isFinite(record.validatedAt) && (record.validatedAt ?? 0) > 0 &&
    (record.modifiedAt == null || file.modificationTime == null || record.modifiedAt === file.modificationTime);
}

export function unchangedInvalidCatalog(record: CatalogInstallationRecord, file: { size: number; modificationTime: number | null }) {
  return record.status === 'invalid' && record.observedBytes === file.size &&
    (record.modifiedAt == null || file.modificationTime == null || record.modifiedAt === file.modificationTime);
}

export function catalogVersionNumber(version: string) {
  const match = /^v([1-9]\d*)$/.exec(version);
  return match ? Number(match[1]) : null;
}

export function catalogGatewayEndpoints(configuredUrl: string | null | undefined, version: string) {
  if (!configuredUrl?.trim() || catalogVersionNumber(version) === null) return null;
  try {
    const url = new URL(configuredUrl.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    const base = url.origin;
    return {
      manifestUrl: `${base}/v1/manifest`,
      downloadUrl: `${base}/v1/catalog/full/${version}`,
    };
  } catch {
    return null;
  }
}
