import { Asset } from 'expo-asset';
import { Directory, DownloadTask, File, FileMode, Paths, type DownloadPauseState } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Gunzip } from 'fflate';
import bundledManifest from './catalog/food-manifest.json';
import { cachedManifest, catalogGatewayEndpoints, downloadRetryDelay, failedManifestMemo, nextManifestRetry, shouldDownloadCatalog, successfulManifestMemo, trustedCatalogInstallation, unchangedInvalidCatalog, type CatalogInstallationRecord, type CatalogManifestMemo } from './catalogProtection';

export type CatalogFood = {
  id: string; name: string; category: string | null; kcal_100: number | null;
  protein_100: number | null; carbs_100: number | null; fat_100: number | null;
  fiber_100: number | null; sugar_100: number | null; sodium_100: number | null;
  serving_name: string | null; serving_quantity: number | null; serving_grams: number | null;
  sources_json: string | null; micronutrients_json: string | null;
};
type CatalogFile = { food_count: number; filename: string; download_url: string | null; compressed_bytes: number; sqlite_bytes: number; sha256: string; sqlite_sha256: string };
export type CatalogManifest = { version: string; schema_version: number; release_date: string; minimum_supported_schema_version: number; catalogs: { starter: CatalogFile; full: CatalogFile } };
export type CatalogStatus = { installed: boolean; needsRepair: boolean; version: string | null; downloading: boolean; progress: number; error: string | null; availableBytes: number; availableSqliteBytes: number; completedDownloads: number; attemptedDownloads: number; resumable: boolean };
const root = new Directory(Paths.document, 'cubyfit-food-catalog');
const storageKey = 'cubyfit:food-catalog:active-full';
const manifestMemoKey = 'cubyfit:food-catalog:manifest-memo';
const resumeStateKey = 'cubyfit:food-catalog:download-resume';
const completedDownloadsKey = 'cubyfit:food-catalog:completed-downloads';
const attemptedDownloadsKey = 'cubyfit:food-catalog:attempted-downloads';
const downloadRetryKey = 'cubyfit:food-catalog:download-retry';
const starterName = 'foods-starter-v4.db';
// Metro resolves this static asset into the standalone Android and iOS binary.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bundledFullAsset = require('../../assets/foods-full-v4.sqlite.gz');
const bundledInstallSuffix = '.bundled-installing.sqlite';
type ActiveRelease = CatalogInstallationRecord;
type SavedDownload = { version: string; url: string; pauseState?: Omit<DownloadPauseState, 'headers'> };
type DownloadRetryMemo = { version: string; failures: number; retryAt: number };
class CatalogAuthError extends Error {}
let active: { name: string; db: SQLite.SQLiteDatabase } | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;
let task: DownloadTask | null = null;
let downloadPromise: Promise<void> | null = null;
let pauseRequested = false;
let cancellationEpoch = 0;
let resumeState: SavedDownload | null = null;
let resumeStateLoaded = false;
let manifestPromise: Promise<CatalogManifest> | null = null;
let recoveryPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let bundledInstallPromise: Promise<File> | null = null;

function ensureDirectory() { root.create({ idempotent: true, intermediates: true }); }
function releaseFile(name: string) { return new File(root, name); }
function gatewayUrl() { return process.env.EXPO_PUBLIC_CATALOG_GATEWAY_URL?.trim().replace(/\/+$/, '') ?? ''; }
function configuredManifestUrl() { return catalogGatewayEndpoints(gatewayUrl(), 'v1')?.manifestUrl ?? ''; }
function downloadUrlFor(release: CatalogManifest) { return catalogGatewayEndpoints(gatewayUrl(), release.version)?.downloadUrl ?? ''; }
function validReleaseName(name: string) { return /^foods-full-v[1-9]\d*\.sqlite$/.test(name); }
function bundledFinalName() { return bundledManifest.catalogs.full.filename.replace(/\.gz$/, ''); }
async function storedRelease(): Promise<ActiveRelease | null> {
  const text = await Storage.getItem(storageKey);
  if (!text) return null;
  try {
    const value = JSON.parse(text) as ActiveRelease;
    return value && validReleaseName(value.name) && value.name === `foods-full-${value.version}.sqlite` && Number.isSafeInteger(value.count) && value.count > 0 && /^v[1-9]\d*$/.test(value.version) && (value.sha256 === undefined || /^[a-f0-9]{64}$/.test(value.sha256)) ? value : null;
  } catch { return null; }
}

