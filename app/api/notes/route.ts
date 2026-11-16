import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseConfig } from '@/utils/supabase/config';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, requireAuth } from '@/lib/security';
import { validateNotePayload, validateResourceId } from '@/lib/validation';
import { checkServerStorageQuotaForInsert } from '@/lib/serverStorageQuota';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'api/notes');
    if (!auth.ok) return auth.response;

    const rate = checkRateLimit(`notes:get:${auth.actor.uid}`, 120, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    const { url, key } = getSupabaseConfig();
    const supabase = createClient(url, key, {
      global: auth.actor.token
        ? { headers: { Authorization: `Bearer ${auth.actor.token}` } }
        : undefined,
    });

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', auth.actor.uid)
      .order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ notes: [], warning: error.message });
    }

    return NextResponse.json({ notes: data || [] });
  } catch (err: any) {
    return NextResponse.json({ notes: [], error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'api/notes');
    if (!auth.ok) return auth.response;

    const rate = checkRateLimit(`notes:post:${auth.actor.uid}`, 100, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const validated = validateNotePayload(body);
    if (!validated.valid) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const note = validated.data;
    const { url, key } = getSupabaseConfig();
    const supabase = createClient(url, key, {
      global: auth.actor.token
        ? { headers: { Authorization: `Bearer ${auth.actor.token}` } }
        : undefined,
    });

    const noteRow = {
      id: note.id,
      user_id: auth.actor.uid,
      title: note.title,
      content: note.content,
      color: note.color,
      is_pinned: note.isPinned,
      is_checklist: note.isChecklist,
      checklist_items: note.checklistItems,
      labels: note.labels,
      reminder_at: note.reminderAt,
      is_emergency: note.isEmergency,
      source_history: note.sourceHistory,
      updated_at: new Date().toISOString(),
    };

    const incomingBytes = new TextEncoder().encode(JSON.stringify(noteRow)).length;
    const quota = await checkServerStorageQuotaForInsert(
      supabase,
      auth.actor.uid,
      incomingBytes,
      'notes',
      note.id
    );

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

    let { data, error } = await supabase
      .from('notes')
      .upsert(noteRow)
      .select()
      .single();

    if (
      error &&
      (error.code === 'PGRST204' ||
        error.code === '42703' ||
        String(error.message || '').toLowerCase().includes('source_history'))
    ) {
      const { source_history: _omittedSource, ...legacyRow } = noteRow;
      void _omittedSource;
      const retry = await supabase.from('notes').upsert(legacyRow).select().single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      const isQuotaErr = /quota exceeded/i.test(error.message || '');
      return NextResponse.json(
        { success: false, storageFull: isQuotaErr, error: error.message },
        { status: isQuotaErr ? 413 : 400 }
      );
    }

    return NextResponse.json({ success: true, note: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'api/notes');
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const id = validateResourceId(url.searchParams.get('id'), 100);
    if (!id) {
      return NextResponse.json({ error: 'Invalid or missing note id' }, { status: 400 });
    }

    const { url: supabaseUrl, key } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, key, {
      global: auth.actor.token
        ? { headers: { Authorization: `Bearer ${auth.actor.token}` } }
        : undefined,
    });

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.actor.uid);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Note deleted permanently' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
