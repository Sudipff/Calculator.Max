import { NextRequest, NextResponse } from 'next/server';
import {
  findStoredUserByEmail,
  upsertStoredUser,
  verifyPasswordScrypt,
  StoredEmailUser,
} from '@/lib/emailAuthStore';

export const dynamic = 'force-dynamic';

function toClientUser(u: StoredEmailUser) {
  return {
    id: u.uid,
    email: u.email,
    user_metadata: {
      full_name: u.displayName || u.email.split('@')[0],
      avatar_url: u.photoURL || '',
    },
    app_metadata: { provider: 'email' },
    is_anonymous: false,
    aud: 'authenticated',
    created_at: u.createdAt,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action,
      email,
      password,
      displayName,
      supabaseUid,
      forceSync,
    } = body || {};

    const cleanEmail =
      typeof email === 'string'
        ? email.replace(/[\s\u200B-\u200D\uFEFF]+/g, '').toLowerCase()
        : '';

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    const existing = await findStoredUserByEmail(cleanEmail);

    if (action === 'forgot_password') {
      const userRecord =
        existing ||
        (await upsertStoredUser({
          email: cleanEmail,
        }));

      return NextResponse.json({
        success: true,
        email: cleanEmail,
        uid: userRecord.uid,
        message: 'Password reset initialized.',
      });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    if (action === 'signup') {
      if (existing && existing.passwordHash && !forceSync) {
        // If the user entered the matching password on the Create Account screen, sign them right in
        if (verifyPasswordScrypt(password, existing.passwordHash)) {
          return NextResponse.json({
            success: true,
            signedIn: true,
            user: toClientUser(existing),
          });
        }
        return NextResponse.json(
          {
            success: false,
            alreadyExists: true,
            error:
              'An account with this email already exists. Please sign in with your password, or click "Forgot password?" to reset it.',
          },
          { status: 409 }
        );
      }

      const saved = await upsertStoredUser({
        email: cleanEmail,
        password,
        displayName,
        uid: supabaseUid,
      });

      return NextResponse.json({
        success: true,
        signedIn: true,
        user: toClientUser(saved),
      });
    }

    if (action === 'signin') {
      if (existing && existing.passwordHash) {
        if (forceSync) {
          const updated = await upsertStoredUser({
            email: cleanEmail,
            password,
            displayName,
            uid: supabaseUid || existing.uid,
          });
          return NextResponse.json({
            success: true,
            user: toClientUser(updated),
          });
        }

        const isValid = verifyPasswordScrypt(password, existing.passwordHash);
        if (!isValid) {
          return NextResponse.json(
            {
              success: false,
              error:
                'Invalid email or password. Please check your credentials or use "Forgot password?" to reset it.',
            },
            { status: 401 }
          );
        }

        return NextResponse.json({
          success: true,
          user: toClientUser(existing),
        });
      }

      // If no local/DB password record exists yet (e.g. account was created in Supabase with pending email confirmation),
      // initialize the account record so the user can sign in without being blocked by unconfirmed email status.
      const initialized = await upsertStoredUser({
        email: cleanEmail,
        password,
        displayName,
        uid: supabaseUid,
      });

      return NextResponse.json({
        success: true,
        user: toClientUser(initialized),
      });
    }

    return NextResponse.json({ error: 'Invalid auth action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Authentication service failed.' },
      { status: 500 }
    );
  }
}
