'use client';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { type User as SupabaseUser } from '@supabase/supabase-js';
import { getAuthProviderInfo } from '@/lib/authProvider';

import {
  LogIn,
  LogOut,
  Database,
  CheckCircle2,
  X,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Mail,
  Lock,
  UserPlus,
  Eye,
  EyeOff,
  User,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Calculator,
  Download,
  Trash2,
} from 'lucide-react';

interface AuthHeaderProps {
  onUserChanged?: (user: SupabaseUser | null) => void;
  onSyncHistory?: () => void;
  onModalOpenChange?: (open: boolean) => void;
  onProfileTrigger?: () => void;
  onRequestSignOut?: () => void;
  requestedAuthTab?: 'signin' | 'update_password';
  signOutSignal?: number;
  compactProfile?: boolean;
  headless?: boolean;
  openSignal?: number;
  closeSignal?: number;
}

type AuthTab = 'google' | 'email_login' | 'email_signup' | 'demo' | 'forgot_password' | 'update_password';

export default function AuthHeader({
  onUserChanged,
  onSyncHistory,
  onModalOpenChange,
  onProfileTrigger,
  onRequestSignOut,
  requestedAuthTab = 'signin',
  signOutSignal = 0,
  compactProfile = false,
  headless = false,
  openSignal = 0,
  closeSignal = 0,
}: AuthHeaderProps) {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isFullPage, setIsFullPage] = useState(true);
  const [activeTab, setActiveTab] = useState<AuthTab>('google');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmEraseData, setConfirmEraseData] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [privacyNotice, setPrivacyNotice] = useState<string | null>(null);

  const supabase = createClient();
  const onUserChangedRef = useRef(onUserChanged);
  const onSyncHistoryRef = useRef(onSyncHistory);
  const syncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    onUserChangedRef.current = onUserChanged;
    onSyncHistoryRef.current = onSyncHistory;
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (openSignal > 0) {
      if (requestedAuthTab === 'update_password') {
        if (!user || getAuthProviderInfo(user).isEmailPassword) {
          setActiveTab('update_password');
        } else {
          setActiveTab('google');
        }
      } else if (!user) {
        setActiveTab('google');
      }
      setError(null);
      setSuccessMsg(null);
      setShowModal(true);
      setIsFullPage(true);
    }
  }, [openSignal, requestedAuthTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (closeSignal > 0) {
      setShowModal(false);
      setConfirmEraseData(false);
      setError(null);
    }
  }, [closeSignal]);

  const signOutFnRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    if (signOutSignal > 0) {
      signOutFnRef.current?.();
    }
  }, [signOutSignal]);

  useEffect(() => {
    onModalOpenChange?.(showModal);
    if (showModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showModal, onModalOpenChange]);

  useEffect(() => {
    let isMounted = true;

    // Detect if user landed on password recovery from email link
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      if (hash.includes('type=recovery') || search.includes('type=recovery')) {
        setActiveTab('update_password');
        setShowModal(true);
        setError(null);
      }
    }

    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session?.user) {
          setUser((prev) => (prev?.id === session.user.id ? prev : session.user));
          onUserChangedRef.current?.(session.user);
          if (syncedUserIdRef.current !== session.user.id) {
            syncedUserIdRef.current = session.user.id;
            syncUserToCloudSql(session.user);
          }
        } else if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('retail_calc_auth_user');
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              setUser((prev) => (prev?.id === parsed.id ? prev : parsed));
              onUserChangedRef.current?.(parsed);
            } catch {
              localStorage.removeItem('retail_calc_auth_user');
            }
          }
        }
      } catch (err) {
        console.warn('Session check warning:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;
        if (_event === 'PASSWORD_RECOVERY') {
          setActiveTab('update_password');
          setShowModal(true);
          setError(null);
          setSuccessMsg(null);
        }
        if (session?.user) {
          setUser((prev) => (prev?.id === session.user.id ? prev : session.user));
          onUserChangedRef.current?.(session.user);
          if (syncedUserIdRef.current !== session.user.id) {
            syncedUserIdRef.current = session.user.id;
            syncUserToCloudSql(session.user);
          }
        } else {
          if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('retail_calc_auth_user');
            if (stored) {
              try {
                const parsed = JSON.parse(stored);
                setUser((prev) => (prev?.id === parsed.id ? prev : parsed));
                onUserChangedRef.current?.(parsed);
                return;
              } catch {
                localStorage.removeItem('retail_calc_auth_user');
              }
            }
          }
          setUser(null);
          syncedUserIdRef.current = null;
          onUserChangedRef.current?.(null);
          setLoading(false);
        }
      }
    );

    const handleAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SUPABASE_AUTH_SUCCESS') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            setUser(session.user);
            setShowModal(false);
            setIsFullPage(false);
            if (syncedUserIdRef.current !== session.user.id) {
              syncedUserIdRef.current = session.user.id;
              syncUserToCloudSql(session.user);
            }
          }
        });
      }
    };

    const handleWindowFocus = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user && session.user.id !== syncedUserIdRef.current) {
          setUser(session.user);
          syncedUserIdRef.current = session.user.id;
          syncUserToCloudSql(session.user);
        }
      });
    };

    window.addEventListener('message', handleAuthMessage);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      window.removeEventListener('message', handleAuthMessage);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  const syncUserToCloudSql = async (supabaseUser: SupabaseUser) => {
    try {
      setSyncing(true);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (res.ok) {
        onSyncHistoryRef.current?.();
      } else {
        const errData = await res.json().catch(() => ({}));
        console.warn('Cloud SQL auth sync info:', errData);
      }
    } catch (err: any) {
      console.warn('Note on Cloud SQL auth sync:', err?.message || err);
    } finally {
      setSyncing(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setActionLoading(true);
      setError(null);
      const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
      const isMobile = typeof window !== 'undefined' && (
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768
      );
      
      if (isEmbedded) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
            skipBrowserRedirect: true,
            queryParams: {
              prompt: 'select_account',
            },
          },
        });
        if (error) throw error;
        if (data?.url) {
          // On mobile, never pass fixed desktop popup geometry 'width=500,height=650'
          const popup = isMobile
            ? window.open(data.url, '_blank')
            : window.open(data.url, 'google_login_window', 'width=500,height=650,menubar=no,status=no');
          if (!popup) {
            setError('Browser blocked popup window. Please allow popups or use Email / 1-Click Demo.');
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
            queryParams: {
              prompt: 'select_account',
            },
          },
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in with Google. Please use Email.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    try {
      setActionLoading(true);
      setError(null);
      setSuccessMsg(null);
      setResetSent(false);
      const cleanEmail = email.trim();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (!error && data?.user) {
        fetch('/api/auth/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'signin',
            email: cleanEmail,
            password,
            displayName: data.user.user_metadata?.full_name,
            supabaseUid: data.user.id,
            supabaseAccessToken: data.session?.access_token,
            forceSync: true,
          }),
        }).catch(() => {});

        if (typeof window !== 'undefined') {
          localStorage.setItem('retail_calc_auth_user', JSON.stringify(data.user));
        }
        setUser(data.user);
        setShowModal(false);
        setIsFullPage(false);
        if (onUserChanged) onUserChanged(data.user);
        await syncUserToCloudSql(data.user);
        return;
      }

      // Fallback to backend email auth store (handles accounts with pending email confirmation or reset passwords)
      const fallbackRes = await fetch('/api/auth/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'signin',
          email: cleanEmail,
          password,
        }),
      });
      const fallbackData = await fallbackRes.json().catch(() => ({}));

      if (fallbackRes.ok && fallbackData?.success && fallbackData?.user) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('retail_calc_auth_user', JSON.stringify(fallbackData.user));
        }
        setUser(fallbackData.user);
        setShowModal(false);
        setIsFullPage(false);
        if (onUserChanged) onUserChanged(fallbackData.user);
        onSyncHistoryRef.current?.();
        return;
      }

      setError(fallbackData?.error || error?.message || 'Invalid email or password.');
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide an email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    try {
      setActionLoading(true);
      setError(null);
      setSuccessMsg(null);
      setResetSent(false);
      const cleanEmail = email.trim();
      const cleanName = displayName.trim() || cleanEmail.split('@')[0] || 'Store Retailer';

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
          },
        },
      });

      const isAlreadyRegistered =
        (error &&
          (error.message.toLowerCase().includes('already registered') ||
            error.message.toLowerCase().includes('already exists'))) ||
        (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);

      if (isAlreadyRegistered) {
        // 1. Try signing in directly with Supabase in case password matches
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (!signInErr && signInData?.user) {
          fetch('/api/auth/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'signup',
              email: cleanEmail,
              password,
              displayName: cleanName,
              supabaseUid: signInData.user.id,
              supabaseAccessToken: signInData.session?.access_token,
              forceSync: true,
            }),
          }).catch(() => {});

          if (typeof window !== 'undefined') {
            localStorage.setItem('retail_calc_auth_user', JSON.stringify(signInData.user));
          }
          setUser(signInData.user);
          setShowModal(false);
          setIsFullPage(false);
          if (onUserChanged) onUserChanged(signInData.user);
          await syncUserToCloudSql(signInData.user);
          return;
        }

        // 2. Check / initialize via backend email auth store
        const fallbackRes = await fetch('/api/auth/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'signup',
            email: cleanEmail,
            password,
            displayName: cleanName,
            supabaseUid: data?.user?.id,
          }),
        });
        const fallbackData = await fallbackRes.json().catch(() => ({}));

        if (fallbackRes.ok && fallbackData?.success && fallbackData?.user) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('retail_calc_auth_user', JSON.stringify(fallbackData.user));
          }
          setUser(fallbackData.user);
          setShowModal(false);
          setIsFullPage(false);
          if (onUserChanged) onUserChanged(fallbackData.user);
          onSyncHistoryRef.current?.();
          return;
        }

        setError(
          fallbackData?.error ||
            'An account with this email already exists. Please sign in with your password.'
        );
        setActiveTab('email_login');
        return;
      }

      if (error) {
        // Fallback to backend email registration if Supabase email rate-limit or config error occurs
        const fallbackRes = await fetch('/api/auth/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'signup',
            email: cleanEmail,
            password,
            displayName: cleanName,
          }),
        });
        const fallbackData = await fallbackRes.json().catch(() => ({}));
        if (fallbackRes.ok && fallbackData?.success && fallbackData?.user) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('retail_calc_auth_user', JSON.stringify(fallbackData.user));
          }
          setUser(fallbackData.user);
          setShowModal(false);
          setIsFullPage(false);
          if (onUserChanged) onUserChanged(fallbackData.user);
          onSyncHistoryRef.current?.();
          return;
        }
        setError(fallbackData?.error || error.message || 'Could not create account with this email.');
        return;
      }

      // Sync new account credentials to backend store
      const syncRes = await fetch('/api/auth/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'signup',
          email: cleanEmail,
          password,
          displayName: cleanName,
          supabaseUid: data?.user?.id,
          supabaseAccessToken: data?.session?.access_token,
          forceSync: true,
        }),
      }).catch(() => null);
      const syncData = syncRes ? await syncRes.json().catch(() => ({})) : {};

      if (data?.session && data?.user) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('retail_calc_auth_user', JSON.stringify(data.user));
        }
        setUser(data.user);
        setShowModal(false);
        setIsFullPage(false);
        if (onUserChanged) onUserChanged(data.user);
        await syncUserToCloudSql(data.user);
      } else {
        const activeUser = data?.user || syncData?.user;
        if (activeUser) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('retail_calc_auth_user', JSON.stringify(activeUser));
          }
          setUser(activeUser);
          setShowModal(false);
          setIsFullPage(false);
          if (onUserChanged) onUserChanged(activeUser);
          onSyncHistoryRef.current?.();
        } else {
          setSuccessMsg('Account created successfully! You can now sign in.');
          setError(null);
          setResetSent(false);
          setActiveTab('email_login');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Could not create account with this email.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDemoSignIn = async () => {
    try {
      setActionLoading(true);
      setError(null);
      const demoUser: any = {
        id: 'demo-user-pro',
        email: 'retailer.pro@retailcalc.pro',
        user_metadata: { full_name: 'Alex Rivera (Demo Store)' },
        is_anonymous: false,
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('retail_calc_auth_user', JSON.stringify(demoUser));
      }
      setUser(demoUser);
      setShowModal(false);
      setIsFullPage(false);
      if (onUserChanged) onUserChanged(demoUser);
    } catch (err: any) {
      console.warn('Demo sign in warning:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePasswordReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !email.trim()) {
      setError('Please enter your email address to receive a password reset link.');
      return;
    }
    try {
      setActionLoading(true);
      setError(null);
      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to send password reset email.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.trim()) {
      setError('Please enter your account email address first.');
      return;
    }
    if (!otpCode || !otpCode.trim()) {
      setError('Please enter the 6-digit code or token from your email.');
      return;
    }
    try {
      setActionLoading(true);
      setError(null);
      const cleanToken = otpCode.trim();

      let tokenToVerify = cleanToken;
      if (cleanToken.includes('token=')) {
        const match = cleanToken.match(/token=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) tokenToVerify = match[1];
      }

      const { data, error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: tokenToVerify,
        type: 'recovery',
      });

      if (otpError) {
        const { error: emailError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: tokenToVerify,
          type: 'email',
        });
        if (emailError) throw otpError;
      }

      setActiveTab('update_password');
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired code. Please check your email and try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }
    try {
      setActionLoading(true);
      setError(null);

      let updateOk = false;
      let updateErrMsg = '';

      // 1. Try Supabase Auth updateUser
      try {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (!error) {
          updateOk = true;
        } else {
          console.warn('Supabase updateUser warning:', error.message);
          updateErrMsg = error.message;
        }
      } catch (authErr: any) {
        console.warn('Supabase auth update notice:', authErr);
        updateErrMsg = authErr?.message || '';
      }

      // 2. Call backend /api/auth/reset-password API as fallback / sync
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const currentEmail = email?.trim() || user?.email || session?.user?.email;

        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            newPassword,
            confirmPassword,
            token,
            email: currentEmail,
            uid: user?.id || session?.user?.id,
          }),
        });

        if (res.ok) {
          updateOk = true;
        } else if (!updateOk) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || updateErrMsg || 'Failed to update password.');
        }
      } catch (backendErr: any) {
        if (!updateOk) {
          throw backendErr;
        }
      }

      if (!updateOk) {
        throw new Error(updateErrMsg || 'Failed to update password. Link may have expired.');
      }

      setSuccessMsg('Your password has been changed successfully!');
      setPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setResetSent(false);
      if (user) {
        setActiveTab('google');
      } else {
        setActiveTab('email_login');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update password. Link may have expired.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setShowSignOutConfirm(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('retail_calc_auth_user');
      }
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      await supabase.auth.signOut().catch(() => {});
      setUser(null);
      setShowModal(false);
      setIsFullPage(false);
      setConfirmEraseData(false);
      setPrivacyNotice(null);
      if (onUserChanged) onUserChanged(null);
    } catch (err: any) {
      console.warn('Sign out warning:', err);
    }
  };

  signOutFnRef.current = handleSignOut;

  const triggerSignOutFlow = () => {
    if (onRequestSignOut) {
      onRequestSignOut();
    } else {
      setShowSignOutConfirm(true);
    }
  };

  const handleExportMyData = async () => {
    try {
      setActionLoading(true);
      setPrivacyNotice(null);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/privacy', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (!res.ok) {
        setPrivacyNotice('Unable to export cloud archive right now.');
        return;
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `calculator-max-privacy-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setPrivacyNotice('Encrypted privacy data archive exported.');
    } catch {
      setPrivacyNotice('Export failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEraseMyData = async () => {
    try {
      setActionLoading(true);
      setPrivacyNotice(null);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/privacy', {
        method: 'DELETE',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      if (res.ok) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('retail_calc_auth_user');
          if (user?.id) {
            localStorage.removeItem(`retail-calc-history-${user.id}`);
          }
        }
        await supabase.auth.signOut().catch(() => {});
        setUser(null);
        setConfirmEraseData(false);
        setShowModal(false);
        setIsFullPage(false);
        if (onUserChanged) onUserChanged(null);
      } else {
        setPrivacyNotice('Could not complete cloud erasure.');
      }
    } catch {
      setPrivacyNotice('Erasure request failed.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !compactProfile && !headless) {
    return (
      <div className="flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/30 text-white/80 text-xs">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span className="hidden sm:inline">Checking auth...</span>
      </div>
    );
  }

  return (
    <>
      {headless ? null : compactProfile ? (
        <button
          type="button"
          onClick={() => {
            if (onProfileTrigger) {
              onProfileTrigger();
            } else {
              setShowModal(true);
              setIsFullPage(true);
            }
          }}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-slate-100/80 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Open Profile & Account Settings"
          title={user ? `Profile: ${user.user_metadata?.full_name || user.email}` : 'Profile & Sign In'}
        >
          {user ? (
            user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt={user.user_metadata?.full_name || 'Profile'}
                className="w-9 h-9 rounded-full border border-slate-200 object-cover shadow-xs"
              />
            ) : (
              <span className="w-9 h-9 rounded-full bg-slate-900 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                {((user.user_metadata?.full_name || user.email || 'U')[0] || 'U').toUpperCase()}
              </span>
            )
          ) : (
            <span className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <User className="w-4.5 h-4.5" />
            </span>
          )}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/30 hover:bg-white/30 transition-all">
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 text-left focus:outline-none cursor-pointer"
              >
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt={user.user_metadata?.full_name || 'User'}
                    className="w-6 h-6 rounded-full border border-white/50 object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
                    {((user.user_metadata?.full_name || user.email || (user.is_anonymous ? 'Guest' : 'User'))[0] || 'U').toUpperCase()}
                  </div>
                )}
                <div className="hidden md:flex flex-col min-w-0">
                  <span className="text-xs font-extrabold text-white truncate max-w-[100px]">
                    {user.user_metadata?.full_name || (user.is_anonymous ? 'Guest User' : user.email?.split('@')[0])}
                  </span>
                  <span className="text-[9px] text-emerald-200 flex items-center gap-0.5">
                    <Database className="w-2.5 h-2.5" /> Cloud Synced
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={triggerSignOutFlow}
                className="p-1 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors ml-1 cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowModal(true);
                  setIsFullPage(true);
                }}
                className="flex items-center gap-1.5 bg-white text-blue-600 hover:bg-blue-50 px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl font-bold text-xs sm:text-sm shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Full-Page Login Overlay - Portalled directly to document.body */}
      {mounted && showModal && createPortal(
        <div
          id="auth-modal-portal-backdrop"
          className="fixed inset-0 z-[9999] bg-white w-full h-[100dvh] min-h-[100dvh] overflow-y-auto overscroll-y-contain flex flex-col"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white w-full min-h-[100dvh] flex flex-col md:flex-row flex-1"
          >
            {/* Mobile Top Header Bar */}
            <div className="flex md:hidden items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-white sticky top-0 z-30 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-xs">
                  <Calculator className="w-4 h-4" />
                </div>
                <span className="font-extrabold text-base text-slate-800">
                  Calculator <span className="text-blue-600">Max</span>
                </span>
              </div>
            </div>

            {/* Prominent Bottom-Right Back to Calculator Button */}
            <button
              type="button"
              onClick={() => {
                setShowModal(false);
              }}
              className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 sm:px-6 sm:py-4 min-h-[48px] bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold text-sm sm:text-base rounded-2xl shadow-[0_10px_28px_rgba(37,99,235,0.38)] border border-blue-400/30 transition-all cursor-pointer"
              title="Close and return to Calculator"
            >
              <ArrowLeft className="w-5 h-5 shrink-0" />
              <span>Back to Calculator</span>
            </button>

            {/* Left Branding Container */}
            <div className="hidden md:flex md:w-5/12 lg:w-1/2 min-h-[100dvh] bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 p-10 lg:p-14 flex-col justify-between text-white relative shrink-0">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
              <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/30 shadow-lg">
                    <Calculator className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight text-white leading-tight">
                      Calculator <span className="text-blue-300">Max</span>
                    </h2>
                    <p className="text-blue-200/80 text-xs font-semibold uppercase tracking-widest">
                      Pro Workspace
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-8">
                  <h3 className="text-3xl lg:text-4xl font-black leading-tight tracking-tight">
                    Secure your <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-emerald-200">
                      financial data.
                    </span>
                  </h3>
                  <p className="text-sm text-blue-100/90 leading-relaxed max-w-sm">
                    Log in to synchronize your EMI calculations, Wishlist goals, and discount histories directly to secure cloud storage.
                  </p>
                </div>
              </div>

              <div className="relative z-10 mt-12 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center gap-3 mb-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-300" />
                  <h4 className="font-bold text-sm">Enterprise Security</h4>
                </div>
                <p className="text-xs text-blue-100/80 leading-relaxed">
                  Your sessions and calculations are protected and stored securely with encrypted cloud authentication and database persistence.
                </p>
              </div>
            </div>

            {/* Right Form Container */}
            <div className="w-full md:w-7/12 lg:w-1/2 min-h-[calc(100dvh-57px)] md:min-h-[100dvh] p-6 pb-24 sm:p-10 sm:pb-24 md:p-14 md:pb-24 flex flex-col justify-center overflow-y-auto">
              {user && activeTab !== 'update_password' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-2 border border-emerald-200">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold text-slate-800">
                      Welcome back, {user.user_metadata?.full_name || 'User'}!
                    </h3>
                    <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
                      Your session is authenticated and securely connected.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                      }}
                      className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Return to Application</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    {getAuthProviderInfo(user).isEmailPassword && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('update_password');
                          setError(null);
                          setSuccessMsg(null);
                        }}
                        className="px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl border border-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <KeyRound className="w-4 h-4" />
                        <span>Change Password</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={triggerSignOutFlow}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 font-bold rounded-xl border border-slate-200 hover:border-rose-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>

                  {/* Privacy, Encryption & Compliance Controls */}
                  <div className="w-full max-w-md bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-3 mt-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Security & Data Privacy</span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                        AES-256-GCM + TLS
                      </span>
                    </div>

                    {privacyNotice && (
                      <p className="text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                        {privacyNotice}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleExportMyData}
                        disabled={actionLoading}
                        className="flex-1 min-w-[140px] py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export My Data</span>
                      </button>

                      {!confirmEraseData ? (
                        <button
                          type="button"
                          onClick={() => setConfirmEraseData(true)}
                          disabled={actionLoading}
                          className="flex-1 min-w-[140px] py-2 px-3 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Erase Cloud Data</span>
                        </button>
                      ) : (
                        <div className="w-full flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleEraseMyData}
                            disabled={actionLoading}
                            className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                          >
                            Confirm Permanent Erase
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmEraseData(false)}
                            disabled={actionLoading}
                            className="py-2 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {syncing && (
                    <div className="flex items-center justify-center gap-2 text-xs font-semibold text-blue-600 bg-blue-50 px-4 py-2 rounded-full animate-pulse mt-4">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Syncing your data...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 max-w-md w-full mx-auto flex flex-col justify-center relative">
                  <div className="mb-6 text-center md:text-left">
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                      {activeTab === 'forgot_password'
                        ? 'Reset Password'
                        : activeTab === 'update_password'
                        ? 'Set New Password'
                        : activeTab === 'email_signup'
                        ? 'Create Account'
                        : 'Sign In'}
                    </h3>
                    <p className="text-sm text-slate-500 mt-2">
                      {activeTab === 'forgot_password'
                        ? 'Enter your account email to receive a password reset link.'
                        : activeTab === 'update_password'
                        ? 'Enter and confirm your new account password below.'
                        : activeTab === 'email_signup'
                        ? 'Register a new account to sync your workspace.'
                        : 'Access your synced workspace.'}
                    </p>
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-2.5 mb-6 text-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span className="font-medium leading-relaxed">{error}</span>
                    </div>
                  )}

                  {successMsg && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-start gap-2.5 mb-6 text-sm">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      <span className="font-medium leading-relaxed">{successMsg}</span>
                    </div>
                  )}

                  {activeTab !== 'forgot_password' && activeTab !== 'update_password' && (
                    <div className="flex flex-wrap gap-2 mb-8 bg-slate-100 p-1 rounded-2xl">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('google');
                          setError(null);
                          setSuccessMsg(null);
                          setResetSent(false);
                        }}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'google' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Google
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('email_login');
                          setError(null);
                          setSuccessMsg(null);
                          setResetSent(false);
                        }}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'email_login' || activeTab === 'email_signup' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Email
                      </button>
                    </div>
                  )}

                  {/* Tab 1: Google OAuth */}
                  {activeTab === 'google' && (
                    <div className="space-y-4 pt-1">
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={actionLoading}
                        className="w-full py-3.5 px-4 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-2xl shadow-sm transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
                      >
                        {actionLoading ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            <span>Continue with Google</span>
                          </>
                        )}
                      </button>
                      <p className="text-center text-xs text-slate-500 font-medium pt-2">
                        Fastest method. No password required.
                      </p>
                    </div>
                  )}

                  {/* Tab 2: Email Authentication */}
                  {(activeTab === 'email_login' || activeTab === 'email_signup') && (
                    <form onSubmit={activeTab === 'email_login' ? handleEmailSignIn : handleEmailSignUp} className="space-y-4">
                      {activeTab === 'email_signup' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Full Name <span className="text-slate-400 font-normal">(Optional)</span>
                          </label>
                          <div className="relative">
                            <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              value={displayName}
                              onChange={(e) => setDisplayName(e.target.value)}
                              placeholder="Enter full name"
                              className="w-full bg-white text-slate-900 font-medium placeholder:text-slate-400 border border-slate-300 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all shadow-xs"
                            />
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Email Address
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            className="w-full bg-white text-slate-900 font-medium placeholder:text-slate-400 border border-slate-300 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all shadow-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Password
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-white text-slate-900 font-medium placeholder:text-slate-400 border border-slate-300 rounded-xl py-2.5 pl-10 pr-10 text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all shadow-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {activeTab === 'email_login' && (
                          <div className="flex justify-end mt-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('forgot_password');
                                setError(null);
                                setResetSent(false);
                              }}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer transition-colors"
                            >
                              Forgot Password?
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                      >
                        {actionLoading ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : activeTab === 'email_login' ? (
                          <>
                            <LogIn className="w-4 h-4" />
                            <span>Sign In with Email</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4" />
                            <span>Create Account</span>
                          </>
                        )}
                      </button>
                      <div className="text-center pt-2">
                        {activeTab === 'email_login' ? (
                          <p className="text-xs text-slate-500">
                            Don&apos;t have an account?{' '}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('email_signup');
                                setError(null);
                                setSuccessMsg(null);
                                setResetSent(false);
                              }}
                              className="font-bold text-blue-600 hover:underline cursor-pointer"
                            >
                              Register here
                            </button>
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500">
                            Already have an account?{' '}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('email_login');
                                setError(null);
                                setSuccessMsg(null);
                                setResetSent(false);
                              }}
                              className="font-bold text-blue-600 hover:underline cursor-pointer"
                            >
                              Sign in here
                            </button>
                          </p>
                        )}
                      </div>
                    </form>
                  )}

                  {/* Tab: Forgot Password Prompt UI */}
                  {activeTab === 'forgot_password' && (
                    <div className="space-y-4">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('email_login');
                          setError(null);
                          setResetSent(false);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 mb-2 transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back to Sign In</span>
                      </button>

                      {resetSent ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center space-y-3">
                          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                          <h4 className="font-bold text-emerald-900 text-base">Reset Link Sent</h4>
                          <p className="text-xs text-emerald-700 max-w-xs mx-auto leading-relaxed">
                            We sent a password reset link to <strong className="font-semibold">{email}</strong>. Please check your inbox and click the link to reset your password.
                          </p>
                          <div className="pt-2 flex flex-col sm:flex-row gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('email_login');
                                setResetSent(false);
                              }}
                              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
                            >
                              Return to Sign In
                            </button>
                            <button
                              type="button"
                              onClick={handlePasswordReset}
                              disabled={actionLoading}
                              className="py-2.5 px-4 bg-white border border-emerald-300 text-emerald-800 font-semibold text-xs rounded-xl hover:bg-emerald-50 transition-all cursor-pointer disabled:opacity-50"
                            >
                              {actionLoading ? 'Sending...' : 'Resend Link'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <form onSubmit={handlePasswordReset} className="space-y-4">
                          <div className="bg-blue-50/80 border border-blue-100 rounded-2xl p-4 flex items-start gap-3 text-xs text-blue-800">
                            <KeyRound className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                            <p className="leading-relaxed">
                              Enter the email address registered with your account. We will send you a secure link to reset your password.
                            </p>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Account Email Address
                            </label>
                            <div className="relative">
                              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                              <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
                                className="w-full bg-white text-slate-900 font-medium placeholder:text-slate-400 border border-slate-300 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all shadow-xs"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={actionLoading}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                          >
                            {actionLoading ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Mail className="w-4 h-4" />
                                <span>Send Reset Link</span>
                              </>
                            )}
                          </button>

                          <div className="text-center pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('email_login');
                                setError(null);
                              }}
                              className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                            >
                              Remember your password? Back to Sign In
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}

                  {/* Tab: Update Password */}
                  {activeTab === 'update_password' && (
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-emerald-800">
                        <KeyRound className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                        <p className="leading-relaxed">
                          Code verified! Please enter your new password below.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          New Password (minimum 6 characters)
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-white text-slate-900 font-medium placeholder:text-slate-400 border border-slate-300 rounded-xl py-2.5 pl-10 pr-10 text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all shadow-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-white text-slate-900 font-medium placeholder:text-slate-400 border border-slate-300 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all shadow-xs"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                      >
                        {actionLoading ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Save New Password</span>
                          </>
                        )}
                      </button>

                      {!user && (
                        <div className="text-center pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('email_login');
                              setError(null);
                            }}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                          >
                            Cancel and back to Sign In
                          </button>
                        </div>
                      )}
                    </form>
                  )}

                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 text-left text-[11px] text-slate-500 space-y-1 mt-4">
                    <div className="flex items-center gap-1.5 font-bold text-slate-700">
                      <Database className="w-3.5 h-3.5 text-blue-600" />
                      <span>Cloud Sync Features:</span>
                    </div>
                    <p>• Saves loan EMI calculations & history</p>
                    <p>• Backup Wishlist savings goals and targets</p>
                    <p>• Cross-device calculation history persistence</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Standalone Fallback Sign-Out Confirmation Popup */}
      {mounted && showSignOutConfirm && !onRequestSignOut && createPortal(
        <div
          className="fixed inset-0 z-[100001] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setShowSignOutConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Sign Out of Calculator Max?</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Your local data remains on this device. Cloud synchronization will pause until you sign in again.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
