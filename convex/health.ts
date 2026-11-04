import { query } from './_generated/server';

// Public connection check; does not read or expose private records.
export const ping = query({ args: {}, handler: async () => ({ ok: true }) });
