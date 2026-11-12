import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/utils/supabase/config";

export interface DecodedUserToken {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function verifyOrDecodeToken(token: string): Promise<DecodedUserToken | null> {
  if (!token) return null;

  try {
    const { url, key } = getSupabaseConfig();

    if (url && key) {
      const cookieStore = await cookies();
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {}
        }
      });
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        return {
          uid: user.id,
          email: user.email || '',
          name: user.user_metadata?.full_name || '',
          picture: user.user_metadata?.avatar_url || '',
        };
      }
    }
  } catch (err) {
    console.error('Supabase get user failed:', err);
  }

  // Fallback JWT payload parsing
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
      const payload = JSON.parse(payloadJson);
      
      const uid = payload.sub; // Supabase uses sub
      if (uid) {
        return {
          uid,
          email: payload.email || '',
          name: payload.user_metadata?.full_name || '',
          picture: payload.user_metadata?.avatar_url || '',
        };
      }
    }
  } catch (err) {
    console.error('Failed to parse JWT payload:', err);
  }

  return null;
}