async function validate(file: File, expectedCount: number, thorough: boolean) {
  const database = await SQLite.openDatabaseAsync(file.name, { useNewConnection: true }, root.uri);
  try {
    if (thorough) {
      const integrity = await database.getFirstAsync<Record<string, string>>('PRAGMA integrity_check');
      if (Object.values(integrity ?? {})[0] !== 'ok') throw Error('Catalog SQLite integrity check failed.');
    }
    const info = await database.getFirstAsync<{ value: string }>("SELECT value FROM catalog_info WHERE key='schema_version'");
    if (Number(info?.value) !== bundledManifest.schema_version) throw Error('Catalog schema is incompatible with this app.');
    const count = await database.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM foods');
    if (count?.n !== expectedCount) throw Error('Catalog food count does not match the manifest.');
    return database;
  } catch (error) { await database.closeAsync(); throw error; }
}

async function ensureStarter() {
  ensureDirectory();
  const file = releaseFile(starterName);
  if (file.exists && (file.size !== bundledManifest.catalogs.starter.sqlite_bytes || await hashFile(file) !== bundledManifest.catalogs.starter.sqlite_sha256)) file.delete();
  if (!file.exists) {
    const asset = await Asset.fromModule(require('../../assets/foods-starter-v4.db')).downloadAsync();
    if (!asset.localUri) throw Error('Bundled food catalog is unavailable.');
    await new File(asset.localUri).copy(file);
  }
  return file;
}

async function recordBundledFull(file: File) {
  const full = bundledManifest.catalogs.full;
  await Storage.setItem(storageKey, JSON.stringify({
    name: file.name, count: full.food_count, version: bundledManifest.version,
    sha256: full.sqlite_sha256, sqliteBytes: full.sqlite_bytes,
    schemaVersion: bundledManifest.schema_version, databasePath: file.uri,
    modifiedAt: file.modificationTime, validatedAt: Date.now(), status: 'ready',
  } satisfies ActiveRelease));
}

async function verifiedBundledFull(file: File) {
  const full = bundledManifest.catalogs.full;
  if (!file.exists || file.size !== full.sqlite_bytes || await hashFile(file) !== full.sqlite_sha256) return false;
  const checked = await validate(file, full.food_count, true);
  await checked.closeAsync();
  return true;
}

async function installBundledFullCatalog(): Promise<File> {
  if (bundledInstallPromise) return bundledInstallPromise;
  const operation = (async () => {
    ensureDirectory();
    const full = bundledManifest.catalogs.full;
    const finalName = bundledFinalName();
    if (!validReleaseName(finalName)) throw Error('Bundled catalog filename is invalid.');
    const final = releaseFile(finalName);
    if (final.exists) {
      if (await verifiedBundledFull(final)) {
        await recordBundledFull(final);
        return final;
      }
      final.delete();
    }
    const reserve = full.sqlite_bytes + 32 * 1024 * 1024;
    if (Paths.availableDiskSpace < reserve) throw Error('Not enough free storage to prepare the offline food library.');
    const staged = releaseFile(`${finalName}${bundledInstallSuffix}`);
    if (staged.exists) staged.delete();
    const asset = await Asset.fromModule(bundledFullAsset).downloadAsync();
    if (!asset.localUri) throw Error('Bundled food library is unavailable.');
    const archive = new File(asset.localUri);
    if (archive.size !== full.compressed_bytes || await hashFile(archive) !== full.sha256) throw Error('Bundled food library checksum failed.');
    try {
      await decompress(archive, staged, () => false);
      if (!await verifiedBundledFull(staged)) throw Error('Bundled food library integrity check failed.');
      await staged.move(final);
      await recordBundledFull(final);
      return final;
    } catch (cause) {
      if (staged.exists) staged.delete();
      throw cause;
    }
  })();
  bundledInstallPromise = operation.finally(() => { bundledInstallPromise = null; });
  return bundledInstallPromise;
}

