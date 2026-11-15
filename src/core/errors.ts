/** Readable messages for storage failures so screens never show a raw SQLite error. */
export function storageErrorMessage(cause: unknown) {
  const text = cause instanceof Error ? cause.message : String(cause);
  if (/database is locked|SQLITE_BUSY|database table is locked/i.test(text)) return 'Cubyfit was busy saving other data. Please try again.';
  if (/FOREIGN KEY constraint failed/i.test(text)) return 'Some linked data is no longer available. Refresh the screen and try again.';
  if (/Sign in before accessing local fitness data/i.test(text)) return 'Your session is still starting. Please try again in a moment.';
  return text;
}
