import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import worker, { CatalogLimiter, type DurableObjectStateLike, type GatewayEnv, type R2BucketLike, type RateLimitLike, type StorageLike } from '../cloudflare/catalog-gateway/src/index';

const issuer = 'https://cubyfit-clerk.test';
const keyId = 'test-key';
let keyPair: CryptoKeyPair;
let publicJwk: JsonWebKey & { kid: string; alg: string; use: string };

function base64url(bytes: Uint8Array) {
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function token(subject: string, exp = Math.floor(Date.now() / 1000) + 300, extra: Record<string, unknown> = {}, kid = keyId) {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid })));
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ iss: issuer, sub: subject, aud: 'convex', exp, ...extra })));
  const message = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, message.buffer as ArrayBuffer);
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

class MemoryStorage implements StorageLike {
  values = new Map<string, unknown>();
  async get<T>(key: string) { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
}

class MemoryDOState implements DurableObjectStateLike {
  storage = new MemoryStorage();
  private queue: Promise<void> = Promise.resolve();
  async blockConcurrencyWhile<T>(callback: () => Promise<T>) {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await callback(); } finally { release(); }
  }
}

class MemoryNamespace {
  private states = new Map<string, MemoryDOState>();
  idFromName(name: string) { return name; }
  get(id: unknown) {
    const name = String(id);
    let state = this.states.get(name);
    if (!state) { state = new MemoryDOState(); this.states.set(name, state); }
    const limiter = new CatalogLimiter(state);
    return { fetch: (request: Request) => limiter.fetch(request) };
  }
}

class MemoryRateLimit implements RateLimitLike {
  private readonly requests = new Map<string, number[]>();
  async limit({ key }: { key: string }) {
    const current = Date.now();
    const times = (this.requests.get(key) ?? []).filter(time => time > current - 60_000);
    if (times.length >= 120) return { success: false };
    times.push(current);
    this.requests.set(key, times);
    return { success: true };
  }
}

function stream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

function environment(overrides: Partial<GatewayEnv> = {}) {
  const archive = Uint8Array.from({ length: 100 }, (_, index) => index);
  const manifest = new TextEncoder().encode(JSON.stringify({
    version: 'v4', schema_version: 1, minimum_supported_schema_version: 1,
    catalogs: { full: { filename: 'foods-full-v4.sqlite.gz', download_url: 'https://public-r2.invalid/old.gz', compressed_bytes: 100, sqlite_bytes: 200, food_count: 3, sha256: 'a'.repeat(64), sqlite_sha256: 'b'.repeat(64) } },
  }));
  const bucket: R2BucketLike = {
    async get(key, options) {
      if (key === 'nutrition/manifest-v4.json') return { size: manifest.length, body: stream(manifest) };
      if (key !== 'nutrition/full/foods-full-v4.sqlite.gz') return null;
      if (!options?.range) return { size: archive.length, body: stream(archive) };
      const selected = archive.slice(options.range.offset, options.range.offset + (options.range.length ?? archive.length));
      return { size: archive.length, body: stream(selected) };
    },
  };
  return {
    CATALOG_BUCKET: bucket,
    LIMITER: new MemoryNamespace(),
    IP_RATE_LIMITER: new MemoryRateLimit(),
    CLERK_ISSUER: issuer,
    CATALOG_VERSION: 'v4',
    CATALOG_OBJECT_KEY: 'nutrition/full/foods-full-v4.sqlite.gz',
    CATALOG_MANIFEST_KEY: 'nutrition/manifest-v4.json',
    CATALOG_SIZE_BYTES: '100',
    CATALOG_AUTH_REQUESTS_PER_HOUR: '10',
    CATALOG_MANIFEST_REQUESTS_PER_HOUR: '30',
    CATALOG_TRANSFERS_PER_HOUR: '20',
    CATALOG_NEW_AUTHORIZATIONS_PER_24H: '2',
    CATALOG_NEW_AUTHORIZATIONS_PER_7D: '5',
    CATALOG_SESSION_TTL_SECONDS: '172800',
    CATALOG_SESSION_BYTE_MULTIPLIER: '2',
    ...overrides,
  } satisfies GatewayEnv;
}

async function call(env: GatewayEnv, path: string, auth: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('CF-Connecting-IP', '203.0.113.10');
  if (auth) headers.set('Authorization', `Bearer ${auth}`);
  return worker.fetch(new Request(`https://gateway.test${path}`, { ...init, headers }), env);
}

