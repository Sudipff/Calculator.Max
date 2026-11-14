import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, getClientIp, requireAuth } from '@/lib/security';
import { deleteAllUserAccountData, getUserCalculations } from '@/lib/db/users';
import { getSecurityAuditLogs, logSecurityEvent } from '@/lib/auditLog';
import { getSupabaseConfig } from '@/utils/supabase/config';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GDPR / Data Privacy Export (Right of Access / Portability)
 */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const auth = await requireAuth(req, 'api/privacy');
  if (!auth.ok) return auth.response;

  const calculations = await getUserCalculations(auth.actor.uid, auth.actor.token);
  let notes: unknown[] = [];
  let tasks: unknown[] = [];
  let taskLists: unknown[] = [];

  try {
    const { url, key } = getSupabaseConfig();
    if (url && key) {
      const supabase = createClient(url, key, {
        global: auth.actor.token
          ? { headers: { Authorization: `Bearer ${auth.actor.token}` } }
          : undefined,
      });
      const [notesRes, tasksRes, listsRes] = await Promise.all([
        supabase.from('notes').select('*').eq('user_id', auth.actor.uid),
        supabase.from('tasks').select('*').eq('user_id', auth.actor.uid),
        supabase.from('task_lists').select('*').eq('user_id', auth.actor.uid),
      ]);
      notes = notesRes.data || [];
      tasks = tasksRes.data || [];
      taskLists = listsRes.data || [];
    }
  } catch {
    // Fallback gracefully
  }

  const auditLogs = await getSecurityAuditLogs({
    userUid: auth.actor.uid,
    isAdmin: false,
    limit: 100,
  });

  await logSecurityEvent({
    userUid: auth.actor.uid,
    actorRole: auth.actor.role,
    action: 'privacy_data_export',
    resource: 'api/privacy',
    status: 'success',
    ipAddress: ip,
    details: 'User exported personal data archive',
  });

  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      account: {
        uid: auth.actor.uid,
        email: auth.actor.email,
        role: auth.actor.role,
      },
      data: {
        calculations,
        notes,
        tasks,
        taskLists,
        securityAuditLogs: auditLogs,
      },
    },
    {
      headers: {
        'Content-Disposition': 'attachment; filename="calculator-max-privacy-export.json"',
        'Cache-Control': 'no-store',
      },
    }
  );
}

/**
 * GDPR / Data Privacy Erasure (Right to be Forgotten)
 */
export async function DELETE(req: NextRequest) {
  const ip = getClientIp(req);
  const auth = await requireAuth(req, 'api/privacy');
  if (!auth.ok) return auth.response;

  await logSecurityEvent({
    userUid: auth.actor.uid,
    actorRole: auth.actor.role,
    action: 'privacy_account_erased',
    resource: 'api/privacy',
    status: 'success',
    ipAddress: ip,
    details: 'User requested permanent account & data deletion',
  });

  const deleted = await deleteAllUserAccountData(
    auth.actor.uid,
    auth.actor.email,
    auth.actor.token
  );

  const res = NextResponse.json({
    success: deleted,
    message: deleted
      ? 'All server-side user data and calculation history have been permanently erased.'
      : 'Data erasure completed with warnings.',
  });
  clearSessionCookie(res, req);
  return res;
}
