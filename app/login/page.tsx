'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calculator,
  Mail,
  Lock,
  User,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  ArrowRight,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

type AuthTab = 'google' | 'email_login' | 'email_signup' | 'demo' | 'forgot_password' | 'update_password';

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AuthTab>('email_login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  const supabase = React.useMemo(() => createClient(), []);

  useEffect(() => {
    // Check if user came from a password recovery link
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      if (hash.includes('type=recovery') || search.includes('type=recovery')) {
        router.push('/reset-password' + (hash || search));
        return;
      }
    }

    // Check Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUser(session.user);
      } else if (typeof window !== 'undefined') {
        const local = localStorage.getItem('retail_calc_auth_user');
        if (local) {
          try {
            setCurrentUser(JSON.parse(local));
          } catch {
            localStorage.removeItem('retail_calc_auth_user');
          }
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        setActiveTab('update_password');
      }
      if (session?.user) {
        setCurrentUser(session.user);
      }
    });

    const handleAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SUPABASE_AUTH_SUCCESS') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            setCurrentUser(session.user);
          }
        });
      }
    };

    const handleWindowFocus = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setCurrentUser(session.user);
        }
      });
    };

    window.addEventListener('message', handleAuthMessage);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handleAuthMessage);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [supabase]);

  const handleSignOut = async () => {
    try {
      setLoading(true);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('retail_calc_auth_user');
      }
      await supabase.auth.signOut().catch(() => {});
      setCurrentUser(null);
      setSuccessMsg('Signed out successfully.');
    } catch (err: any) {
      console.warn('Sign out warning:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
      const isMobile = typeof window !== 'undefined' && (
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768
      );

      if (isInIframe) {
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
          // On mobile, avoid fixed desktop geometry 'width=500,height=650' which triggers Desktop Site mode
          const popup = isMobile
            ? window.open(data.url, '_blank')
            : window.open(data.url, 'google_login_popup', 'width=500,height=650,menubar=no,status=no');
          if (!popup) {
            setError('Popup blocked by browser. Please allow popups or use 1-Click Demo / Email.');
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
      setError(err?.message || 'Google sign-in could not be completed. Try 1-Click Demo.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide your email and password.');
      return;
    }
    try {
      setLoading(true);
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
        router.push('/');
        return;
      }

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
        setCurrentUser(fallbackData.user);
        router.push('/');
        return;
      }

      setError(fallbackData?.error || error?.message || 'Invalid email or password.');
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
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
      setLoading(true);
      setError(null);
      setSuccessMsg(null);
      setResetSent(false);
      const cleanEmail = email.trim();
      const cleanName = displayName.trim() || cleanEmail.split('@')[0] || 'Store Retailer';

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { full_name: cleanName },
        },
      });

      const isAlreadyRegistered =
        (error &&
          (error.message.toLowerCase().includes('already registered') ||
            error.message.toLowerCase().includes('already exists'))) ||
        (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);

      if (isAlreadyRegistered) {
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
          router.push('/');
          return;
        }

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
          setCurrentUser(fallbackData.user);
          router.push('/');
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
          setCurrentUser(fallbackData.user);
          router.push('/');
          return;
        }
        setError(fallbackData?.error || error.message || 'Unable to register.');
        return;
      }

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
        router.push('/');
      } else {
        const activeUser = data?.user || syncData?.user;
        if (activeUser) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('retail_calc_auth_user', JSON.stringify(activeUser));
          }
          setCurrentUser(activeUser);
          router.push('/');
        } else {
          setSuccessMsg('Account created successfully! You can now sign in.');
          setResetSent(false);
          setActiveTab('email_login');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to register.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !email.trim()) {
      setError('Please enter your email address to receive a password reset link.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });
      if (error) throw error;
      setResetSent(true);
      setSuccessMsg(`Password reset email sent to ${email.trim()}! Please check your inbox.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
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
      setLoading(true);
      setError(null);
      const cleanToken = otpCode.trim();

      // If user pasted a full URL, extract token or access_token
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
        // Attempt 'email' type fallback
        const { error: emailError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: tokenToVerify,
          type: 'email',
        });
        if (emailError) throw otpError;
      }

      setSuccessMsg('Email code verified! Please set your new password below.');
      setActiveTab('update_password');
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired code. Please check your email and try again.');
    } finally {
      setLoading(false);
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
      setLoading(true);
      setError(null);

      let updateOk = false;
      let updateErrMsg = '';

      // 1. Try Supabase updateUser
      try {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (!error) {
          updateOk = true;
        } else {
          console.warn('Supabase client updateUser warning:', error.message);
          updateErrMsg = error.message;
        }
      } catch (authErr: any) {
        console.warn('Supabase auth update notice:', authErr);
        updateErrMsg = authErr?.message || '';
      }

      // 2. Call backend /api/auth/reset-password API
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const currentEmail = email?.trim() || currentUser?.email || session?.user?.email;

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
            uid: currentUser?.id || session?.user?.id,
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

      setSuccessMsg('Your password has been successfully updated!');
      setPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      if (currentUser) {
        setActiveTab('google');
      } else {
        setActiveTab('email_login');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update password. Link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      const demoUser = {
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
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-white flex flex-col overflow-y-auto overscroll-y-contain">
      <div className="w-full min-h-[100dvh] bg-white flex flex-col md:flex-row relative flex-1">
        {/* Mobile Top Bar */}
        <div className="flex md:hidden items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-white sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-xs">
              <Calculator className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-base text-slate-800">Retail<span className="text-blue-600">Calc</span></span>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-full transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Calculator</span>
          </Link>
        </div>

        {/* Desktop Back to App Link */}
        <Link
          href="/"
          className="hidden md:flex absolute top-6 right-6 z-20 items-center gap-1.5 px-3.5 py-2 bg-slate-100/90 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-full transition-all cursor-pointer backdrop-blur-xs shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Calculator</span>
        </Link>

        {/* Left Hero Container */}
        <div className="hidden md:flex md:w-5/12 lg:w-1/2 min-h-[100dvh] bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 p-10 lg:p-14 flex-col justify-between text-white relative shrink-0 overflow-y-auto">
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/30 shadow-lg">
                <Calculator className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-white leading-tight">
                  Retail<span className="text-blue-300">Calc</span>
                </h2>
                <p className="text-blue-200/80 text-xs font-semibold uppercase tracking-widest">
                  Pro Workspace
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/30 flex items-center justify-center shrink-0 mt-0.5 border border-blue-400/20">
                  <Zap className="w-4 h-4 text-blue-300" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Instant Synchronized Calculations</h4>
                  <p className="text-xs text-blue-100/70 mt-0.5">
                    Save discounts, EMIs, and multi-currency plans directly to your cloud storage.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-6 border-t border-white/10 text-xs text-blue-200/60">
            Secure Cloud Authentication
          </div>
        </div>

        {/* Right Form Container */}
        <div className="w-full md:w-7/12 lg:w-1/2 min-h-[calc(100dvh-57px)] md:min-h-[100dvh] p-6 sm:p-10 md:p-14 flex flex-col justify-center overflow-y-auto overscroll-y-contain">
          <div className="max-w-md w-full mx-auto">
          {currentUser && activeTab !== 'update_password' ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-2xl font-extrabold text-slate-800">
                  Currently Signed In
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  You are logged in as{' '}
                  <strong className="text-slate-800">
                    {currentUser.user_metadata?.full_name || currentUser.email || 'User'}
                  </strong>
                </p>
              </div>
              <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center max-w-sm mx-auto">
                <Link
                  href="/"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  <span>Go to Calculator</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('update_password');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Change Password</span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={loading}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 font-bold text-xs rounded-xl border border-slate-200 hover:border-rose-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {activeTab === 'forgot_password'
                    ? 'Reset Password'
                    : activeTab === 'update_password'
                    ? 'Set New Password'
                    : activeTab === 'email_signup'
                    ? 'Create Account'
                    : 'Welcome Back'}
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  {activeTab === 'forgot_password'
                    ? 'Enter your email address to receive a password reset link.'
                    : activeTab === 'update_password'
                    ? 'Enter and confirm your new account password.'
                    : 'Access your saved calculations and preferences.'}
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

              {/* Nav Tabs (hidden when on forgot_password or update_password) */}
              {activeTab !== 'forgot_password' && activeTab !== 'update_password' && (
                <div className="flex flex-wrap gap-1 mb-6 bg-slate-100 p-1 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('email_login');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                      activeTab === 'email_login' || activeTab === 'email_signup'
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('google');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                      activeTab === 'google'
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Google
                  </button>
                </div>
              )}

              {/* Email Tab */}
              {(activeTab === 'email_login' || activeTab === 'email_signup') && (
                <form onSubmit={activeTab === 'email_login' ? handleEmailSignIn : handleEmailSignUp} className="space-y-4">
                  {activeTab === 'email_signup' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Alex Rivera"
                          className="w-full bg-white text-slate-900 font-medium placeholder:text-slate-400 border border-slate-300 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all shadow-xs"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="retailer@example.com"
                        className="w-full bg-white text-slate-900 font-medium placeholder:text-slate-400 border border-slate-300 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all shadow-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
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

                    {/* Forgot Password Link strictly below the password field in email_login */}
                    {activeTab === 'email_login' && (
                      <div className="flex justify-end mt-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('forgot_password');
                            setError(null);
                            setSuccessMsg(null);
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
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : activeTab === 'email_login' ? 'Sign In' : 'Create Account'}
                  </button>

                  <div className="text-center pt-2 text-xs text-slate-500">
                    {activeTab === 'email_login' ? (
                      <span>
                        Don&apos;t have an account?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('email_signup');
                            setError(null);
                          }}
                          className="text-blue-600 font-bold hover:underline cursor-pointer"
                        >
                          Register here
                        </button>
                      </span>
                    ) : (
                      <span>
                        Already have an account?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('email_login');
                            setError(null);
                          }}
                          className="text-blue-600 font-bold hover:underline cursor-pointer"
                        >
                          Sign In
                        </button>
                      </span>
                    )}
                  </div>
                </form>
              )}

              {/* Forgot Password Prompt UI */}
              {activeTab === 'forgot_password' && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('email_login');
                      setError(null);
                      setSuccessMsg(null);
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
                        We sent a password reset link to <strong className="font-semibold">{email}</strong>. Please check your inbox.
                      </p>

                      <div className="pt-2 flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('email_login');
                            setResetSent(false);
                            setSuccessMsg(null);
                          }}
                          className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                        >
                          Return to Sign In
                        </button>
                        <button
                          type="button"
                          onClick={handlePasswordReset}
                          disabled={loading}
                          className="py-2.5 px-4 bg-white border border-emerald-300 text-emerald-800 font-semibold text-xs rounded-xl hover:bg-emerald-50 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {loading ? 'Sending...' : 'Resend Link'}
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
                            placeholder="retailer@example.com"
                            className="w-full bg-white text-slate-900 font-medium placeholder:text-slate-400 border border-slate-300 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all shadow-xs"
                          />
                        </div>
                      </div>

                      <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-left text-xs text-amber-900 leading-relaxed">
                        <p className="font-semibold flex items-center gap-1.5 text-amber-950 text-xs mb-1">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Tip:</span>
                        </p>
                        <p className="text-[11px] text-amber-800">
                          After sending the link, please check your email inbox or spam folder and click the link to set your new password.
                        </p>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                      >
                        {loading ? (
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

              {/* Set New Password UI (When arrived via recovery link) */}
              {activeTab === 'update_password' && (
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-emerald-800">
                    <KeyRound className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <p className="leading-relaxed">
                      You are authenticated via your reset link. Please enter your new password below.
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
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Update &amp; Save New Password</span>
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (currentUser) {
                          setActiveTab('google');
                        } else {
                          setActiveTab('email_login');
                        }
                        setError(null);
                      }}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                    >
                      {currentUser ? 'Back to Profile' : 'Cancel and back to Sign In'}
                    </button>
                  </div>
                </form>
              )}

              {/* Google Tab */}
              {activeTab === 'google' && (
                <div className="space-y-4 pt-2">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="w-full py-3.5 px-4 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-2xl shadow-sm transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
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
                  <p className="text-center text-xs text-slate-500 font-medium">
                    No password required. Connects with your Google account.
                  </p>
                </div>
              )}

            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
