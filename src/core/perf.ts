/**
 * Development-only performance markers. They log durations (never data) in a dev client and are
 * compiled to no-ops in release builds, so they add no production logging.
 */
const isDev = () => typeof __DEV__ !== 'undefined' && __DEV__;

export const perfNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

/** Logs `[perf] label: 123 ms` in development when the operation took at least `minMs`. */
export function perfMark(label: string, startedAt: number, minMs = 0) {
  if (!isDev()) return;
  const elapsed = perfNow() - startedAt;
  if (elapsed >= minMs) console.info(`[perf] ${label}: ${Math.round(elapsed)} ms`);
}

let tabPress: { route: string; at: number } | null = null;
/** Development only: remembers when a bottom-navigation destination was tapped. */
export function markTabPress(route: string) { if (isDev()) tabPress = { route, at: perfNow() }; }
/** Development only: logs `[perf] tab <route> <phase>: N ms` measured from the last tap on that tab. */
export function markTabPhase(route: string, phase: string) {
  if (!isDev() || !tabPress || tabPress.route !== route) return;
  perfMark(`tab ${route} ${phase}`, tabPress.at);
}

/** Wraps an async operation with a development-only duration marker. */
export async function timed<T>(label: string, operation: () => Promise<T>, minMs = 0): Promise<T> {
  const startedAt = perfNow();
  try { return await operation(); }
  finally { perfMark(label, startedAt, minMs); }
}