async function openCatalogOnce(): Promise<SQLite.SQLiteDatabase> {
  const stored = await storedRelease();
  let openedName = starterName;
  let next: SQLite.SQLiteDatabase | null = null;
  if (stored) {
    const full = releaseFile(stored.name);
    if (full.exists && !unchangedInvalidCatalog(stored, full)) {
      try {
        const expectedSha = stored.sha256 ?? (stored.version === bundledManifest.version ? bundledManifest.catalogs.full.sqlite_sha256 : '');
        const expectedBytes = stored.sqliteBytes ?? (stored.version === bundledManifest.version ? bundledManifest.catalogs.full.sqlite_bytes : 0);
        if (!expectedSha || !expectedBytes || full.size !== expectedBytes) throw Error('Catalog file metadata changed.');
        const trusted = trustedCatalogInstallation(stored, full, bundledManifest.schema_version, expectedSha, expectedBytes);
        if (!trusted && await hashFile(full) !== expectedSha) throw Error('Catalog checksum failed.');
        try { next = await validate(full, stored.count, !trusted); }
        catch (cause) {
          if (!trusted) throw cause;
          if (await hashFile(full) !== expectedSha) throw Error('Catalog checksum failed.');
          next = await validate(full, stored.count, true);
        }
        if (!trusted) await Storage.setItem(storageKey, JSON.stringify({
          ...stored, status: 'ready', schemaVersion: bundledManifest.schema_version,
          databasePath: full.uri, modifiedAt: full.modificationTime, validatedAt: Date.now(),
          sha256: expectedSha, sqliteBytes: expectedBytes, observedBytes: undefined,
        } satisfies ActiveRelease));
        openedName = full.name;
      } catch {
        if (next) { await next.closeAsync(); next = null; }
        await Storage.setItem(storageKey, JSON.stringify({ ...stored, status: 'invalid',
          observedBytes: full.size, modifiedAt: full.modificationTime } satisfies ActiveRelease)).catch(() => {});
      }
    } else if (!full.exists && stored.status !== 'invalid') {
      await Storage.setItem(storageKey, JSON.stringify({ ...stored, status: 'invalid', observedBytes: -1, modifiedAt: null } satisfies ActiveRelease)).catch(() => {});
    }
  }
  if (!next) {
    try {
      const full = await installBundledFullCatalog();
      next = await validate(full, bundledManifest.catalogs.full.food_count, false);
      openedName = full.name;
    } catch {
      const starter = await ensureStarter();
      next = await validate(starter, bundledManifest.catalogs.starter.food_count, false);
      openedName = starter.name;
    }
  }
  const previous = active as { name: string; db: SQLite.SQLiteDatabase } | null;
  active = { name: openedName, db: next };
  if (previous) await previous.db.closeAsync();
  return next;
}

export function openFoodCatalog(): Promise<SQLite.SQLiteDatabase> {
  if (active) return Promise.resolve(active.db);
  if (!opening) opening = openCatalogOnce().finally(() => { opening = null; });
  return opening;
}

// Starts the one-time bundled catalog installation without touching user data
// or the network. Nutrition calls this as soon as its screen opens.
export async function prepareFoodCatalog() { await openFoodCatalog(); }

async function recoverCatalogAfterReadFailure(cause: unknown): Promise<SQLite.SQLiteDatabase> {
  if (recoveryPromise) return recoveryPromise;
  const operation = (async () => {
    const failed = active;
    const stored = await storedRelease();
    if (!failed || failed.name === starterName || stored?.name !== failed.name) throw cause;
    const full = releaseFile(failed.name);
    let healthy = false;
    try {
      if (full.exists && full.size === stored.sqliteBytes && stored.sha256 && await hashFile(full) === stored.sha256) {
        const checked = await validate(full, stored.count, true);
        await checked.closeAsync();
        healthy = true;
      }
    } catch { /* The full catalog failed an integrity or checksum check. */ }
    if (healthy) throw cause;
    if (active?.name !== failed.name) return openFoodCatalog();
    active = null;
    await failed.db.closeAsync().catch(() => {});
    await Storage.setItem(storageKey, JSON.stringify({ ...stored, status: 'invalid',
      observedBytes: full.size, modifiedAt: full.modificationTime } satisfies ActiveRelease)).catch(() => {});
    const starter = await ensureStarter();
    const database = await validate(starter, bundledManifest.catalogs.starter.food_count, false);
    active = { name: starter.name, db: database };
    return database;
  })();
  recoveryPromise = operation.finally(() => { recoveryPromise = null; });
  return recoveryPromise;
}

