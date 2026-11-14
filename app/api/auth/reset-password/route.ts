import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyOrDecodeToken } from '../../../../lib/auth-helper';
import { updateUserPassword } from '../../../../lib/db/users';
import { upsertStoredUser } from '@/lib/emailAuthStore';
import { getSupabaseConfig } from '@/utils/supabase/config';
import { createClient } from '@supabase/supabase-js';
import {
  authenticateRequest,
  checkRateLimit,
  getClientIp,
  verifyCsrfAndOrigin,
} from '@/lib/security';
import { validatePasswordInput } from '@/lib/validation';
import { logSecurityEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const csrf = verifyCsrfAndOrigin(req);
    if (!csrf.ok) {
      return NextResponse.json({ error: 'Forbidden: Cross-origin request blocked.' }, { status: 403 });
    }

    const rate = checkRateLimit(`reset-pw:${ip}`, 10, 10 * 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many password reset requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const { newPassword, confirmPassword, token: bodyToken } = body as Record<string, unknown>;

    const pwCheck = validatePasswordInput(newPassword);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: 'New password and confirm password do not match.' },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get('authorization');
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.split('Bearer ')[1]?.trim()
        : typeof bodyToken === 'string'
        ? bodyToken.trim()
        : '';

    let verifiedUid = '';
    let verifiedEmail = '';
    let actorRole: 'user' | 'admin' = 'user';

    if (token) {
      const decoded = await verifyOrDecodeToken(token);
      if (decoded?.uid) {
        verifiedUid = decoded.uid;
        verifiedEmail = decoded.email || '';
        actorRole = decoded.role === 'admin' ? 'admin' : 'user';
      }
    }

    if (!verifiedUid) {
      const { actor } = await authenticateRequest(req);
      if (actor) {
        verifiedUid = actor.uid;
        verifiedEmail = actor.email;
        actorRole = actor.role;
      }
    }

    if (!verifiedUid) {
      await logSecurityEvent({
        userUid: null,
        actorRole: 'anonymous',
        action: 'password_reset_unauthorized',
        resource: 'api/auth/reset-password',
        status: 'denied',
        ipAddress: ip,
        details: 'Rejected password reset without verified session or recovery token',
      });
      return NextResponse.json(
        { error: 'Unauthorized: Please open the valid recovery link from your email or sign in first.' },
        { status: 401 }
      );
    }

    if (token) {
      try {
        const { url, key } = getSupabaseConfig();
        if (url && key) {
          const supabaseClient = createClient(url, key, {
            auth: { persistSession: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          await supabaseClient.auth.updateUser({ password: newPassword as string });
        }
      } catch (err) {
        console.warn('Supabase auth update note:', err);
      }
    }

    const passwordHash = hashPassword(newPassword as string);
    const dbResult = await updateUserPassword(verifiedUid, passwordHash, verifiedEmail);

    if (verifiedEmail) {
      await upsertStoredUser({
        email: verifiedEmail,
        passwordHash,
        uid: verifiedUid,
      });
    }

    await logSecurityEvent({
      userUid: verifiedUid,
      actorRole,
      action: 'password_reset_success',
      resource: 'api/auth/reset-password',
      status: 'success',
      ipAddress: ip,
      details: 'Password updated securely via verified token',
    });

    return NextResponse.json({
      success: true,
      message: 'Your password has been changed successfully. You can now log in.',
      uid: verifiedUid,
      databaseUpdated: !!dbResult,
    });
  } catch (error: any) {
    console.warn('Warning in /api/auth/reset-password route:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update password. Please try again.' },
      { status: 500 }
    );
  }
}
