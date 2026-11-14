import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseConfig } from '@/utils/supabase/config';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, requireAuth } from '@/lib/security';
import { validateResourceId, validateTaskOrListPayload } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'api/tasks');
    if (!auth.ok) return auth.response;

    const rate = checkRateLimit(`tasks:get:${auth.actor.uid}`, 120, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    const { url, key } = getSupabaseConfig();
    const supabase = createClient(url, key, {
      global: auth.actor.token
        ? { headers: { Authorization: `Bearer ${auth.actor.token}` } }
        : undefined,
    });

    const [tasksRes, listsRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('*')
        .eq('user_id', auth.actor.uid)
        .order('created_at', { ascending: false }),
      supabase
        .from('task_lists')
        .select('*')
        .eq('user_id', auth.actor.uid)
        .order('created_at', { ascending: true }),
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
    const auth = await requireAuth(req, 'api/tasks');
    if (!auth.ok) return auth.response;

    const rate = checkRateLimit(`tasks:post:${auth.actor.uid}`, 100, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    const rawBody = await req.json().catch(() => null);
    const validated = validateTaskOrListPayload(rawBody);
    if (!validated.valid) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { url, key } = getSupabaseConfig();
    const supabase = createClient(url, key, {
      global: auth.actor.token
        ? { headers: { Authorization: `Bearer ${auth.actor.token}` } }
        : undefined,
    });

    if (validated.kind === 'list') {
      const list = validated.data;
      const { data, error } = await supabase
        .from('task_lists')
        .upsert({
          id: list.id,
          user_id: auth.actor.uid,
          name: list.name,
          color: list.color,
          is_default: list.isDefault,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, list: data });
    }

    const task = validated.data;
    const { data, error } = await supabase
      .from('tasks')
      .upsert({
        id: task.id,
        user_id: auth.actor.uid,
        list_id: task.listId,
        parent_id: task.parentId,
        title: task.title,
        description: task.description,
        completed: task.completed,
        is_starred: task.isStarred,
        due_date: task.dueDate,
        reminder_at: task.reminderAt,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, task: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'api/tasks');
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const id = validateResourceId(url.searchParams.get('id'), 100);
    const isList = url.searchParams.get('isList') === 'true';

    if (!id) {
      return NextResponse.json({ error: 'Invalid or missing id parameter' }, { status: 400 });
    }

    const { url: supabaseUrl, key } = getSupabaseConfig();
    const supabase = createClient(supabaseUrl, key, {
      global: auth.actor.token
        ? { headers: { Authorization: `Bearer ${auth.actor.token}` } }
        : undefined,
    });

    if (isList) {
      await supabase.from('task_lists').delete().eq('id', id).eq('user_id', auth.actor.uid);
    } else {
      await supabase.from('tasks').delete().eq('id', id).eq('user_id', auth.actor.uid);
    }

    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
