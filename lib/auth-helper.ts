import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from '@/utils/supabase/config';
import { SESSION_COOKIE_NAME, verifySessionToken } from './security';

export interface DecodedUserToken {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
  role?: 'user' | 'admin';
}

/**
 * Cryptographically verifies a Bearer JWT against Supabase Auth or verifies
 * our HMAC-SHA256 signed session cookie. Never trusts unverified base64 JWT claims.
 */
export async function verifyOrDecodeToken(token: string): Promise<DecodedUserToken | null> {
  if (!token || typeof token !== 'string') return null;

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
      if (user) {
        return {
          uid: user.id,
          email: user.email || '',
          name: user.user_metadata?.full_name || '',
          picture: user.user_metadata?.avatar_url || '',
        };
      }
    }
  } catch (err) {
    console.warn('Supabase token verification notice:', err);
  }

  const verifiedCookiePayload = verifySessionToken(token);
  if (verifiedCookiePayload) {
    return {
      uid: verifiedCookiePayload.uid,
      email: verifiedCookiePayload.email,
      name: verifiedCookiePayload.name,
      role: verifiedCookiePayload.role,
    };
  }

  // Also allow checking signed cookie store directly if token wasn't a Supabase JWT
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = verifySessionToken(sessionToken);
    if (session) {
      return {
        uid: session.uid,
        email: session.email,
        name: session.name,
        role: session.role,
      };
    }
  } catch {
    // Ignore cookie read errors outside request context
  }

  return null;
}
