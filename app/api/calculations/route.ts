import { NextRequest, NextResponse } from 'next/server';
import { verifyOrDecodeToken } from '../../../lib/auth-helper';
import { saveUserCalculation, getUserCalculations, deleteUserCalculation } from '../../../lib/db/users';

export const dynamic = 'force-dynamic';

async function resolveUserId(req: NextRequest): Promise<{ uid: string; token?: string } | null> {
  const authHeader = req.headers.get('authorization');
  const customUserId = req.headers.get('x-user-id');
  let token: string | undefined = undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split('Bearer ')[1]?.trim();
    if (token) {
      const userToken = await verifyOrDecodeToken(token);
      if (userToken?.uid) {
        return { uid: userToken.uid, token };
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
    const authData = await resolveUserId(req);
    if (!authData?.uid) {
      return NextResponse.json({ error: 'Unauthorized: Missing user token or ID' }, { status: 401 });
    }

    const calculations = await getUserCalculations(authData.uid, authData.token);
    return NextResponse.json({ calculations: calculations || [] });
  } catch (error: any) {
    console.error('Error fetching calculations:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch calculations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authData = await resolveUserId(req);
    if (!authData?.uid) {
      return NextResponse.json({ error: 'Unauthorized: Missing user token or ID' }, { status: 401 });
    }

    const { type, details, result } = await req.json();
    if (!type || !details || !result) {
      return NextResponse.json({ error: 'Missing calculation fields' }, { status: 400 });
    }

    const saved = await saveUserCalculation(authData.uid, type, details, result, authData.token);
    return NextResponse.json({ success: true, calculation: saved });
  } catch (error: any) {
    console.error('Error saving calculation:', error);
    return NextResponse.json({ error: error?.message || 'Failed to save calculation' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authData = await resolveUserId(req);
    if (!authData?.uid) {
      return NextResponse.json({ error: 'Unauthorized: Missing user token or ID' }, { status: 401 });
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

    // Check if body is provided
    try {
      const body = await req.json();
      if (body) {
        if (body.id !== undefined) id = body.id;
        if (body.all !== undefined) deleteAll = !!body.all;
        if (body.details !== undefined) details = body.details;
        if (body.result !== undefined) result = body.result;
        if (body.type !== undefined) type = body.type;
      }
    } catch {
      // No JSON body, query params will be used
    }

    if (!deleteAll && !id && (!details || !result)) {
      return NextResponse.json({ error: 'Missing calculation identifier to delete' }, { status: 400 });
    }

    await deleteUserCalculation(authData.uid, id, details, result, type, deleteAll, authData.token);

    // Keep Supabase Auth user_metadata calculation_history in sync on the server
    try {
      const { getSupabaseConfig } = await import('../../../utils/supabase/config');
      const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
      if (supabaseUrl && supabaseKey) {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: authData.token ? { headers: { Authorization: `Bearer ${authData.token}` } } : undefined,
        });
        const { data: { user } } = await supabase.auth.getUser(authData.token);
        if (user && user.user_metadata?.calculation_history && Array.isArray(user.user_metadata.calculation_history)) {
          const currentMeta: any[] = user.user_metadata.calculation_history;
          const updatedMeta = deleteAll
            ? []
            : currentMeta.filter((item: any) => {
                const matchId = id && (item.id === id || item.dbId?.toString() === id?.toString());
                const matchContent = details && result && item.details === details && item.result === result;
                return !matchId && !matchContent;
              });

          await supabase.auth.updateUser({
            data: {
              calculation_history: updatedMeta,
            },
          });
        }
      }
    } catch (metaErr) {
      console.warn('Server note on updating user metadata calculation_history on delete:', metaErr);
    }

    return NextResponse.json({
      success: true,
      message: deleteAll ? 'All calculations deleted from database' : 'Calculation deleted from database',
    });
  } catch (error: any) {
    console.error('Error deleting calculation:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete calculation' }, { status: 500 });
  }
}


