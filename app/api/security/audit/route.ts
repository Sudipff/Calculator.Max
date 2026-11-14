import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/security';
import { getSecurityAuditLogs } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope');

  const auth =
    scope === 'all'
      ? await requireRole(req, ['admin'], 'api/security/audit')
      : await requireAuth(req, 'api/security/audit');

  if (!auth.ok) return auth.response;

  const isAdminScope = scope === 'all' && auth.actor.role === 'admin';
  const logs = await getSecurityAuditLogs({
    userUid: auth.actor.uid,
    isAdmin: isAdminScope,
    limit: 50,
  });

  return NextResponse.json({
    actor: {
      uid: auth.actor.uid,
      role: auth.actor.role,
      authMethod: auth.actor.authMethod,
    },
    protocols: {
      encryptionAtRest: 'AES-256-GCM (field-level) + scrypt password hashing',
      encryptionInTransit: 'HTTPS / TLS + HSTS',
      sqlInjectionDefense: 'Parameterized Drizzle ORM queries + Supabase RLS',
      csrfDefense: 'HttpOnly SameSite=Lax signed cookies + Origin & Fetch-Metadata verification',
      xssDefense: 'Strict input sanitization + CSP + CSV formula neutralization',
      rbac: 'Role-Based Access Control (user / admin)',
    },
    auditLogs: logs,
  });
}
