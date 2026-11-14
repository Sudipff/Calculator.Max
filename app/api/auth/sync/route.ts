import { NextRequest, NextResponse } from 'next/server';
import { verifyOrDecodeToken } from '../../../../lib/auth-helper';
import { getOrCreateUser } from '../../../../lib/db/users';
import {
  attachSessionCookie,
  getClientIp,
  verifyCsrfAndOrigin,
  AppRole,
} from '@/lib/security';
import { logSecurityEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const csrf = verifyCsrfAndOrigin(req);
    if (!csrf.ok) {
      return NextResponse.json({ error: 'Forbidden: Cross-origin request rejected' }, { status: 403 });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    const userToken = await verifyOrDecodeToken(token);

    if (!userToken) {
      await logSecurityEvent({
        userUid: null,
        actorRole: 'anonymous',
        action: 'auth_sync_invalid_token',
        resource: 'api/auth/sync',
        status: 'denied',
        ipAddress: ip,
        details: 'Rejected invalid or expired Bearer token',
      });
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const { uid, email, name, picture } = userToken;

    const userRecord = await getOrCreateUser(
      uid,
      email || '',
      name || '',
      picture || ''
    );

    const role: AppRole = userRecord?.role === 'admin' ? 'admin' : 'user';
    const res = NextResponse.json({ success: true, user: userRecord });
    attachSessionCookie(res, req, {
      uid,
      email: email || '',
      role,
      name: name || '',
    });

    await logSecurityEvent({
      userUid: uid,
      actorRole: role,
      action: 'auth_sync_success',
      resource: 'api/auth/sync',
      status: 'success',
      ipAddress: ip,
      details: 'User synchronized and HttpOnly session issued',
    });

    return res;
  } catch (error: any) {
    console.error('Error in /api/auth/sync route:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to authenticate user.' },
      { status: 500 }
    );
  }
}
