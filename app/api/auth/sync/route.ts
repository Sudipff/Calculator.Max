import { NextRequest, NextResponse } from 'next/server';
import { verifyOrDecodeToken } from '../../../../lib/auth-helper';
import { getOrCreateUser } from '../../../../lib/db/users';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const userToken = await verifyOrDecodeToken(token);

    if (!userToken) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const { uid, email, name, picture } = userToken;

    const userRecord = await getOrCreateUser(
      uid,
      email || '',
      name || '',
      picture || ''
    );

    return NextResponse.json({ success: true, user: userRecord });
  } catch (error: any) {
    console.error('Error in /api/auth/sync route:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to authenticate user.' },
      { status: 500 }
    );
  }
}

