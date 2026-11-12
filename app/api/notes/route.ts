import { NextRequest, NextResponse } from 'next/server';
import { verifyOrDecodeToken } from '@/lib/auth-helper';
import { getSupabaseConfig } from '@/utils/supabase/config';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

async function resolveUser(req: NextRequest): Promise<{ uid: string; token?: string } | null> {
  const authHeader = req.headers.get('authorization');
  const customUserId = req.headers.get('x-user-id');
  let token: string | undefined = undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split('Bearer ')[1]?.trim();
    if (token) {
      const decoded = await verifyOrDecodeToken(token);
      if (decoded?.uid) {
        return { uid: decoded.uid, token };
      }
    }
  }

  if (customUserId && customUserId.trim()) {
    return { uid: customUserId.trim(), token };
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveUser(req);
    if (!auth?.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url, key } = getSupabaseConfig();
    const supabase = createClient(url, key, {
      global: auth.token ? { headers: { Authorization: `Bearer ${auth.token}` } } : undefined,
    });

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', auth.uid)
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
    const auth = await resolveUser(req);
    if (!auth?.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const note = await req.json();
    const { url, key } = getSupabaseConfig();
    const supabase = createClient(url, key, {
      global: auth.token ? { headers: { Authorization: `Bearer ${auth.token}` } } : undefined,
    });

    const { data, error } = await supabase
      .from('notes')
      .upsert({
        id: note.id,
        user_id: auth.uid,
        title: note.title || '',
        content: note.content || '',
        color: note.color || 'default',
        is_pinned: !!note.isPinned,
        is_checklist: !!note.isChecklist,
        checklist_items: note.checklistItems || [],
        labels: note.labels || [],
        reminder_at: note.reminderAt || null,
        is_emergency: !!note.isEmergency,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, note: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await resolveUser(req);
    if (!auth?.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing note id' }, { status: 400 });
    }

    const { url: supabaseUrl, key } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, key, {
      global: auth.token ? { headers: { Authorization: `Bearer ${auth.token}` } } : undefined,
    });

    const { error } = await supabase.from('notes').delete().eq('id', id).eq('user_id', auth.uid);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Note deleted permanently' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
