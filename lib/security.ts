import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { eq } from 'drizzle-orm';
import { getSupabaseConfig } from '@/utils/supabase/config';
import { db, safeDbQuery } from './db/index';
import { users } from './db/schema';
import { logSecurityEvent } from './auditLog';

export type AppRole = 'user' | 'admin';

export interface AuthenticatedActor {
  uid: string;
  email: string;
  role: AppRole;
  name?: string;
  picture?: string;
  token?: string;
  authMethod: 'supabase_jwt' | 'signed_cookie';
}

export const SESSION_COOKIE_NAME = 'cm_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

let cachedSessionSecret: Buffer | null = null;
let secretWarningLogged = false;

function getSessionSecret(): Buffer {
  if (cachedSessionSecret) return cachedSessionSecret;

  const raw = (
    process.env.AUTH_SESSION_SECRET ||
    process.env.DATA_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.DATABASE_URL ||
    ''
  ).trim();

  if (!raw && !secretWarningLogged) {
    secretWarningLogged = true;
    console.warn(
      '[Security] AUTH_SESSION_SECRET is not set; using process-scoped fallback signing key. Configure AUTH_SESSION_SECRET in production.'
    );
  }

  const material = raw || `calculator-max-session-dev-secret:${process.cwd()}`;
  cachedSessionSecret = crypto.createHash('sha256').update(material).digest();
  return cachedSessionSecret;
}

interface SignedSessionPayload {
  uid: string;
  email: string;
  role: AppRole;
  name?: string;
  exp: number;
}

export function createSessionToken(payload: Omit<SignedSessionPayload, 'exp'>): string {
  const fullPayload: SignedSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SignedSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;

  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedSessionPayload;
    if (!decoded?.uid || typeof decoded.exp !== 'number') return null;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      uid: decoded.uid,
      email: decoded.email || '',
      role: decoded.role === 'admin' ? 'admin' : 'user',
      name: decoded.name || '',
      exp: decoded.exp,
    };
  } catch {
    return null;
  }
}

export function isHttpsRequest(req: NextRequest): boolean {
  const proto = req.headers.get('x-forwarded-proto') || '';
  if (proto.includes('https')) return true;
  return req.nextUrl.protocol === 'https:';
}

export function attachSessionCookie(
  res: NextResponse,
  req: NextRequest,
  actor: { uid: string; email: string; role?: AppRole; name?: string }
): void {
  const token = createSessionToken({
    uid: actor.uid,
    email: actor.email,
    role: actor.role === 'admin' ? 'admin' : 'user',
    name: actor.name,
  });

  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse, req: NextRequest): void {
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/',
    maxAge: 0,
  });
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim().slice(0, 64);
  }
  return req.headers.get('x-real-ip')?.trim().slice(0, 64) || 'unknown';
}

/**
 * CSRF protection via strict Origin/Referer validation & Fetch Metadata checks
 * on all state-mutating API endpoints (POST, PUT, PATCH, DELETE).
 */
export function verifyCsrfAndOrigin(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { ok: true };
  }

  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite.toLowerCase())) {
    return { ok: false, reason: `Cross-site fetch rejected (${fetchSite})` };
  }

  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').toLowerCase();
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (host && originHost !== host) {
        return { ok: false, reason: 'Origin mismatch' };
      }
    } catch {
      return { ok: false, reason: 'Malformed Origin header' };
    }
  } else if (referer) {
    try {
      const refererHost = new URL(referer).host.toLowerCase();
      if (host && refererHost !== host) {
        return { ok: false, reason: 'Referer mismatch' };
      }
    } catch {
      return { ok: false, reason: 'Malformed Referer header' };
    }
  }

  return { ok: true };
}

// Memory-bounded sliding window rate limiter
declare global {
  var _rateLimitBuckets: Map<string, { count: number; resetAt: number }> | undefined;
}

export function checkRateLimit(
  key: string,
  maxRequests = 60,
  windowMs = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  if (!global._rateLimitBuckets) {
    global._rateLimitBuckets = new Map();
  }
  const buckets = global._rateLimitBuckets;
  const now = Date.now();

  // Prune expired buckets when map grows large
  if (buckets.size > 2000) {
    buckets.forEach((v, k) => {
      if (v.resetAt <= now) {
        buckets.delete(k);
      }
    });
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { allowed: true, remaining: maxRequests - 1, resetAt: next.resetAt };
  }

  existing.count += 1;
  if (existing.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - existing.count),
    resetAt: existing.resetAt,
  };
}

async function resolveUserRole(uid: string): Promise<AppRole> {
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const dbRole = await safeDbQuery(async () => {
    const rows = await db
      .select({ role: users.role, email: users.email })
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.email && adminEmails.includes(row.email.toLowerCase())) {
      return 'admin' as AppRole;
    }
    return row.role === 'admin' ? ('admin' as AppRole) : ('user' as AppRole);
  }, null);

  return dbRole || 'user';
}

