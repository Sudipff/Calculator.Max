export interface AuthProviderInfo {
  isAuthenticated: boolean;
  isDemo: boolean;
  isGoogle: boolean;
  isEmailPassword: boolean;
}

/**
 * Inspects an authenticated user payload (from Supabase Auth, the backend
 * email auth store, or demo mode) to determine the active authentication method.
 */
export function getAuthProviderInfo(user: any): AuthProviderInfo {
  if (!user || typeof user !== 'object') {
    return {
      isAuthenticated: false,
      isDemo: false,
      isGoogle: false,
      isEmailPassword: false,
    };
  }

  if (user.id === 'demo-user-pro') {
    return {
      isAuthenticated: true,
      isDemo: true,
      isGoogle: false,
      isEmailPassword: false,
    };
  }

  const primaryProvider =
    typeof user.app_metadata?.provider === 'string'
      ? user.app_metadata.provider.trim().toLowerCase()
      : '';

  const providers: string[] = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers
        .map((p: unknown) => String(p ?? '').trim().toLowerCase())
        .filter(Boolean)
    : [];

  const identityProviders: string[] = Array.isArray(user.identities)
    ? user.identities
        .map((id: any) => String(id?.provider ?? '').trim().toLowerCase())
        .filter(Boolean)
    : [];

  const allProviders = new Set<string>([
    ...(primaryProvider ? [primaryProvider] : []),
    ...providers,
    ...identityProviders,
  ]);

  const metadataIss =
    typeof user.user_metadata?.iss === 'string'
      ? user.user_metadata.iss.trim().toLowerCase()
      : '';

  const isGoogle =
    primaryProvider === 'google' ||
    allProviders.has('google') ||
    metadataIss.includes('accounts.google.com');

  const hasEmailProvider =
    primaryProvider === 'email' || allProviders.has('email');

  const isEmailPassword = hasEmailProvider && !isGoogle;

  return {
    isAuthenticated: true,
    isDemo: false,
    isGoogle,
    isEmailPassword,
  };
}

export function isEmailPasswordAuthenticated(user: any): boolean {
  return getAuthProviderInfo(user).isEmailPassword;
}
