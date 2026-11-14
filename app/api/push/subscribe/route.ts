import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { checkRateLimit, requireAuth } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'api/push/subscribe');
    if (!auth.ok) return auth.response;

    const rate = checkRateLimit(`push:sub:${auth.actor.uid}`, 30, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
    const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh.trim() : '';
    const authSecret = typeof body?.keys?.auth === 'string' ? body.keys.auth.trim() : '';

    if (!endpoint || !p256dh || !authSecret || endpoint.length > 2000) {
      return NextResponse.json({ error: 'Invalid push subscription payload.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: auth.actor.uid,
        endpoint,
        p256dh,
        auth: authSecret,
        user_agent: (req.headers.get('user-agent') || '').slice(0, 255),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' }
    );

    if (error) {
      return NextResponse.json(
        {
          stored: false,
          reason: error.code === '42P01' || error.code === 'PGRST205' ? 'table_pending_migration' : error.message,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ stored: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to save push subscription' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'api/push/subscribe');
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
    if (!endpoint) {
      return NextResponse.json({ error: 'Missing subscription endpoint.' }, { status: 400 });
    }

    const supabase = await createClient();
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', auth.actor.uid)
      .eq('endpoint', endpoint);

    return NextResponse.json({ removed: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to remove push subscription' },
      { status: 500 }
    );
  }
}
