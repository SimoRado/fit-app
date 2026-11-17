import { requireOptionalNativeModule } from 'expo';
import { File, Paths } from 'expo-file-system';

/**
 * Local-only image export for "Share my year". The PNG is written to the app cache and handed to
 * the OS share sheet; nothing is uploaded.
 *
 * The native share sheet for files comes from `expo-sharing` (React Native's `Share` cannot attach
 * images on Android). It is not in the current Cubyfit Dev build, so it is looked up optionally:
 * until `npx expo install expo-sharing` and a new development build, `canShareFiles()` is false
 * and the preview explains that instead of failing.
 */
type SharingModule = { isAvailableAsync?: () => Promise<boolean>; shareAsync: (url: string, options?: { mimeType?: string; dialogTitle?: string; UTI?: string }) => Promise<void> };
const sharing = () => requireOptionalNativeModule<SharingModule>('ExpoSharing');

export const canShareFiles = () => !!sharing();

/** Writes a base64 PNG (with or without a data: prefix) to the cache and returns its file URI. */
export async function writePng(base64: string, name: string) {
  const clean = base64.replace(/^data:image\/png;base64,/, '');
  if (!clean || /[^A-Za-z0-9+/=\s]/.test(clean)) throw Error('The image could not be generated.');
  const file = new File(Paths.cache, name.replace(/[^A-Za-z0-9._-]/g, '-'));
  file.create({ overwrite: true });
  await file.write(clean, { encoding: 'base64' });
  return file.uri;
}

export async function shareFile(uri: string, dialogTitle: string) {
  const module = sharing();
  if (!module) throw Error('Sharing images needs the next Cubyfit Dev build.');
  if (module.isAvailableAsync && !(await module.isAvailableAsync())) throw Error('Sharing is not available on this device.');
  await module.shareAsync(uri, { mimeType: 'image/png', dialogTitle, UTI: 'public.png' });
}