async function readCatalog<T>(read: (database: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const database = await openFoodCatalog();
  try { return await read(database); }
  catch (cause) { return read(await recoverCatalogAfterReadFailure(cause)); }
}

export async function catalogStatus(): Promise<CatalogStatus> {
  await openFoodCatalog();
  const stored = await storedRelease();
  const installedFile = stored ? releaseFile(stored.name) : null;
  const installed = !!stored && stored.status === 'ready' && active?.name === stored.name &&
    !!installedFile?.exists && installedFile.size === stored.sqliteBytes &&
    (stored.modifiedAt == null || installedFile.modificationTime == null || installedFile.modificationTime === stored.modifiedAt);
  const resume = await loadResumeState();
  const completedDownloads = Number(await Storage.getItem(completedDownloadsKey) ?? '0');
  const attemptedDownloads = Number(await Storage.getItem(attemptedDownloadsKey) ?? '0');
  return { installed, needsRepair: !!stored && !installed,
    version: installed ? stored!.version : null, downloading: !!downloadPromise,
    progress: 0, error: stored && !installed ? 'The complete catalog needs repair. The starter catalog remains available.' : null, availableBytes: bundledManifest.catalogs.full.compressed_bytes,
    availableSqliteBytes: bundledManifest.catalogs.full.sqlite_bytes,
    completedDownloads: Number.isSafeInteger(completedDownloads) && completedDownloads > 0 ? completedDownloads : 0,
    attemptedDownloads: Number.isSafeInteger(attemptedDownloads) && attemptedDownloads > 0 ? attemptedDownloads : 0,
    resumable: !!resume?.pauseState?.resumeData };
}

export async function searchFoodCatalog(query: string, category: string | null = null): Promise<CatalogFood[]> {
  return readCatalog(async d => {
    const term = query.trim();
    if (/^\d{8}$|^\d{12,14}$/.test(term)) return d.getAllAsync<CatalogFood>(
      'SELECT f.id,f.name,f.category,f.kcal_100,f.protein_100,f.carbs_100,f.fat_100,f.fiber_100,f.sugar_100,f.sodium_100,f.serving_name,f.serving_quantity,f.serving_grams,f.sources_json,f.micronutrients_json FROM food_barcodes b JOIN foods f ON f.id=b.food_id WHERE b.barcode=? AND (? IS NULL OR f.category=?) LIMIT 30', term, category, category);
    const words = term.match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
    if (!words.length) return category
      ? d.getAllAsync<CatalogFood>(
        'SELECT id,name,category,kcal_100,protein_100,carbs_100,fat_100,fiber_100,sugar_100,sodium_100,serving_name,serving_quantity,serving_grams,sources_json,micronutrients_json FROM foods WHERE category=? ORDER BY name LIMIT 30', category)
      : d.getAllAsync<CatalogFood>(
        "SELECT id,name,category,kcal_100,protein_100,carbs_100,fat_100,fiber_100,sugar_100,sodium_100,serving_name,serving_quantity,serving_grams,sources_json,micronutrients_json FROM foods WHERE category='everyday' ORDER BY name LIMIT 30");
    const fts = words.map(word => `"${word.replace(/"/g, '')}"*`).join(' ');
    const rows = await d.getAllAsync<CatalogFood>(
      'SELECT f.id,f.name,f.category,f.kcal_100,f.protein_100,f.carbs_100,f.fat_100,f.fiber_100,f.sugar_100,f.sodium_100,f.serving_name,f.serving_quantity,f.serving_grams,f.sources_json,f.micronutrients_json FROM food_search s JOIN foods f ON f.id=s.food_id WHERE food_search MATCH ? AND (? IS NULL OR f.category=?) ORDER BY rank LIMIT 90',
      fts, category, category);
    return [...new Map<string, CatalogFood>(rows.map(row => [row.id, row] as const)).values()].slice(0, 30);
  });
}

export async function foodCategories(): Promise<string[]> {
  return readCatalog(async d => {
    const rows = await d.getAllAsync<{ category: string }>('SELECT DISTINCT category FROM foods WHERE category IS NOT NULL ORDER BY category');
    return rows.map(row => row.category);
  });
}

async function hashFile(file: File) {
  const hash = sha256.create();
  const handle = file.open(FileMode.ReadOnly);
  try {
    for (;;) {
      const bytes = await handle.readBytes(1024 * 1024);
      if (!bytes.length) break;
      hash.update(bytes);
    }
  } finally { handle.close(); }
  return bytesToHex(hash.digest());
}

async function decompress(source: File, destination: File, shouldAbort: () => boolean = () => pauseRequested) {
  destination.create();
  const reader = source.open(FileMode.ReadOnly);
  const writer = destination.open(FileMode.WriteOnly);
  let writes = Promise.resolve();
  const gunzip = new Gunzip((chunk) => { writes = writes.then(() => writer.writeBytes(chunk)); });
  try {
    for (;;) {
      if (shouldAbort()) throw Error('Download paused.');
      const bytes = await reader.readBytes(256 * 1024);
      if (!bytes.length) break;
      gunzip.push(bytes, false);
      await writes;
    }
    gunzip.push(new Uint8Array(), true);
    await writes;
  } finally { reader.close(); writer.close(); }
}

async function loadManifestMemo(): Promise<CatalogManifestMemo | null> {
  const raw = await Storage.getItem(manifestMemoKey);
  if (!raw) return null;
  try { return JSON.parse(raw) as CatalogManifestMemo; } catch { return null; }
}

async function loadResumeState(): Promise<SavedDownload | null> {
  if (resumeStateLoaded) return resumeState;
  resumeStateLoaded = true;
  const raw = await Storage.getItem(resumeStateKey);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as SavedDownload;
    if (saved && /^v[1-9]\d*$/.test(saved.version) && /^https:\/\//.test(saved.url) &&
      (!saved.pauseState || (typeof saved.pauseState.resumeData === 'string' && !('headers' in saved.pauseState)))) {
      resumeState = saved;
      return saved;
    }
  } catch { /* ignore malformed cache metadata */ }
  await Storage.removeItem(resumeStateKey);
  return null;
}