async function authorize(env: GatewayEnv, auth: string, version = 'v4') {
  const response = await call(env, '/v1/authorize', auth, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version }),
  });
  return { response, value: await response.json() as { sessionId?: string; reused?: boolean; error?: string } };
}

async function download(env: GatewayEnv, auth: string, sessionId: string, range?: string) {
  return call(env, '/v1/catalog/full/v4', auth, {
    headers: { 'X-Catalog-Session': sessionId, ...(range ? { Range: range } : {}) },
  });
}

beforeAll(async () => {
  keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, true, ['sign', 'verify']);
  publicJwk = { ...await crypto.subtle.exportKey('jwk', keyPair.publicKey), kid: keyId, alg: 'RS256', use: 'sig' };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    if (String(input) === `${issuer}/.well-known/jwks.json`) return Response.json({ keys: [publicJwk] });
    if (String(input).startsWith('https://auth-down.test/')) throw Error('network down');
    throw Error('unexpected network request');
  });
});

afterAll(() => vi.restoreAllMocks());

describe('Cloudflare catalog gateway authorization and abuse limits', () => {
  it('authorizes and streams the approved catalog only', async () => {
    const env = environment();
    const sessionToken = await token('user_one');
    const grant = await authorize(env, sessionToken);
    expect(grant.response.status).toBe(200);
    expect(grant.value.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    const response = await download(env, sessionToken, grant.value.sessionId!);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/gzip');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.from({ length: 100 }, (_, index) => index));
    expect((await download(env, sessionToken, grant.value.sessionId!)).status).toBe(403);
  });

  it('requires a verified, unexpired Clerk JWT and rejects modified tokens', async () => {
    const env = environment();
    const expired = await token('user_expired', Math.floor(Date.now() / 1000) - 60);
    expect((await call(env, '/v1/manifest', null)).status).toBe(401);
    expect((await call(env, '/v1/manifest', expired)).status).toBe(401);
    const valid = await token('user_valid');
    const [header, payload, signature] = valid.split('.');
    const changed = `${header}.${base64url(new TextEncoder().encode(JSON.stringify({ iss: issuer, sub: 'user_victim', aud: 'convex', exp: Math.floor(Date.now() / 1000) + 300 })))}.${signature}`;
    expect((await call(env, '/v1/manifest', changed)).status).toBe(401);
    expect(payload).toBeTruthy();
  });

  it('fails closed when Clerk JWKS cannot be reached', async () => {
    const env = environment({ CLERK_ISSUER: 'https://auth-down.test' });
    expect((await call(env, '/v1/manifest', await token('user_unavailable', undefined, { iss: 'https://auth-down.test' }))).status).toBe(503);
  });

  it('coalesces unknown-key refreshes to avoid JWKS request amplification', async () => {
    const env = environment();
    const unknownKeyToken = await token('user_unknown_key', undefined, {}, 'attacker-controlled-kid');
    const callsBefore = vi.mocked(globalThis.fetch).mock.calls.length;
    expect((await call(env, '/v1/manifest', unknownKeyToken)).status).toBe(401);
    expect((await call(env, '/v1/manifest', unknownKeyToken)).status).toBe(401);
    expect(vi.mocked(globalThis.fetch).mock.calls.length - callsBefore).toBe(1);
  });

  it('limits new authorizations atomically while reusing an interrupted session', async () => {
    const env = environment({ CATALOG_AUTH_REQUESTS_PER_HOUR: '10', CATALOG_NEW_AUTHORIZATIONS_PER_24H: '2' });
    const sessionToken = await token('user_limit');
    const [first, simultaneous] = await Promise.all([authorize(env, sessionToken), authorize(env, sessionToken)]);
    expect(first.response.status).toBe(200);
    expect(simultaneous.response.status).toBe(200);
    expect(simultaneous.value.sessionId).toBe(first.value.sessionId);
    expect([first.value.reused, simultaneous.value.reused].filter(Boolean)).toHaveLength(1);
    await (await download(env, sessionToken, first.value.sessionId!)).arrayBuffer();
    const second = await authorize(env, sessionToken);
    expect(second.response.status).toBe(200);
    await (await download(env, sessionToken, second.value.sessionId!)).arrayBuffer();
    const third = await authorize(env, sessionToken);
    expect(third.response.status).toBe(429);
    expect(Number(third.response.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('enforces the seven-day authorization allowance', async () => {
    const env = environment({ CATALOG_NEW_AUTHORIZATIONS_PER_24H: '10', CATALOG_NEW_AUTHORIZATIONS_PER_7D: '5' });
    const sessionToken = await token('user_weekly_limit');
    for (let index = 0; index < 5; index++) {
      const grant = await authorize(env, sessionToken);
      expect(grant.response.status).toBe(200);
      const response = await download(env, sessionToken, grant.value.sessionId!);
      expect(response.status).toBe(200);
      await response.arrayBuffer();
    }
    const limited = await authorize(env, sessionToken);
    expect(limited.response.status).toBe(429);
    expect(Number(limited.response.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('limits manifest checks and transfer starts independently', async () => {
    const env = environment({ CATALOG_MANIFEST_REQUESTS_PER_HOUR: '2', CATALOG_TRANSFERS_PER_HOUR: '2' });
    const sessionToken = await token('user_route_limits');
    expect((await call(env, '/v1/manifest', sessionToken)).status).toBe(200);
    expect((await call(env, '/v1/manifest', sessionToken)).status).toBe(200);
    expect((await call(env, '/v1/manifest', sessionToken)).status).toBe(429);
    const grant = await authorize(env, sessionToken);
    expect(grant.response.status).toBe(200);
    for (let index = 0; index < 2; index++) {
      const response = await download(env, sessionToken, grant.value.sessionId!, `bytes=${index}-${index}`);
      expect(response.status).toBe(206);
      await response.arrayBuffer();
    }
    const limited = await download(env, sessionToken, grant.value.sessionId!, 'bytes=2-2');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('rejects an expired download authorization session', async () => {
    const env = environment({ CATALOG_SESSION_TTL_SECONDS: '60' });
    const sessionToken = await token('user_expired_session');
    const grant = await authorize(env, sessionToken);
    expect(grant.response.status).toBe(200);
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now + 61_000);
    try { expect((await download(env, sessionToken, grant.value.sessionId!)).status).toBe(403); }
    finally { vi.useRealTimers(); }
  });

  it('returns 429 and Retry-After for repeated authorization attempts', async () => {
    const env = environment({ CATALOG_AUTH_REQUESTS_PER_HOUR: '2' });
    const sessionToken = await token('user_rate');
    await authorize(env, sessionToken);
    await authorize(env, sessionToken);
    const limited = await authorize(env, sessionToken);
    expect(limited.response.status).toBe(429);
    expect(Number(limited.response.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('applies edge IP rate limiting before authentication and returns Retry-After', async () => {
    const env = environment({ IP_RATE_LIMITER: { limit: async () => ({ success: false }) } });
    const limited = await call(env, '/v1/manifest', null);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
  });

  it('fails closed when the Cloudflare edge rate-limit binding is unavailable', async () => {
    const env = environment({ IP_RATE_LIMITER: { limit: async () => { throw Error('binding unavailable'); } } });
    const response = await call(env, '/v1/manifest', null);
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
  });

  it('keeps account quotas separate for users sharing one public IP', async () => {
    const env = environment();
    const first = await authorize(env, await token('user_a'));
    const second = await authorize(env, await token('user_b'));
    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
  });

  it('rejects another account using a saved transfer session', async () => {
    const env = environment();
    const owner = await token('session_owner');
    const other = await token('different_account');
    const grant = await authorize(env, owner);
    expect(grant.response.status).toBe(200);
    expect((await download(env, other, grant.value.sessionId!)).status).toBe(403);
    const ownGrant = await authorize(env, other);
    expect(ownGrant.response.status).toBe(200);
    expect(ownGrant.value.sessionId).not.toBe(grant.value.sessionId);
  });

  it('enforces one active stream per account across concurrent requests', async () => {
    const env = environment();
    const sessionToken = await token('user_concurrent');
    const grant = await authorize(env, sessionToken);
    const [first, second] = await Promise.all([
      download(env, sessionToken, grant.value.sessionId!),
      download(env, sessionToken, grant.value.sessionId!),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    await (first.status === 200 ? first : second).arrayBuffer();
  });

  it('keeps uncertain bytes reserved after a stale stream and bounds retries', async () => {
    const state = new MemoryDOState();
    const now = Date.now();
    const sessionId = crypto.randomUUID();
    await state.storage.put('quota', { requests: {}, authorizations: [], session: {
      id: sessionId, version: 'v4', size: 100, expiresAt: now + 60_000,
      complete: false, bytesServed: 0, bytesReserved: 100,
      lease: { id: crypto.randomUUID(), startedAt: now - 6 * 60_000, reserved: 100 },
    } });
    const limiter = new CatalogLimiter(state);
    const post = (path: string, body: object) => limiter.fetch(new Request(`https://limiter.invalid${path}`, {
      method: 'POST', body: JSON.stringify(body),
    }));
    const retry = await post('/begin', { sessionId, version: 'v4', requestedBytes: 100, size: 100,
      transferLimit: 20, byteMultiplier: 2 });
    expect(retry.status).toBe(200);
    const { leaseId } = await retry.json() as { leaseId: string };
    expect((await post('/finish', { sessionId, leaseId, delivered: 99 })).status).toBe(200);
    const excessive = await post('/begin', { sessionId, version: 'v4', requestedBytes: 2, size: 100,
      transferLimit: 20, byteMultiplier: 2 });
    expect(excessive.status).toBe(429);
    expect(excessive.headers.get('Retry-After')).toBe('86400');
  });

  it('refreshes a live stream lease so another stream cannot start after five minutes', async () => {
    const state = new MemoryDOState();
    const now = Date.now();
    const sessionId = crypto.randomUUID();
    const leaseId = crypto.randomUUID();
    await state.storage.put('quota', { requests: {}, authorizations: [], session: {
      id: sessionId, version: 'v4', size: 100, expiresAt: now + 10 * 60_000,
      complete: false, bytesServed: 0, bytesReserved: 100,
      lease: { id: leaseId, startedAt: now - 4 * 60_000, reserved: 100 },
    } });
    const limiter = new CatalogLimiter(state);
    const post = (path: string, body: object) => limiter.fetch(new Request(`https://limiter.invalid${path}`, {
      method: 'POST', body: JSON.stringify(body),
    }));
    expect((await post('/heartbeat', { sessionId, leaseId })).status).toBe(200);
    vi.useFakeTimers();
    vi.setSystemTime(now + 2 * 60_000);
    try {
      const concurrent = await post('/begin', { sessionId, version: 'v4', requestedBytes: 1, size: 100,
        transferLimit: 20, byteMultiplier: 2 });
      expect(concurrent.status).toBe(409);
    } finally { vi.useRealTimers(); }
  });

  it('resumes a range transfer with the same grant after interruption', async () => {
    const env = environment();
    const sessionToken = await token('user_resume');
    const grant = await authorize(env, sessionToken);
    const first = await download(env, sessionToken, grant.value.sessionId!, 'bytes=0-39');
    expect(first.status).toBe(206);
    const reader = first.body!.getReader();
    const chunk = await reader.read();
    expect(chunk.value?.byteLength).toBe(40);
    await reader.cancel();
    const resumed = await download(env, sessionToken, grant.value.sessionId!, 'bytes=40-99');
    expect(resumed.status).toBe(206);
    expect((await resumed.arrayBuffer()).byteLength).toBe(60);
  });

  it('rejects unapproved object paths and catalog versions', async () => {
    const env = environment();
    const sessionToken = await token('user_path');
    expect((await authorize(env, sessionToken, 'v5')).response.status).toBe(404);
    expect((await call(env, '/v1/catalog/full/v5', sessionToken, { headers: { 'X-Catalog-Session': crypto.randomUUID() } })).status).toBe(404);
    expect((await call(env, '/v1/catalog/full/v4/other', sessionToken, { headers: { 'X-Catalog-Session': crypto.randomUUID() } })).status).toBe(404);
  });

  it('returns a protected manifest with a gateway download URL', async () => {
    const env = environment();
    const response = await call(env, '/v1/manifest', await token('user_manifest'));
    const manifest = await response.json() as { catalogs: { full: { download_url: string } } };
    expect(response.status).toBe(200);
    expect(manifest.catalogs.full.download_url).toBe('https://gateway.test/v1/catalog/full/v4');
    expect(response.headers.get('Cache-Control')).toContain('private');
  });
});
