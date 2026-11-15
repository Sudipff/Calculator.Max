import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/security';
import { getUserCalculations } from '@/lib/db/users';
import { getSupabaseConfig } from '@/utils/supabase/config';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const TEN_MB_BYTES = 10 * 1024 * 1024; // 10,485,760 bytes

function getUtf8ByteLength(payload: unknown): number {
  try {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '');
    return Buffer.byteLength(str, 'utf8');
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'api/storage');
  if (!auth.ok) return auth.response;

  const uid = auth.actor.uid;
  const token = auth.actor.token;

  let calculationsBytes = 0;
  let notesBytes = 0;
  let tasksBytes = 0;
  let calculationsCount = 0;
  let notesCount = 0;
  let tasksCount = 0;
  let planId = 'pro';
  let countryRegion = 'India';
  let rpcSucceeded = false;

  try {
    const { url, key } = getSupabaseConfig();
    if (url && key) {
      const supabase = createClient(url, key, {
        global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      });

      // 1. Try invoking the database-level get_user_storage_usage() RPC first
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_storage_usage');
      if (!rpcError && rpcData && typeof rpcData === 'object') {
        rpcSucceeded = true;
        calculationsBytes = Number(rpcData.calculations_bytes) || 0;
        notesBytes = Number(rpcData.notes_bytes) || 0;
        tasksBytes = Number(rpcData.tasks_bytes) || 0;
        if (rpcData.plan_id) planId = String(rpcData.plan_id);
        if (rpcData.country_region) countryRegion = String(rpcData.country_region);
      }

      // 2. Also query row counts & exact payload sizes across cloud tables
      const [calcRes, notesRes, tasksRes, listsRes, subRes] = await Promise.all([
        supabase.from('calculations').select('*').eq('user_id', uid),
        supabase.from('notes').select('*').eq('user_id', uid),
        supabase.from('tasks').select('*').eq('user_id', uid),
        supabase.from('task_lists').select('*').eq('user_id', uid),
        supabase.from('user_subscriptions').select('*').eq('user_id', uid).maybeSingle(),
      ]);

      const calcRows = Array.isArray(calcRes.data) ? calcRes.data : [];
      const noteRows = Array.isArray(notesRes.data) ? notesRes.data : [];
      const taskRows = Array.isArray(tasksRes.data) ? tasksRes.data : [];
      const listRows = Array.isArray(listsRes.data) ? listsRes.data : [];

      calculationsCount = calcRows.length;
      notesCount = noteRows.length;
      tasksCount = taskRows.length;

      if (!rpcSucceeded) {
        calculationsBytes = calcRows.length > 0 ? getUtf8ByteLength(calcRows) : 0;
        notesBytes = noteRows.length > 0 ? getUtf8ByteLength(noteRows) : 0;
        tasksBytes =
          (taskRows.length > 0 ? getUtf8ByteLength(taskRows) : 0) +
          (listRows.length > 0 ? getUtf8ByteLength(listRows) : 0);
      }

      if (subRes.data?.plan_id) {
        planId = String(subRes.data.plan_id);
      }
      if (subRes.data?.country_region) {
        countryRegion = String(subRes.data.country_region);
      }
    }
  } catch {
    // Fallback to Drizzle / PostgreSQL calculation measurement
  }

  if (calculationsCount === 0 && calculationsBytes === 0) {
    try {
      const dbCalcs = await getUserCalculations(uid, token);
      if (Array.isArray(dbCalcs) && dbCalcs.length > 0) {
        calculationsCount = dbCalcs.length;
        calculationsBytes = getUtf8ByteLength(dbCalcs);
      }
    } catch {
      // ignore
    }
  }

  const usedBytes = calculationsBytes + notesBytes + tasksBytes;

  return NextResponse.json(
    {
      usedBytes,
      limitBytes: TEN_MB_BYTES,
      breakdown: {
        calculationsBytes,
        notesBytes,
        tasksBytes,
      },
      counts: {
        calculations: calculationsCount,
        notes: notesCount,
        tasks: tasksCount,
      },
      planId,
      countryRegion,
      syncedWithCloud: true,
      syncedAt: new Date().toISOString(),
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, 'api/storage');
  if (!auth.ok) return auth.response;

  const uid = auth.actor.uid;
  const token = auth.actor.token;
  const body = await req.json().catch(() => ({}));

  const allowedPlans = ['starter', 'pro', 'team', 'enterprise'];
  const nextPlan = allowedPlans.includes(body.planId) ? body.planId : 'pro';
  const nextCountry = typeof body.countryRegion === 'string' ? body.countryRegion.slice(0, 80) : undefined;

  try {
    const { url, key } = getSupabaseConfig();
    if (url && key) {
      const supabase = createClient(url, key, {
        global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      });

      const payload: Record<string, unknown> = {
        user_id: uid,
        plan_id: nextPlan,
        storage_limit_bytes: TEN_MB_BYTES,
        updated_at: new Date().toISOString(),
      };
      if (nextCountry) {
        payload.country_region = nextCountry;
      }

      await supabase.from('user_subscriptions').upsert(payload, { onConflict: 'user_id' });
    }
  } catch {
    // Non-blocking if table not yet created in Supabase
  }

  return NextResponse.json({
    ok: true,
    planId: nextPlan,
    countryRegion: nextCountry,
    limitBytes: TEN_MB_BYTES,
    syncedAt: new Date().toISOString(),
  });
}