async function saveResumeState(saved: SavedDownload | null) {
  resumeState = saved;
  resumeStateLoaded = true;
  if (saved) await Storage.setItem(resumeStateKey, JSON.stringify(saved));
  else await Storage.removeItem(resumeStateKey);
}

function retryAfterMs(response: Response) {
  const seconds = Number(response.headers.get('Retry-After'));
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 6 * 60 * 60 * 1000);
  const date = Date.parse(response.headers.get('Retry-After') ?? '');
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function validateManifest(release: CatalogManifest) {
  const full = release.catalogs?.full;
  if (release.schema_version !== bundledManifest.schema_version || release.minimum_supported_schema_version > bundledManifest.schema_version || !/^v[1-9]\d*$/.test(release.version) || !full || !/^([a-f0-9]{64})$/.test(full.sha256) || !/^([a-f0-9]{64})$/.test(full.sqlite_sha256) || full.filename !== `foods-full-${release.version}.sqlite.gz` || !Number.isSafeInteger(full.compressed_bytes) || !Number.isSafeInteger(full.sqlite_bytes) || !Number.isSafeInteger(full.food_count) || full.compressed_bytes <= 0 || full.sqlite_bytes <= 0 || full.food_count <= 0) throw Error('Catalog manifest is invalid or incompatible.');
}

