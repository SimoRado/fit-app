/**
 * Turns a failed `accountDeletionActions.request` call into user-facing copy.
 *
 * Only explicit pre-job validation errors can discard the receipt. A generic
 * server or network failure may arrive after the durable job was created, so
 * the receipt stays available for recovery and completion checking.
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
  if (fromServer) return { title: 'Deletion status uncertain', jobMayExist: true, reverify: false, message: 'The request may already be processing. Its receipt is saved and the app will check status when connected.' };
  return { title: 'Deletion status uncertain', jobMayExist: true, reverify: false, message: 'Could not reach the server. The request may already be processing. Its receipt is saved and the app will check status when you reconnect.' };
}
