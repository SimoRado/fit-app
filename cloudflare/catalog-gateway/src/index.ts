export type Limits = {
  CATALOG_AUTH_REQUESTS_PER_HOUR: string;
  CATALOG_MANIFEST_REQUESTS_PER_HOUR: string;
  CATALOG_TRANSFERS_PER_HOUR: string;
  CATALOG_NEW_AUTHORIZATIONS_PER_24H: string;
  CATALOG_NEW_AUTHORIZATIONS_PER_7D: string;
  CATALOG_SESSION_TTL_SECONDS: string;
  CATALOG_SESSION_BYTE_MULTIPLIER: string;
};

export interface R2ObjectBodyLike {
  size: number;
  body: ReadableStream<Uint8Array>;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
}

export interface R2BucketLike {
  get(key: string, options?: { range?: { offset: number; length?: number } }): Promise<R2ObjectBodyLike | null>;
}

export interface StorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export interface DurableObjectStateLike {
  storage: StorageLike;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export interface RateLimitLike {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export interface GatewayEnv extends Limits {
  CATALOG_BUCKET: R2BucketLike;
  LIMITER: DurableObjectNamespaceLike;
  IP_RATE_LIMITER: RateLimitLike;
  CLERK_ISSUER: string;
  CATALOG_VERSION: string;
  CATALOG_OBJECT_KEY: string;
  CATALOG_MANIFEST_KEY: string;
  CATALOG_SIZE_BYTES: string;
}

type JwtClaims = { iss?: unknown; sub?: unknown; aud?: unknown; exp?: unknown; nbf?: unknown };
type ClerkKey = JsonWebKey & { kid?: string; alg?: string; use?: string };
type QuotaState = {
  requests: Record<string, number[]>;
  authorizations: number[];
  session?: {
    id: string;
    version: string;
    size: number;
    expiresAt: number;
    complete: boolean;
    bytesServed: number;
    bytesReserved: number;
    lease?: { id: string; startedAt: number; reserved: number };
  };
};

const EMPTY: QuotaState = { requests: {}, authorizations: [] };
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MAX_TOKEN_LENGTH = 12_000;
const MAX_MANIFEST_BYTES = 32_000;
let cachedKeys: { issuer: string; expiresAt: number; keys: ClerkKey[] } | undefined;
let forcedJwksRefresh: { issuer: string; nextAt: number } | undefined;
let jwksLoad: { issuer: string; promise: Promise<ClerkKey[]> } | undefined;

const intConfig = (value: string, fallback: number, min = 1, max = 1_000_000) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function retry(seconds: number, error: string) {
  return json({ error }, 429, { 'Retry-After': String(Math.max(1, Math.ceil(seconds))) });
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}

function parseBase64UrlJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

async function clerkKeys(issuer: string, force = false): Promise<ClerkKey[]> {
  const now = Date.now();
  const current = cachedKeys?.issuer === issuer && cachedKeys.expiresAt > now ? cachedKeys : undefined;
  if (!force && current) return current.keys;
  if (force && current) {
    if (forcedJwksRefresh?.issuer === issuer && forcedJwksRefresh.nextAt > now) return current.keys;
    forcedJwksRefresh = { issuer, nextAt: now + 30_000 };
  }
  if (jwksLoad?.issuer === issuer) return jwksLoad.promise;
  const promise = (async () => {
    try {
      const response = await fetch(`${issuer}/.well-known/jwks.json`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('auth_service_unavailable');
      const payload = await response.json() as { keys?: ClerkKey[] };
      if (!Array.isArray(payload.keys) || payload.keys.length > 32) throw new Error('auth_service_unavailable');
      cachedKeys = { issuer, expiresAt: Date.now() + 10 * 60_000, keys: payload.keys };
      return payload.keys;
    } catch {
      throw new Error('auth_service_unavailable');
    }
  })();
  jwksLoad = { issuer, promise };
  try { return await promise; }
  finally { if (jwksLoad?.promise === promise) jwksLoad = undefined; }
}

export async function verifyClerkToken(token: string, issuer: string): Promise<string | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH || !issuer.startsWith('https://')) return null;
  const pieces = token.split('.');
  if (pieces.length !== 3) return null;
  try {
    const header = parseBase64UrlJson<{ alg?: unknown; kid?: unknown }>(pieces[0]);
    const claims = parseBase64UrlJson<JwtClaims>(pieces[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
      claims.iss !== issuer || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
      !Number.isFinite(claims.exp) || Number(claims.exp) <= Date.now() / 1000 ||
      (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || Number(claims.nbf) > Date.now() / 1000 + 30))) return null;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes('convex')) return null;
    let keys = await clerkKeys(issuer);
    let jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig'));
    if (!jwk) {
      keys = await clerkKeys(issuer, true);
      jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig'));
    }
    if (!jwk) return null;
    const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const signature = Uint8Array.from(decodeBase64Url(pieces[2])).buffer as ArrayBuffer;
    const signedBytes = new TextEncoder().encode(`${pieces[0]}.${pieces[1]}`).buffer as ArrayBuffer;
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, signedBytes);
    return valid ? claims.sub : null;
  } catch (error) {
    if (error instanceof Error && error.message === 'auth_service_unavailable') throw error;
    return null;
  }
}

