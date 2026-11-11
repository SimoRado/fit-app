import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Link } from 'expo-router';
import { Text } from './LocalizedText';
import { Button, confirm } from './components';
import { colors, fonts } from './theme';
import { catalogVersionNumber, needsLargeDownloadConfirmation } from '../data/catalogProtection';
import { cancelCatalogDownload, catalogStatus, fetchCatalogManifest, installFullCatalog, removeFullCatalog, type CatalogManifest, type CatalogStatus } from '../data/foodCatalog';

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function CatalogManagerSheet() {
  const { getToken, isSignedIn, userId } = useAuth();
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [release, setRelease] = useState<CatalogManifest | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => { void catalogStatus().then(setStatus).catch(cause => setError(String(cause))); }, []);
  useEffect(() => () => { void cancelCatalogDownload(); }, [userId]);
  async function check() {
    setBusy(true); setError('');
    try { setRelease(await fetchCatalogManifest(() => getToken({ template: 'convex' }), true)); }
    catch (cause) { setError(cause instanceof TypeError ? 'Offline or catalog service unavailable. Your installed foods remain available.' : cause instanceof Error ? cause.message : 'Could not check for catalog updates.'); }
    finally { setBusy(false); }
  }
  async function startDownload() {
    if (!release) return;
    setBusy(true); setError(''); setProgress(0);
    try { await installFullCatalog(release, setProgress, options => getToken(options)); setStatus(await catalogStatus()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Catalog download failed.'); }
    finally { setStatus(await catalogStatus().catch(() => status)); setBusy(false); }
  }
  function download() {
    if (!release) return;
    if (needsLargeDownloadConfirmation(status?.completedDownloads ?? 0, !!status?.installed, status?.attemptedDownloads ?? 0, !!status?.resumable)) {
      confirm(status?.resumable ? 'Resume the complete food catalog download?' : 'Download the complete food catalog again?', startDownload,
        `This download uses about ${mb(release.catalogs.full.compressed_bytes)} of data. Your starter catalog and saved meals remain available.`, 'Continue download');
      return;
    }
    void startDownload();
  }
  function remove() {
    confirm('Remove the complete food catalog?', async () => {
      try { await removeFullCatalog(); setStatus(await catalogStatus()); setRelease(null); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove the catalog.'); }
    }, 'Your meal history and the starter catalog will remain available.', 'Remove catalog');
  }
  const available = release?.catalogs.full ?? null;
  const update = !!available && !status?.needsRepair && (!status?.installed ||
    (catalogVersionNumber(release!.version) ?? 0) > (catalogVersionNumber(status.version ?? '') ?? 0));
  return <View style={{ gap: 13 }}>
    <Text style={{ color: colors.ink, fontFamily: fonts.displayHeavy, fontSize: 24 }}>Food library</Text>
    <Text style={{ color: colors.muted }}>The starter catalog is available offline. The complete catalog is optional and stays on this device until you remove it.</Text>
    <Text style={{ color: colors.ink, fontFamily: fonts.bold }}>Active catalog: {status?.installed ? 'Complete' : 'Starter (2,224 foods)'}</Text>
    <Text style={{ color: colors.ink, fontFamily: fonts.bold }}>Complete catalog: {status?.installed ? `installed (${status.version})` : 'not installed'}</Text>
    <Text style={{ color: colors.muted }}>Download: {mb(available?.compressed_bytes ?? status?.availableBytes ?? 0)} · Storage after installation: {mb(available?.sqlite_bytes ?? status?.availableSqliteBytes ?? 0)}</Text>
    {busy && progress > 0 && <Text accessibilityRole="progressbar" style={{ color: colors.ink }}>{progress >= 1 ? 'Verifying and installing…' : `Downloading ${Math.round(progress * 100)}%`}</Text>}
    {busy && progress > 0 ? <Button title="Pause download" kind="ghost" onPress={() => { void cancelCatalogDownload(); }}/> : <Button title={busy ? 'Checking…' : 'Check for updates'} disabled={busy} kind="ghost" onPress={check}/>}
    {available && update && <Button title={busy ? 'Downloading…' : status?.resumable ? 'Resume download' : error ? 'Retry download' : status?.installed ? 'Install update' : 'Download complete catalog'} disabled={busy || (!!process.env.EXPO_PUBLIC_CATALOG_GATEWAY_URL && !isSignedIn)} onPress={download}/>}
    {available && status?.installed && status.version === release?.version && <Text style={{ color: colors.muted }}>Your complete catalog is up to date.</Text>}
    {(status?.installed || status?.needsRepair) && !busy && <Button title={status.needsRepair ? 'Remove damaged catalog' : 'Remove complete catalog'} kind="danger" onPress={remove}/>}
    {error || status?.error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error || status?.error}</Text> : null}
    <Text style={{ color: colors.muted, fontSize: 11 }}>Food data: <Link href="https://www.opennutrition.app" style={{ textDecorationLine: 'underline' }}>OpenNutrition</Link> (ODbL). Includes data © <Link href="https://world.openfoodfacts.org" style={{ textDecorationLine: 'underline' }}>Open Food Facts contributors</Link>.</Text>
  </View>;
}
