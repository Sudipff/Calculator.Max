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

    const [tasksRes, listsRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', auth.uid).order('created_at', { ascending: false }),
      supabase.from('task_lists').select('*').eq('user_id', auth.uid).order('created_at', { ascending: true }),
    ]);

    return NextResponse.json({
      tasks: tasksRes.data || [],
      lists: listsRes.data || [],
    });
  } catch (err: any) {
    return NextResponse.json({ tasks: [], lists: [], error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveUser(req);
    if (!auth?.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { url, key } = getSupabaseConfig();
    const supabase = createClient(url, key, {
      global: auth.token ? { headers: { Authorization: `Bearer ${auth.token}` } } : undefined,
    });

    if (body.type === 'list') {
      const { data, error } = await supabase.from('task_lists').upsert({
        id: body.id,
        user_id: auth.uid,
        name: body.name,
        color: body.color || 'blue',
        is_default: !!body.isDefault,
        updated_at: new Date().toISOString(),
      }).select().single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, list: data });
    }

    // Task upsert
    const { data, error } = await supabase.from('tasks').upsert({
      id: body.id,
      user_id: auth.uid,
      list_id: body.listId || null,
      parent_id: body.parentId || null,
      title: body.title,
      description: body.description || '',
      completed: !!body.completed,
      is_starred: !!body.isStarred,
      due_date: body.dueDate || null,
      reminder_at: body.reminderAt || null,
      updated_at: new Date().toISOString(),
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, task: data });
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
    const isList = url.searchParams.get('isList') === 'true';

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const { url: supabaseUrl, key } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, key, {
      global: auth.token ? { headers: { Authorization: `Bearer ${auth.token}` } } : undefined,
    });

    if (isList) {
      await supabase.from('task_lists').delete().eq('id', id).eq('user_id', auth.uid);
    } else {
      await supabase.from('tasks').delete().eq('id', id).eq('user_id', auth.uid);
    }

    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
