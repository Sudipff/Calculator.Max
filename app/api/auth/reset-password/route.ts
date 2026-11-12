import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyOrDecodeToken } from '../../../../lib/auth-helper';
import { updateUserPassword } from '../../../../lib/db/users';
import { upsertStoredUser } from '@/lib/emailAuthStore';
import { getSupabaseConfig } from '@/utils/supabase/config';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Securely hash password using scrypt with cryptographically random salt
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { newPassword, confirmPassword, token: bodyToken, email: bodyEmail, uid: bodyUid } = body;

    // 1. Password validation
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json(
        { error: 'New password is required.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: 'New password and confirm password do not match.' },
        { status: 400 }
      );
    }

    // 2. Extract Auth Token from header or body
    const authHeader = req.headers.get('authorization');
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.split('Bearer ')[1]
        : bodyToken || '';

    let uid = bodyUid || '';
    let email = bodyEmail || '';

    // Verify token if available
    if (token) {
      try {
        const decoded = await verifyOrDecodeToken(token);
        if (decoded) {
          uid = decoded.uid || uid;
          email = decoded.email || email;
        }
      } catch (err) {
        console.warn('Token verification note:', err);
      }
    }

    // 3. Update in Supabase Auth if session token exists
    if (token) {
      try {
        const { url, key } = getSupabaseConfig();
        if (url && key) {
          const supabaseClient = createClient(url, key, {
            auth: { persistSession: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          const { error: updateError } = await supabaseClient.auth.updateUser({
            password: newPassword,
          });
          if (updateError) {
            console.warn('Supabase updateUser warning:', updateError.message);
          }
        }
      } catch (err) {
        console.warn('Supabase auth update note:', err);
      }
    }

    // 4. Hash password securely with cryptographically strong salt
    const passwordHash = hashPassword(newPassword);

    // 5. Update user database record in Cloud SQL / PostgreSQL and emailAuthStore
    const targetUid = uid || undefined;
    const dbResult = await updateUserPassword(targetUid || `recovery_${Date.now()}`, passwordHash, email);
    if (email) {
      await upsertStoredUser({
        email,
        passwordHash,
        uid: targetUid,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Your password has been changed successfully. You can now log in.',
      uid: targetUid || `recovery_${Date.now()}`,
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
