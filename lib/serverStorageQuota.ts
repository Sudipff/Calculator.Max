import { SupabaseClient } from '@supabase/supabase-js';
import {
  TEN_MB_LIMIT_BYTES,
  getPlanLimitBytes,
  isValidPlanId,
  SubscriptionPlanId,
} from './subscriptionPlans';

export interface ServerQuotaCheckResult {
  allowed: boolean;
  isUpdate: boolean;
  usedBytes: number;
  limitBytes: number;
  planId: SubscriptionPlanId;
}

function measurePayloadUtf8Bytes(rows: unknown[]): number {
  if (!rows || rows.length === 0) return 0;
  try {
    return new TextEncoder().encode(JSON.stringify(rows)).length;
  } catch {
    return 0;
  }
}

export async function checkServerStorageQuotaForInsert(
  supabase: SupabaseClient,
  uid: string,
  incomingRowBytes: number,
  tableName?: 'notes' | 'tasks' | 'task_lists',
  existingRowId?: string | null
): Promise<ServerQuotaCheckResult> {
  // Editing an existing item is always allowed so users are never locked out of modifying or trimming items
  if (tableName && existingRowId) {
    try {
      const { data: existing } = await supabase
        .from(tableName)
        .select('id')
        .eq('id', existingRowId)
        .eq('user_id', uid)
        .maybeSingle();

      if (existing) {
        return {
          allowed: true,
          isUpdate: true,
          usedBytes: 0,
          limitBytes: TEN_MB_LIMIT_BYTES,
          planId: 'starter',
        };
      }
    } catch {
      // Ignore table lookup errors cleanly
    }
  }

  let usedBytes = 0;
  let limitBytes = TEN_MB_LIMIT_BYTES;
  let planId: SubscriptionPlanId = 'starter';

  // 1. Prefer authoritative RPC usage & subscription limit
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_user_storage_usage');
    if (!rpcErr && rpcData) {
      usedBytes = Number(rpcData.used_bytes) || 0;
      planId = isValidPlanId(rpcData.plan_id) ? rpcData.plan_id : 'starter';
      limitBytes = Number(rpcData.limit_bytes) || getPlanLimitBytes(planId);
      const allowed = usedBytes < limitBytes && usedBytes + incomingRowBytes <= limitBytes;
      return { allowed, isUpdate: false, usedBytes, limitBytes, planId };
    }
  } catch {
    // Fallback below if SQL RPC is not yet installed
  }

  // 2. Graceful direct query fallback
  try {
    const [subRes, calcRes, notesRes, tasksRes, listsRes] = await Promise.all([
      supabase
        .from('user_subscriptions')
        .select('plan_id, storage_limit_bytes')
        .eq('user_id', uid)
        .maybeSingle(),
      supabase.from('calculations').select('id, type, details, result, created_at').eq('user_id', uid),
      supabase
        .from('notes')
        .select('id, title, content, checklist_items, labels, updated_at')
        .eq('user_id', uid),
      supabase
        .from('tasks')
        .select('id, list_id, parent_id, title, description, completed, due_date, updated_at')
        .eq('user_id', uid),
      supabase.from('task_lists').select('id, name, color, updated_at').eq('user_id', uid),
    ]);

    if (subRes.data && isValidPlanId(subRes.data.plan_id)) {
      planId = subRes.data.plan_id;
      limitBytes = Number(subRes.data.storage_limit_bytes) || getPlanLimitBytes(planId);
    }

    usedBytes =
      measurePayloadUtf8Bytes(calcRes.data || []) +
      measurePayloadUtf8Bytes(notesRes.data || []) +
      measurePayloadUtf8Bytes(tasksRes.data || []) +
      measurePayloadUtf8Bytes(listsRes.data || []);

    const allowed = usedBytes < limitBytes && usedBytes + incomingRowBytes <= limitBytes;
    return { allowed, isUpdate: false, usedBytes, limitBytes, planId };
  } catch {
    return {
      allowed: true,
      isUpdate: false,
      usedBytes: 0,
      limitBytes: TEN_MB_LIMIT_BYTES,
      planId: 'starter',
    };
  }
}
