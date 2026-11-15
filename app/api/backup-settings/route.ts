import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/security';
import { getSupabaseConfig } from '@/utils/supabase/config';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const DEFAULT_PERMISSIONS = {
  calculatorHistory: true,
  notes: true,
  tasks: true,
};

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'api/backup-settings');
  if (!auth.ok) return auth.response;

  const uid = auth.actor.uid;
  const token = auth.actor.token;
  let permissions = { ...DEFAULT_PERMISSIONS };
  let syncedWithCloud = false;

  try {
    const { url, key } = getSupabaseConfig();
    if (url && key) {
      const supabase = createClient(url, key, {
        global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      });

      const { data, error } = await supabase
        .from('user_backup_settings')
        .select('backup_calculator_history, backup_notes, backup_tasks')
        .eq('user_id', uid)
        .maybeSingle();

      if (!error && data) {
        syncedWithCloud = true;
        permissions = {
          calculatorHistory:
            typeof data.backup_calculator_history === 'boolean'
              ? data.backup_calculator_history
              : true,
          notes: typeof data.backup_notes === 'boolean' ? data.backup_notes : true,
          tasks: typeof data.backup_tasks === 'boolean' ? data.backup_tasks : true,
        };
      }
    }
  } catch {
    // Gracefully fallback to defaults if table is not yet provisioned
  }

  return NextResponse.json(
    {
      permissions,
      syncedWithCloud,
      updatedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, 'api/backup-settings');
  if (!auth.ok) return auth.response;

  const uid = auth.actor.uid;
  const token = auth.actor.token;
  const body = await req.json().catch(() => ({}));

  const permissions = {
    calculatorHistory:
      typeof body.calculatorHistory === 'boolean' ? body.calculatorHistory : true,
    notes: typeof body.notes === 'boolean' ? body.notes : true,
    tasks: typeof body.tasks === 'boolean' ? body.tasks : true,
  };

  let syncedWithCloud = false;

  try {
    const { url, key } = getSupabaseConfig();
    if (url && key) {
      const supabase = createClient(url, key, {
        global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      });

      const { error } = await supabase.from('user_backup_settings').upsert(
        {
          user_id: uid,
          backup_calculator_history: permissions.calculatorHistory,
          backup_notes: permissions.notes,
          backup_tasks: permissions.tasks,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (!error) {
        syncedWithCloud = true;
      }
    }
  } catch {
    // Non-blocking if SQL table is not yet migrated
  }

  return NextResponse.json({
    ok: true,
    permissions,
    syncedWithCloud,
    updatedAt: new Date().toISOString(),
  });
}
