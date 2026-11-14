import { NextRequest, NextResponse } from 'next/server';
import {
  findStoredUserByEmail,
  upsertStoredUser,
  verifyPasswordScrypt,
  StoredEmailUser,
} from '@/lib/emailAuthStore';
import {
  attachSessionCookie,
  checkRateLimit,
  getClientIp,
  verifyCsrfAndOrigin,
} from '@/lib/security';
import { sanitizeEmail, sanitizePlainText, validatePasswordInput } from '@/lib/validation';
import { verifyOrDecodeToken } from '@/lib/auth-helper';
import { logSecurityEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

function toClientUser(u: StoredEmailUser) {
  return {
    id: u.uid,
    email: u.email,
    role: u.role,
    user_metadata: {
      full_name: u.displayName || u.email.split('@')[0],
      avatar_url: u.photoURL || '',
      role: u.role,
    },
    app_metadata: { provider: 'email', role: u.role },
    is_anonymous: false,
    aud: 'authenticated',
    created_at: u.createdAt,
  };
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const csrf = verifyCsrfAndOrigin(req);
    if (!csrf.ok) {
      await logSecurityEvent({
        userUid: null,
        actorRole: 'anonymous',
        action: 'auth_csrf_blocked',
        resource: 'api/auth/email',
        status: 'denied',
        ipAddress: ip,
        details: csrf.reason,
      });
      return NextResponse.json({ error: 'Forbidden: Cross-origin request rejected.' }, { status: 403 });
    }

    const rate = checkRateLimit(`auth:${ip}`, 25, 5 * 60_000);
    if (!rate.allowed) {
      await logSecurityEvent({
        userUid: null,
        actorRole: 'anonymous',
        action: 'auth_rate_limited',
        resource: 'api/auth/email',
        status: 'denied',
        ipAddress: ip,
        details: 'Too many authentication attempts',
      });
      return NextResponse.json(
        { error: 'Too many authentication attempts. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const {
      action,
      email,
      password,
      displayName,
      supabaseUid,
      supabaseAccessToken,
      forceSync,
    } = body as Record<string, unknown>;

    const cleanEmail = sanitizeEmail(email);
    if (!cleanEmail) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    const cleanDisplayName = sanitizePlainText(displayName, 80);
    const existing = await findStoredUserByEmail(cleanEmail);

    if (action === 'forgot_password') {
      // Do not reveal account existence or mint unverified reset privileges
      await logSecurityEvent({
        userUid: existing?.uid || null,
        actorRole: existing?.role || 'anonymous',
        action: 'auth_forgot_password_requested',
        resource: 'api/auth/email',
        status: 'success',
        ipAddress: ip,
        details: 'Password reset requested via email flow',
      });
      return NextResponse.json({
        success: true,
        message: 'If an account matches this email, recovery instructions have been initialized.',
      });
    }

    const pwCheck = validatePasswordInput(password);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 });
    }
    const rawPassword = password as string;

    // Verify Supabase token if caller claims an authenticated Supabase session sync
    let verifiedSupabaseUid: string | undefined;
    if (typeof supabaseAccessToken === 'string' && supabaseAccessToken.trim()) {
      const verified = await verifyOrDecodeToken(supabaseAccessToken.trim());
      if (verified && verified.email?.toLowerCase() === cleanEmail) {
        verifiedSupabaseUid = verified.uid;
      }
    }

    if (action === 'signup') {
      if (existing && existing.passwordHash && !(forceSync && verifiedSupabaseUid)) {
        if (verifyPasswordScrypt(rawPassword, existing.passwordHash)) {
          const res = NextResponse.json({
            success: true,
            signedIn: true,
            user: toClientUser(existing),
          });
          attachSessionCookie(res, req, {
            uid: existing.uid,
            email: existing.email,
            role: existing.role,
            name: existing.displayName,
          });
          await logSecurityEvent({
            userUid: existing.uid,
            actorRole: existing.role,
            action: 'auth_signin',
            resource: 'api/auth/email',
            status: 'success',
            ipAddress: ip,
            details: 'Signed in with matching credentials on signup',
          });
          return res;
        }
        await logSecurityEvent({
          userUid: existing.uid,
          actorRole: existing.role,
          action: 'auth_signup_conflict',
          resource: 'api/auth/email',
          status: 'denied',
          ipAddress: ip,
          details: 'Duplicate email signup with non-matching password',
        });
        return NextResponse.json(
          {
            success: false,
            alreadyExists: true,
            error:
              'An account with this email already exists. Please sign in with your password, or use "Forgot Password?" to reset it.',
          },
          { status: 409 }
        );
      }

      const saved = await upsertStoredUser({
        email: cleanEmail,
        password: rawPassword,
        displayName: cleanDisplayName || undefined,
        uid: verifiedSupabaseUid || (typeof supabaseUid === 'string' && !existing ? sanitizePlainText(supabaseUid, 80) : undefined),
      });

      const res = NextResponse.json({
        success: true,
        signedIn: true,
        user: toClientUser(saved),
      });
      attachSessionCookie(res, req, {
        uid: saved.uid,
        email: saved.email,
        role: saved.role,
        name: saved.displayName,
      });
      await logSecurityEvent({
        userUid: saved.uid,
        actorRole: saved.role,
        action: 'auth_signup',
        resource: 'api/auth/email',
        status: 'success',
        ipAddress: ip,
        details: 'Account registered with scrypt hash & signed HttpOnly session',
      });
      return res;
    }

    if (action === 'signin') {
      if (existing && existing.passwordHash) {
        if (forceSync && verifiedSupabaseUid) {
          const updated = await upsertStoredUser({
            email: cleanEmail,
            password: rawPassword,
            displayName: cleanDisplayName || undefined,
            uid: verifiedSupabaseUid || existing.uid,
          });
          const res = NextResponse.json({
            success: true,
            user: toClientUser(updated),
          });
          attachSessionCookie(res, req, {
            uid: updated.uid,
            email: updated.email,
            role: updated.role,
            name: updated.displayName,
          });
          await logSecurityEvent({
            userUid: updated.uid,
            actorRole: updated.role,
            action: 'auth_signin_supabase_sync',
            resource: 'api/auth/email',
            status: 'success',
            ipAddress: ip,
            details: 'Verified Supabase session synced to signed cookie',
          });
          return res;
        }

        const isValid = verifyPasswordScrypt(rawPassword, existing.passwordHash);
        if (!isValid) {
          await logSecurityEvent({
            userUid: existing.uid,
            actorRole: existing.role,
            action: 'auth_signin_failed',
            resource: 'api/auth/email',
            status: 'denied',
            ipAddress: ip,
            details: 'Invalid password attempt',
          });
          return NextResponse.json(
            {
              success: false,
              error:
                'Invalid email or password. Please check your credentials or use "Forgot Password?" to reset it.',
            },
            { status: 401 }
          );
        }

        const res = NextResponse.json({
          success: true,
          user: toClientUser(existing),
        });
        attachSessionCookie(res, req, {
          uid: existing.uid,
          email: existing.email,
          role: existing.role,
          name: existing.displayName,
        });
        await logSecurityEvent({
          userUid: existing.uid,
          actorRole: existing.role,
          action: 'auth_signin',
          resource: 'api/auth/email',
          status: 'success',
          ipAddress: ip,
          details: 'Email login succeeded with signed HttpOnly session',
        });
        return res;
      }

      // Only initialize a missing local record if caller proved authentication via Supabase JWT
      if (verifiedSupabaseUid) {
        const initialized = await upsertStoredUser({
          email: cleanEmail,
          password: rawPassword,
          displayName: cleanDisplayName || undefined,
          uid: verifiedSupabaseUid,
        });
        const res = NextResponse.json({
          success: true,
          user: toClientUser(initialized),
        });
        attachSessionCookie(res, req, {
          uid: initialized.uid,
          email: initialized.email,
          role: initialized.role,
          name: initialized.displayName,
        });
        await logSecurityEvent({
          userUid: initialized.uid,
          actorRole: initialized.role,
          action: 'auth_signin_supabase_init',
          resource: 'api/auth/email',
          status: 'success',
          ipAddress: ip,
          details: 'Verified Supabase user initialized in local store',
        });
        return res;
      }

      await logSecurityEvent({
        userUid: null,
        actorRole: 'anonymous',
        action: 'auth_signin_failed',
        resource: 'api/auth/email',
        status: 'denied',
        ipAddress: ip,
        details: 'Unknown account sign-in attempt',
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email or password. Please sign up first if you are a new user.',
        },
        { status: 401 }
      );
    }

    return NextResponse.json({ error: 'Invalid auth action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Authentication service failed.' },
      { status: 500 }
    );
  }
}