export async function authenticateRequest(req: NextRequest): Promise<{
  actor: AuthenticatedActor | null;
  forbiddenMismatch?: boolean;
}> {
  const claimedUidHeader = req.headers.get('x-user-id')?.trim();
  const authHeader = req.headers.get('authorization');

  // 1. Verify Bearer JWT cryptographically via Supabase Auth
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      try {
        const { url, key } = getSupabaseConfig();
        if (url && key) {
          const cookieStore = await cookies();
          const supabase = createServerClient(url, key, {
            cookies: {
              getAll() {
                return cookieStore.getAll();
              },
              setAll() {},
            },
          });
          const {
            data: { user },
          } = await supabase.auth.getUser(token);
          if (user?.id) {
            if (claimedUidHeader && claimedUidHeader !== user.id) {
              return { actor: null, forbiddenMismatch: true };
            }
            const role = await resolveUserRole(user.id);
            return {
              actor: {
                uid: user.id,
                email: user.email || '',
                role,
                name: user.user_metadata?.full_name || '',
                picture: user.user_metadata?.avatar_url || '',
                token,
                authMethod: 'supabase_jwt',
              },
            };
          }
        }
      } catch {
        // Fall through to signed cookie verification
      }
    }
  }

  // 2. Verify signed HttpOnly session cookie (cm_session)
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const verifiedSession = verifySessionToken(sessionCookie);
  if (verifiedSession) {
    if (claimedUidHeader && claimedUidHeader !== verifiedSession.uid) {
      return { actor: null, forbiddenMismatch: true };
    }
    const dbRole = await resolveUserRole(verifiedSession.uid);
    const effectiveRole: AppRole =
      dbRole === 'admin' || verifiedSession.role === 'admin' ? 'admin' : 'user';
    return {
      actor: {
        uid: verifiedSession.uid,
        email: verifiedSession.email,
        role: effectiveRole,
        name: verifiedSession.name,
        authMethod: 'signed_cookie',
      },
    };
  }

  // 3. Verify Supabase SSR cookie session (if present)
  try {
    const { url, key } = getSupabaseConfig();
    if (url && key) {
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll() {},
        },
      });
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        if (claimedUidHeader && claimedUidHeader !== user.id) {
          return { actor: null, forbiddenMismatch: true };
        }
        const role = await resolveUserRole(user.id);
        return {
          actor: {
            uid: user.id,
            email: user.email || '',
            role,
            name: user.user_metadata?.full_name || '',
            picture: user.user_metadata?.avatar_url || '',
            authMethod: 'supabase_jwt',
          },
        };
      }
    }
  } catch {
    // Ignore cookie verification failure
  }

  return { actor: null };
}

export async function requireAuth(
  req: NextRequest,
  resource: string
): Promise<{ ok: true; actor: AuthenticatedActor } | { ok: false; response: NextResponse }> {
  const csrf = verifyCsrfAndOrigin(req);
  if (!csrf.ok) {
    await logSecurityEvent({
      userUid: null,
      actorRole: 'anonymous',
      action: `csrf_blocked:${req.method}`,
      resource,
      status: 'denied',
      ipAddress: getClientIp(req),
      details: csrf.reason,
    });
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden: Cross-origin request blocked.' }, { status: 403 }),
    };
  }

  const { actor, forbiddenMismatch } = await authenticateRequest(req);
  if (forbiddenMismatch) {
    await logSecurityEvent({
      userUid: null,
      actorRole: 'anonymous',
      action: 'uid_spoof_attempt',
      resource,
      status: 'denied',
      ipAddress: getClientIp(req),
      details: 'x-user-id header mismatch with verified session',
    });
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden: Account identity mismatch.' }, { status: 403 }),
    };
  }

  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized: Valid authentication required.' }, { status: 401 }),
    };
  }

  return { ok: true, actor };
}

export async function requireRole(
  req: NextRequest,
  allowedRoles: AppRole[],
  resource: string
): Promise<{ ok: true; actor: AuthenticatedActor } | { ok: false; response: NextResponse }> {
  const auth = await requireAuth(req, resource);
  if (!auth.ok) return auth;

  if (!allowedRoles.includes(auth.actor.role)) {
    await logSecurityEvent({
      userUid: auth.actor.uid,
      actorRole: auth.actor.role,
      action: 'rbac_denied',
      resource,
      status: 'denied',
      ipAddress: getClientIp(req),
      details: `Required role: ${allowedRoles.join(',')}`,
    });
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden: Insufficient role permissions.' }, { status: 403 }),
    };
  }

  return auth;
}