async function nameHash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function limiter(env: GatewayEnv, scope: string, identity: string, path: string, payload: Record<string, unknown>) {
  const stub = env.LIMITER.get(env.LIMITER.idFromName(await nameHash(`${scope}:${identity}`)));
  return stub.fetch(new Request(`https://limiter.invalid${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }));
}

function bearer(request: Request) {
  const value = request.headers.get('Authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(value);
  return match?.[1] ?? '';
}

async function smallJson<T>(request: Request, maximumBytes = 1024): Promise<T | null> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > maximumBytes) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(data)) as T; } catch { return null; }
}

function approvedVersion(env: GatewayEnv, version: string) {
  return version === env.CATALOG_VERSION && /^v[1-9]\d*$/.test(version) &&
    env.CATALOG_OBJECT_KEY === `nutrition/full/foods-full-${version}.sqlite.gz`;
}

function parseRange(value: string | null, size: number) {
  if (!value) return { offset: 0, length: size, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  let offset: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    offset = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    offset = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset < 0 || end < offset || offset >= size) return null;
  end = Math.min(end, size - 1);
  return { offset, length: end - offset + 1, partial: true };
}

async function finishTransfer(env: GatewayEnv, account: string, sessionId: string, leaseId: string, delivered: number) {
  try {
    await limiter(env, 'account', account, '/finish', { sessionId, leaseId, delivered });
  } catch {
    // A lost accounting update is bounded by the lease timeout and byte budget.
  }
}

function meteredBody(body: ReadableStream<Uint8Array>, env: GatewayEnv, account: string, sessionId: string, leaseId: string) {
  const reader = body.getReader();
  let delivered = 0;
  let closed = false;
  let lastHeartbeat = Date.now();
  const finish = async () => {
    if (closed) return;
    closed = true;
    await finishTransfer(env, account, sessionId, leaseId, delivered);
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const item = await reader.read();
        if (item.done) {
          await finish();
          controller.close();
          return;
        }
        if (Date.now() - lastHeartbeat >= 30_000) {
          const alive = await limiter(env, 'account', account, '/heartbeat', { sessionId, leaseId });
          if (!alive.ok) throw Error('Download session expired.');
          lastHeartbeat = Date.now();
        }
        delivered += item.value.byteLength;
        controller.enqueue(item.value);
      } catch (error) {
        await finish();
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } finally { await finish(); }
    },
  });
}

async function handle(request: Request, env: GatewayEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.search || url.hash || (request.method !== 'GET' && request.method !== 'POST')) return json({ error: 'not_found' }, 404);

  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || ip.length > 64) return json({ error: 'client_ip_unavailable' }, 503, { 'Retry-After': '30' });
  let ipGate: { success: boolean };
  try { ipGate = await env.IP_RATE_LIMITER.limit({ key: ip }); }
  catch { return json({ error: 'rate_limit_service_unavailable' }, 503, { 'Retry-After': '30' }); }
  if (!ipGate.success) return retry(60, 'rate_limited');

  const token = bearer(request);
  if (!token) return json({ error: 'authentication_required' }, 401, { 'WWW-Authenticate': 'Bearer' });
  let account: string | null;
  try { account = await verifyClerkToken(token, env.CLERK_ISSUER); }
  catch { return json({ error: 'authorization_service_unavailable' }, 503, { 'Retry-After': '30' }); }
  if (!account) return json({ error: 'invalid_or_expired_token' }, 401, { 'WWW-Authenticate': 'Bearer' });

  if (url.pathname === '/v1/manifest' && request.method === 'GET') {
    const limited = await limiter(env, 'account', account, '/rate', {
      key: 'manifest', limit: intConfig(env.CATALOG_MANIFEST_REQUESTS_PER_HOUR, 30), windowMs: HOUR,
    });
    if (!limited.ok) return limited;
    const object = await env.CATALOG_BUCKET.get(env.CATALOG_MANIFEST_KEY);
    if (!object || object.size > MAX_MANIFEST_BYTES) return json({ error: 'catalog_unavailable' }, 503);
    let manifest: Record<string, any>;
    try { manifest = await new Response(object.body).json() as Record<string, any>; }
    catch { return json({ error: 'catalog_unavailable' }, 503); }
    if (manifest.version !== env.CATALOG_VERSION || manifest.catalogs?.full?.filename !== `foods-full-${env.CATALOG_VERSION}.sqlite.gz`) return json({ error: 'catalog_unavailable' }, 503);
    manifest.catalogs.full.download_url = `${url.origin}/v1/catalog/full/${env.CATALOG_VERSION}`;
    return Response.json(manifest, { headers: { 'Cache-Control': 'private, max-age=300', 'Content-Type': 'application/json' } });
  }

  if (url.pathname === '/v1/authorize' && request.method === 'POST') {
    const body = await smallJson<{ version?: unknown }>(request);
    if (!body) return json({ error: 'invalid_request' }, 400);
    if (typeof body.version !== 'string' || !approvedVersion(env, body.version)) return json({ error: 'catalog_not_approved' }, 404);
    const result = await limiter(env, 'account', account, '/authorize', {
      version: body.version,
      size: intConfig(env.CATALOG_SIZE_BYTES, 85_427_860, 1, 10_000_000_000),
      requestLimit: intConfig(env.CATALOG_AUTH_REQUESTS_PER_HOUR, 10),
      dailyLimit: intConfig(env.CATALOG_NEW_AUTHORIZATIONS_PER_24H, 2),
      weeklyLimit: intConfig(env.CATALOG_NEW_AUTHORIZATIONS_PER_7D, 5),
      sessionTtlMs: intConfig(env.CATALOG_SESSION_TTL_SECONDS, 172_800, 60, 604_800) * 1000,
    });
    return new Response(result.body, { status: result.status, headers: result.headers });
  }

  const download = /^\/v1\/catalog\/full\/(v[1-9]\d*)$/.exec(url.pathname);
  if (!download || request.method !== 'GET' || !approvedVersion(env, download[1])) return json({ error: 'not_found' }, 404);
  const sessionId = request.headers.get('X-Catalog-Session') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: 'authorization_required' }, 401);
  const size = intConfig(env.CATALOG_SIZE_BYTES, 85_427_860, 1, 10_000_000_000);
  const requested = parseRange(request.headers.get('Range'), size);
  if (!requested) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const started = await limiter(env, 'account', account, '/begin', {
    sessionId,
    version: download[1],
    requestedBytes: requested.length,
    size,
    transferLimit: intConfig(env.CATALOG_TRANSFERS_PER_HOUR, 20),
    byteMultiplier: Number(env.CATALOG_SESSION_BYTE_MULTIPLIER) || 1.25,
  });
  if (!started.ok) return started;
  const lease = await started.json() as { leaseId: string };
  let object: R2ObjectBodyLike | null;
  try {
    object = await env.CATALOG_BUCKET.get(env.CATALOG_OBJECT_KEY,
      requested.partial ? { range: { offset: requested.offset, length: requested.length } } : undefined);
  } catch {
    await finishTransfer(env, account, sessionId, lease.leaseId, 0);
    return json({ error: 'catalog_unavailable' }, 503, { 'Retry-After': '30' });
  }
  if (!object || object.size !== size) {
    await finishTransfer(env, account, sessionId, lease.leaseId, 0);
    return json({ error: 'catalog_unavailable' }, 503, { 'Retry-After': '30' });
  }
  const headers = new Headers({
    'Content-Type': 'application/gzip',
    'Content-Length': String(requested.length),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `attachment; filename="foods-full-${download[1]}.sqlite.gz"`,
    'X-Content-Type-Options': 'nosniff',
  });
  if (requested.partial) headers.set('Content-Range', `bytes ${requested.offset}-${requested.offset + requested.length - 1}/${size}`);
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(meteredBody(object.body, env, account, sessionId, lease.leaseId), {
    status: requested.partial ? 206 : 200,
    headers,
  });
}

export class CatalogLimiter {
  constructor(private readonly state: DurableObjectStateLike) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ error: 'not_found' }, 404);
    return this.state.blockConcurrencyWhile(async () => {
      const url = new URL(request.url);
      const input = await request.json() as Record<string, unknown>;
      const state = await this.state.storage.get<QuotaState>('quota') ?? structuredClone(EMPTY);
      const now = Date.now();
      state.requests ??= {};
      state.authorizations ??= [];
      for (const [key, times] of Object.entries(state.requests)) state.requests[key] = times.filter(time => time > now - HOUR);
      state.authorizations = state.authorizations.filter(time => time > now - 7 * DAY);
      if (state.session?.lease && now - state.session.lease.startedAt > 5 * 60_000) {
        // A lost finish call must never refund bytes that may already have reached the client.
        delete state.session.lease;
      }
      if (state.session && state.session.expiresAt <= now) delete state.session;

      if (url.pathname === '/rate') {
        const key = String(input.key ?? 'request');
        const windowMs = intConfig(String(input.windowMs ?? 3_600_000), HOUR, 1000, DAY);
        const limit = intConfig(String(input.limit ?? 10), 10);
        const times = (state.requests[key] ?? []).filter(time => time > now - windowMs);
        if (times.length >= limit) {
          const response = retry((times[0] + windowMs - now) / 1000, 'rate_limited');
          await this.state.storage.put('quota', state);
          return response;
        }
        times.push(now);
        state.requests[key] = times;
        await this.state.storage.put('quota', state);
        return json({ ok: true });
      }

      if (url.pathname === '/authorize') {
        const version = String(input.version ?? '');
        const requestLimit = intConfig(Number(input.requestLimit) ? String(input.requestLimit) : '10', 10);
        const requestTimes = (state.requests.authorization ?? []).filter(time => time > now - HOUR);
        if (requestTimes.length >= requestLimit) {
          const response = retry((requestTimes[0] + HOUR - now) / 1000, 'authorization_rate_limited');
          await this.state.storage.put('quota', state);
          return response;
        }
        requestTimes.push(now);
        state.requests.authorization = requestTimes;
        if (state.session && !state.session.complete) {
          if (state.session.version !== version) {
            await this.state.storage.put('quota', state);
            return json({ error: 'download_session_active' }, 409);
          }
          await this.state.storage.put('quota', state);
          return json({ sessionId: state.session.id, expiresAt: state.session.expiresAt, reused: true });
        }
        const daily = state.authorizations.filter(time => time > now - DAY);
        const dailyLimit = intConfig(String(input.dailyLimit ?? 2), 2);
        const weeklyLimit = intConfig(String(input.weeklyLimit ?? 5), 5);
        if (daily.length >= dailyLimit || state.authorizations.length >= weeklyLimit) {
          const waitUntil = daily.length >= dailyLimit ? daily[0] + DAY : state.authorizations[0] + 7 * DAY;
          const response = retry((waitUntil - now) / 1000, 'download_authorization_limit');
          await this.state.storage.put('quota', state);
          return response;
        }
        const sessionTtlMs = intConfig(String(input.sessionTtlMs ?? 172_800_000), 172_800_000, 60_000, 7 * DAY);
        const size = intConfig(String(input.size ?? 0), 0, 1, 10_000_000_000);
        const session = { id: crypto.randomUUID(), version, size, expiresAt: now + sessionTtlMs, complete: false, bytesServed: 0, bytesReserved: 0 };
        state.authorizations.push(now);
        state.session = session;
        await this.state.storage.put('quota', state);
        return json({ sessionId: session.id, expiresAt: session.expiresAt, reused: false });
      }

      if (url.pathname === '/begin') {
        const sessionId = String(input.sessionId ?? '');
        const session = state.session;
        if (!session || session.id !== sessionId || session.version !== input.version || session.complete || session.expiresAt <= now) return json({ error: 'authorization_expired' }, 403);
        const times = (state.requests.transfer ?? []).filter(time => time > now - HOUR);
        const transferLimit = intConfig(String(input.transferLimit ?? 20), 20);
        if (times.length >= transferLimit) {
          const response = retry((times[0] + HOUR - now) / 1000, 'transfer_rate_limited');
          await this.state.storage.put('quota', state);
          return response;
        }
        times.push(now);
        state.requests.transfer = times;
        if (session.lease) {
          await this.state.storage.put('quota', state);
          return json({ error: 'download_already_active' }, 409);
        }
        const size = intConfig(String(input.size ?? 0), 0, 1, 10_000_000_000);
        const requestedBytes = intConfig(String(input.requestedBytes ?? 0), 0, 1, size);
        const multiplier = Number(input.byteMultiplier);
        const maxBytes = Math.floor(size * (Number.isFinite(multiplier) && multiplier >= 1 && multiplier <= 2 ? multiplier : 1.25));
        if (session.bytesServed + session.bytesReserved + requestedBytes > maxBytes) {
          await this.state.storage.put('quota', state);
          return json({ error: 'download_byte_limit' }, 429, { 'Retry-After': '86400' });
        }
        const lease = { id: crypto.randomUUID(), startedAt: now, reserved: requestedBytes };
        session.lease = lease;
        session.bytesReserved += requestedBytes;
        await this.state.storage.put('quota', state);
        return json({ leaseId: lease.id });
      }

      if (url.pathname === '/heartbeat') {
        const session = state.session;
        if (!session?.lease || session.id !== input.sessionId || session.lease.id !== input.leaseId || session.expiresAt <= now) {
          return json({ error: 'download_session_expired' }, 409);
        }
        session.lease.startedAt = now;
        await this.state.storage.put('quota', state);
        return json({ ok: true });
      }

      if (url.pathname === '/finish') {
        const session = state.session;
        const leaseId = String(input.leaseId ?? '');
        const delivered = Number(input.delivered);
        if (!session?.lease || session.id !== input.sessionId || session.lease.id !== leaseId || !Number.isSafeInteger(delivered) || delivered < 0 || delivered > session.lease.reserved) return json({ ok: false });
        session.bytesReserved = Math.max(0, session.bytesReserved - session.lease.reserved);
        session.bytesServed += delivered;
        delete session.lease;
        if (session.bytesServed >= session.size) session.complete = true;
        await this.state.storage.put('quota', state);
        return json({ ok: true });
      }
      return json({ error: 'not_found' }, 404);
    });
  }
}

export default {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    try { return await handle(request, env); }
    catch {
      return json({ error: 'catalog_gateway_unavailable' }, 503, { 'Retry-After': '30' });
    }
  },
};
