import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  clearSessionCookie,
  getClientIp,
  verifyCsrfAndOrigin,
} from '@/lib/security';
import { logSecurityEvent } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const csrf = verifyCsrfAndOrigin(req);
  if (!csrf.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { actor } = await authenticateRequest(req);
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res, req);

  if (actor) {
    await logSecurityEvent({
      userUid: actor.uid,
      actorRole: actor.role,
      action: 'auth_logout',
      resource: 'api/auth/logout',
      status: 'success',
      ipAddress: getClientIp(req),
      details: 'Session cookie cleared on sign-out',
    });
  }

  return res;
}