export function fetchCatalogManifest(getToken?: () => Promise<string | null>, manual = false): Promise<CatalogManifest> {
  if (manifestPromise) return manifestPromise;
  const operation = (async () => {
    const url = configuredManifestUrl();
    if (!url || !/^https:\/\//.test(url)) throw Error('Catalog downloads are not configured yet.');
    let memo = await loadManifestMemo();
    const now = Date.now();
    const cached = cachedManifest(memo, url, now);
    if (cached && (!manual || now - (memo?.fetchedAt ?? 0) < 60_000)) return JSON.parse(cached) as CatalogManifest;
    const wait = nextManifestRetry(memo, url, now);
    if (wait > 0) {
      if (memo?.json) return JSON.parse(memo.json) as CatalogManifest;
      throw Error(`Catalog service is cooling down. Try again in ${Math.ceil(wait / 60_000)} minute(s).`);
    }
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (gatewayUrl()) {
        const token = await getToken?.();
        if (!token) throw new CatalogAuthError('Sign in to check for food catalog updates.');
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(url, { headers });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new CatalogAuthError('Your sign-in expired. Sign in again to check for updates.');
        memo = failedManifestMemo(memo, url, Date.now(), retryAfterMs(response));
        await Storage.setItem(manifestMemoKey, JSON.stringify(memo));
        throw Error(response.status === 429 ? `Catalog check rate limited. Retry after ${response.headers.get('Retry-After') ?? 'a short wait'}.` : `Catalog service unavailable (${response.status}). Your installed foods remain available offline.`);
      }
      const release = await response.json() as CatalogManifest;
      validateManifest(release);
      memo = successfulManifestMemo(url, Date.now(), JSON.stringify(release));
      await Storage.setItem(manifestMemoKey, JSON.stringify(memo));
      return release;
    } catch (cause) {
      if (!(cause instanceof CatalogAuthError) && (!memo || memo.retryAt <= Date.now())) {
        memo = failedManifestMemo(memo, url, Date.now());
        await Storage.setItem(manifestMemoKey, JSON.stringify(memo));
      }
      throw cause;
    }
  })();
  manifestPromise = operation.finally(() => { manifestPromise = null; });
  return manifestPromise;
}

export async function cancelCatalogDownload() {
  cancellationEpoch += 1;
  pauseRequested = true;
  if (!task || task.state !== 'active') return;
  try {
    await task.pauseAsync();
    if (String(task.state) === 'paused') {
      const { headers: _headers, ...safeState } = task.savable();
      const saved = await loadResumeState();
      if (saved) await saveResumeState({ ...saved, pauseState: safeState });
    }
  } catch {
    task?.cancel();
  }
}

type TokenGetter = (options?: { template?: 'convex'; skipCache?: boolean }) => Promise<string | null>;

async function authorizeDownload(release: CatalogManifest, getToken?: TokenGetter) {
  const base = gatewayUrl();
  const url = downloadUrlFor(release);
  if (!url || !/^https:\/\//.test(url)) throw Error('Catalog download URL is not configured.');
  if (!base) throw Error('Secure catalog downloads are not configured for this build.');
  if (!getToken) throw new CatalogAuthError('Sign in to download the complete catalog.');
  const token = await getToken({ template: 'convex', skipCache: true });
  if (!token) throw new CatalogAuthError('Sign in to download the complete catalog.');
  const response = await fetch(`${base}/v1/authorize`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: release.version }),
  });
  if (!response.ok) {
    const retry = response.headers.get('Retry-After');
    if (response.status === 401 || response.status === 403) throw new CatalogAuthError('Your sign-in expired. Sign in again to download the catalog.');
    throw Error(response.status === 429 ? `Download limit reached. Retry after ${retry ?? 'a short wait'}.` : `Catalog authorization unavailable (${response.status}).`);
  }
  const result = await response.json() as { sessionId?: string };
  if (!result.sessionId || !/^[0-9a-f-]{36}$/i.test(result.sessionId)) throw Error('Catalog authorization response was invalid.');
  return { url, headers: { Authorization: `Bearer ${token}`, 'X-Catalog-Session': result.sessionId }, sessionId: result.sessionId };
}

