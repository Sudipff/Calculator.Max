import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? (type === 'recovery' ? '/reset-password' : '/');

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    } catch (err) {
      console.error('Auth callback code exchange error:', err);
    }
  }

  // If recovery flow is identified
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  // Default redirect to home
  return NextResponse.redirect(`${origin}/`);
}
