/**
 * Turns a failed `accountDeletionActions.request` call into user-facing copy.
 *
 * `jobMayExist` is false when the server's handler itself rejected the request:
 * it creates the deletion job only as its last step, so a handler error means
 * nothing was started and the locally remembered receipt can be dropped. A
 * network failure is ambiguous (the job may have been created before the
 * response was lost), so the receipt is kept and the status check resolves it.
 */
export type DeletionFailure = { title: string; message: string; jobMayExist: boolean; reverify: boolean };

export function deletionFailure(error: unknown): DeletionFailure {
  const text = error instanceof Error ? error.message : String(error ?? '');
  const fromServer = /Server Error|Uncaught Error|\[CONVEX /.test(text);
  const title = 'Account not deleted';
  if (/not configured/i.test(text)) return { title, jobMayExist: false, reverify: false, message: 'Account deletion is not available right now because the server is not fully set up. Nothing was deleted. Please try again later or contact support.' };
  if (/Recent authentication required/.test(text)) return { title, jobMayExist: false, reverify: true, message: 'For your security, confirm your email code again, then retry. Nothing was deleted.' };
  if (/Authentication required|Sign in again/.test(text)) return { title, jobMayExist: false, reverify: true, message: 'Your session has expired. Sign in again, then retry. Nothing was deleted.' };
  if (/Deletion confirmation required/.test(text)) return { title, jobMayExist: false, reverify: false, message: 'The confirmation could not be accepted. Type the phrase again and retry. Nothing was deleted.' };
  if (fromServer) return { title, jobMayExist: false, reverify: false, message: 'The server could not start the deletion. Nothing was deleted. Please try again later.' };
  return { title, jobMayExist: true, reverify: false, message: 'Could not reach the server. Check your connection and try again. If the request already went through, its status appears here when you reconnect.' };
}