async function performInstallFullCatalog(release: CatalogManifest, onProgress: (fraction: number) => void, getToken?: TokenGetter) {
  const startedAtEpoch = cancellationEpoch;
  pauseRequested = false;
  const requireActiveDownload = () => {
    if (pauseRequested || startedAtEpoch !== cancellationEpoch) throw Error('Download paused. Tap Resume to continue.');
  };
  const info = release.catalogs.full;
  validateManifest(release);
  if (release.schema_version !== bundledManifest.schema_version) throw Error('Catalog schema is incompatible.');
  const finalName = info.filename.replace(/\.gz$/, '').replace(/\.sqlite$/, '.sqlite');
  if (!validReleaseName(finalName)) throw Error('Invalid catalog filename.');
  ensureDirectory();
  const current = await storedRelease();
  if (current && Number(current.version.slice(1)) > Number(release.version.slice(1))) throw Error('A newer food catalog is already installed.');
  const currentFile = current ? releaseFile(current.name) : null;
  if (current?.version === release.version && currentFile?.exists) {
    const currentHash = await hashFile(currentFile);
    const checksumMatches = currentFile.size === info.sqlite_bytes && currentHash === info.sqlite_sha256;
    if (!shouldDownloadCatalog(current.version, release.version, checksumMatches)) {
      if (current.status !== 'ready') {
        const checked = await validate(currentFile, info.food_count, true);
        await checked.closeAsync();
        await Storage.setItem(storageKey, JSON.stringify({ ...current, status: 'ready', schemaVersion: bundledManifest.schema_version,
          databasePath: currentFile.uri, modifiedAt: currentFile.modificationTime, validatedAt: Date.now(),
          sha256: info.sqlite_sha256, sqliteBytes: info.sqlite_bytes, observedBytes: undefined } satisfies ActiveRelease));
        if (active?.name !== currentFile.name && active) { await active.db.closeAsync(); active = null; }
      }
      onProgress(1);
      return;
    }
    throw Error('The installed catalog for this version failed its checksum. The existing file was kept; contact support before replacing an immutable release.');
  }
  const reserve = info.compressed_bytes + info.sqlite_bytes + 32 * 1024 * 1024;
  if (Paths.availableDiskSpace < reserve) throw Error('Not enough free storage for this catalog update.');
  const compressed = releaseFile(`${finalName}.pending.gz`);
  const unpacked = releaseFile(`${finalName}.pending.sqlite`);
  if (unpacked.exists && (unpacked.size !== info.sqlite_bytes || await hashFile(unpacked) !== info.sqlite_sha256)) unpacked.delete();
  const downloadUrl = downloadUrlFor(release);
  const oldResume = await loadResumeState();
  let compressedValid = compressed.exists && compressed.size === info.compressed_bytes && await hashFile(compressed) === info.sha256;
  if (!compressedValid) {
    const canResume = !!oldResume?.pauseState?.resumeData && oldResume.version === release.version && oldResume.url === downloadUrl;
    if (compressed.exists && !canResume) compressed.delete();
    requireActiveDownload();
    const authorization = await authorizeDownload(release, getToken);
    requireActiveDownload();
    await saveResumeState({ version: release.version, url: authorization.url, ...(canResume ? { pauseState: oldResume!.pauseState } : {}) });
    const headers = { ...authorization.headers };
    if (gatewayUrl() && getToken) {
      const freshToken = await getToken({ template: 'convex', skipCache: true });
      if (!freshToken) throw Error('Your sign-in expired. Sign in again to continue this download.');
      requireActiveDownload();
      headers.Authorization = `Bearer ${freshToken}`;
    }
    const priorAttempts = Number(await Storage.getItem(attemptedDownloadsKey) ?? '0');
    await Storage.setItem(attemptedDownloadsKey, String(Number.isSafeInteger(priorAttempts) && priorAttempts > 0 ? priorAttempts + 1 : 1));
    const onTaskProgress = ({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) => onProgress(totalBytes > 0 ? bytesWritten / totalBytes : bytesWritten / info.compressed_bytes);
    task = canResume
      ? DownloadTask.fromSavable({ ...oldResume!.pauseState!, headers: undefined }, { headers, onProgress: onTaskProgress })
      : File.createDownloadTask(authorization.url, compressed, { headers, onProgress: onTaskProgress });
    requireActiveDownload();
    const downloaded = canResume ? await task.resumeAsync() : await task.downloadAsync();
    if (!downloaded || pauseRequested) throw Error('Download paused. Tap Resume to continue.');
    if (compressed.size !== info.compressed_bytes || await hashFile(compressed) !== info.sha256) throw Error('Downloaded catalog checksum failed.');
    compressedValid = true;
    await saveResumeState({ version: release.version, url: authorization.url });
  }
  if (!unpacked.exists) await decompress(compressed, unpacked);
  if (unpacked.size !== info.sqlite_bytes || await hashFile(unpacked) !== info.sqlite_sha256) throw Error('Unpacked catalog checksum failed.');
  const checked = await validate(unpacked, info.food_count, true);
  await checked.closeAsync();
  requireActiveDownload();
  const final = releaseFile(finalName);
  if (final.exists) {
    if (await hashFile(final) !== info.sqlite_sha256) throw Error('A different file already uses this catalog version. The previous catalog was preserved.');
    unpacked.delete();
  } else await unpacked.move(final);
  requireActiveDownload();
  if (opening) await opening;
  const previous = active;
  await Storage.setItem(storageKey, JSON.stringify({ name: final.name, count: info.food_count, version: release.version,
    sha256: info.sqlite_sha256, sqliteBytes: info.sqlite_bytes, schemaVersion: bundledManifest.schema_version,
    databasePath: final.uri, modifiedAt: final.modificationTime, validatedAt: Date.now(), status: 'ready' } satisfies ActiveRelease));
  if (previous) { await previous.db.closeAsync(); active = null; }
  const completed = Number(await Storage.getItem(completedDownloadsKey) ?? '0');
  await Storage.setItem(completedDownloadsKey, String(Number.isSafeInteger(completed) && completed > 0 ? completed + 1 : 1));
  await saveResumeState(null);
  onProgress(1);
  if (compressed.exists) compressed.delete();
  if (unpacked.exists) unpacked.delete();
  void compressedValid;
}

export function installFullCatalog(release: CatalogManifest, onProgress: (fraction: number) => void, getToken?: TokenGetter): Promise<void> {
  if (downloadPromise) return downloadPromise;
  const operation = (async () => {
    const raw = await Storage.getItem(downloadRetryKey);
    let memo: DownloadRetryMemo | null = null;
    try { memo = raw ? JSON.parse(raw) as DownloadRetryMemo : null; } catch { memo = null; }
    if (memo?.version === release.version && memo.retryAt > Date.now()) throw Error(`Download retry is cooling down. Try again in ${Math.ceil((memo.retryAt - Date.now()) / 1000)} seconds.`);
    try {
      await performInstallFullCatalog(release, onProgress, getToken);
      await Storage.removeItem(downloadRetryKey);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      if (!(cause instanceof CatalogAuthError) && !/paused|not enough free storage|already installed|newer food catalog/i.test(message)) {
        const failures = memo?.version === release.version ? Math.min(memo.failures + 1, 12) : 1;
        const retryMatch = /retry after\s+(\d+)/i.exec(message);
        const retryAfter = retryMatch ? Number(retryMatch[1]) * 1000 : 0;
        await Storage.setItem(downloadRetryKey, JSON.stringify({ version: release.version, failures, retryAt: Date.now() + downloadRetryDelay(failures, retryAfter) }));
      }
      throw cause;
    }
  })();
  downloadPromise = operation.finally(() => { task?.release(); task = null; pauseRequested = false; downloadPromise = null; });
  return downloadPromise;
}

export async function removeFullCatalog() {
  if (task) throw Error('Cancel the download first.');
  if (opening) await opening;
  ensureDirectory();
  await Storage.removeItem(storageKey);
  if (active) { await active.db.closeAsync(); active = null; }
  for (const item of root.list()) if (item instanceof File && validReleaseName(item.name)) item.delete();
}
