/**
 * Utility to reliably extract and validate Supabase configuration.
 * Handles cases where NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * might be swapped, empty, or misconfigured in the environment.
 */
export function getSupabaseConfig(): { url: string; key: string } {
  const envUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();

  const envKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY ||
    ''
  ).trim();

  const defaultUrl = 'https://ouzymmnemjkzogggkqul.supabase.co';
  const defaultKey = 'sb_publishable_ufDuKzAuvNSq_AzkGUuIFg_wp_J2dc2';

  let resolvedUrl = defaultUrl;
  let resolvedKey = defaultKey;

  const isUrl = (val: string): boolean => {
    try {
      if (!val) return false;
      const u = new URL(val);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  if (isUrl(envUrl)) {
    resolvedUrl = envUrl;
  } else if (isUrl(envKey)) {
    resolvedUrl = envKey;
  }

  if (envKey && !isUrl(envKey)) {
    resolvedKey = envKey;
  } else if (envUrl && !isUrl(envUrl)) {
    resolvedKey = envUrl;
  }

  return { url: resolvedUrl, key: resolvedKey };
}
