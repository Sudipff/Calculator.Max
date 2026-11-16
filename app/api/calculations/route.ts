import { NextRequest, NextResponse } from 'next/server';
import {
  saveUserCalculation,
  getUserCalculations,
  deleteUserCalculation,
} from '../../../lib/db/users';
import { checkRateLimit, getClientIp, requireAuth } from '@/lib/security';
import { validateCalculationPayload, validateResourceId } from '@/lib/validation';
import { logSecurityEvent } from '@/lib/auditLog';
import { getSupabaseConfig } from '@/utils/supabase/config';
import { createClient } from '@supabase/supabase-js';
import { checkServerStorageQuotaForInsert } from '@/lib/serverStorageQuota';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'api/calculations');
    if (!auth.ok) return auth.response;

    const rate = checkRateLimit(`calc:get:${auth.actor.uid}`, 120, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    const calculations = await getUserCalculations(auth.actor.uid, auth.actor.token);
    return NextResponse.json({ calculations: calculations || [] });
  } catch (error: any) {
    console.error('Error fetching calculations:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch calculations' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'api/calculations');
    if (!auth.ok) return auth.response;

    const rate = checkRateLimit(`calc:post:${auth.actor.uid}`, 100, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const validated = validateCalculationPayload(body);
    if (!validated.valid) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { type, details, result } = validated.data;

    const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: auth.actor.token
          ? { headers: { Authorization: `Bearer ${auth.actor.token}` } }
          : undefined,
      });
      const incomingBytes = new TextEncoder().encode(
        JSON.stringify({ user_id: auth.actor.uid, type, details, result })
      ).length;
      const quota = await checkServerStorageQuotaForInsert(supabase, auth.actor.uid, incomingBytes);
      if (!quota.allowed) {
        return NextResponse.json(
          {
            success: false,
            storageFull: true,
            usedBytes: quota.usedBytes,
            limitBytes: quota.limitBytes,
            error: 'Cloud storage quota exceeded. Free up storage or upgrade your plan.',
          },
          { status: 413 }
        );
      }
    }

    const saved = await saveUserCalculation(
      auth.actor.uid,
      type,
      details,
      result,
      auth.actor.token
    );
    return NextResponse.json({ success: true, calculation: saved });
  } catch (error: any) {
    console.error('Error saving calculation:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to save calculation' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const auth = await requireAuth(req, 'api/calculations');
    if (!auth.ok) return auth.response;

    const rate = checkRateLimit(`calc:del:${auth.actor.uid}`, 60, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    const url = new URL(req.url);
    const searchId = url.searchParams.get('id');
    const searchAll = url.searchParams.get('all') === 'true';
    const searchDetails = url.searchParams.get('details');
    const searchResult = url.searchParams.get('result');
    const searchType = url.searchParams.get('type');

    let id: string | number | null = searchId;
    let deleteAll = searchAll;
    let details: string | null = searchDetails;
    let result: string | null = searchResult;
    let type: string | null = searchType;

    try {
      const body = await req.json();
      if (body && typeof body === 'object') {
        if (body.id !== undefined) id = body.id;
        if (body.all !== undefined) deleteAll = !!body.all;
        if (body.details !== undefined) details = typeof body.details === 'string' ? body.details : null;
        if (body.result !== undefined) result = typeof body.result === 'string' ? body.result : null;
        if (body.type !== undefined) type = typeof body.type === 'string' ? body.type : null;
      }
    } catch {
      // Query params will be used
    }

    if (id !== null && id !== undefined && id !== '') {
      const safeId = validateResourceId(id, 128);
      if (!safeId) {
        return NextResponse.json({ error: 'Invalid calculation identifier.' }, { status: 400 });
      }
      id = safeId;
    }

    if (!deleteAll && !id && (!details || !result)) {
      return NextResponse.json({ error: 'Missing calculation identifier to delete' }, { status: 400 });
    }

    await deleteUserCalculation(
      auth.actor.uid,
      id,
      details,
      result,
      type,
      deleteAll,
      auth.actor.token
    );

    if (deleteAll) {
      await logSecurityEvent({
        userUid: auth.actor.uid,
        actorRole: auth.actor.role,
        action: 'calculations_clear_all',
        resource: 'api/calculations',
        status: 'success',
        ipAddress: ip,
        details: 'Cleared all calculation history entries for user',
      });
    }

    return NextResponse.json({
      success: true,
      message: deleteAll ? 'All calculations deleted from database' : 'Calculation deleted from database',
    });
  } catch (error: any) {
    console.error('Error deleting calculation:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete calculation' },
      { status: 500 }
    );
  }
}
