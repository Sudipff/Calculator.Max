'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  Check,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import styles from './ResetPassword.module.css';
import { createClient } from '@/utils/supabase/client';

function ResetPasswordFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Form input states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Interaction states
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);

  // Recovery link token / session detection
  const [recoveryToken, setRecoveryToken] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [hasValidSession, setHasValidSession] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  // Detect recovery tokens from query params or URL hash
  useEffect(() => {
    // 1. Check searchParams
    const queryToken = searchParams.get('token') || '';
    const queryCode = searchParams.get('code') || '';
    const queryEmail = searchParams.get('email') || '';
    if (queryToken) setRecoveryToken(queryToken);
    if (queryEmail) setUserEmail(queryEmail);

    // If PKCE code is provided, exchange it for a session
    if (queryCode) {
      supabase.auth.exchangeCodeForSession(queryCode).then(({ data, error }) => {
        if (!error && data?.session) {
          setHasValidSession(true);
          setRecoveryToken(data.session.access_token);
          if (data.session.user?.email) {
            setUserEmail(data.session.user.email);
          }
        }
      }).catch((e) => console.warn('Code exchange note:', e));
    }

    // 2. Check hash fragments from Supabase recovery redirect
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      if (hash.includes('access_token=')) {
        const params = new URLSearchParams(hash.replace(/^#/, ''));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token') || '';
        if (accessToken) {
          setRecoveryToken(accessToken);
          setHasValidSession(true);
          // Set the session explicitly so supabase.auth.updateUser works without 'Auth session missing'
          supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          }).then(({ data, error }) => {
            if (!error && data?.user?.email) {
              setUserEmail(data.user.email);
            }
          }).catch((e) => console.warn('setSession note:', e));
        }
      }
    }

    // 3. Listen to Supabase Auth state change for PASSWORD_RECOVERY
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session?.access_token) {
        setHasValidSession(true);
        if (session?.access_token) {
          setRecoveryToken(session.access_token);
        }
        if (session?.user?.email) {
          setUserEmail(session.user.email);
        }
      }
    });

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setHasValidSession(true);
        if (session.access_token && !recoveryToken) {
          setRecoveryToken(session.access_token);
        }
        if (session.user?.email && !userEmail) {
          setUserEmail(session.user.email);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [searchParams, supabase, recoveryToken, userEmail]);

  // Validation rules
  const validation = useMemo(() => {
    const minLength = newPassword.length >= 8;
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
    const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

    let score = 0;
    if (newPassword.length >= 8) score += 1;
    if (hasUpper && hasLower) score += 1;
    if (hasNumber) score += 1;
    if (hasSpecial) score += 1;

    let strengthLabel = 'Too Weak';
    let strengthColor = '#ef4444';

    if (score === 1) {
      strengthLabel = 'Weak';
      strengthColor = '#f97316';
    } else if (score === 2) {
      strengthLabel = 'Fair';
      strengthColor = '#eab308';
    } else if (score === 3) {
      strengthLabel = 'Good';
      strengthColor = '#3b82f6';
    } else if (score === 4) {
      strengthLabel = 'Strong';
      strengthColor = '#10b981';
    }

    const isValid = minLength && hasUpper && hasLower && (hasNumber || hasSpecial) && passwordsMatch;

    return {
      minLength,
      hasUpper,
      hasLower,
      hasNumber,
      hasSpecial,
      passwordsMatch,
      score,
      strengthLabel,
      strengthColor,
      isValid,
    };
  }, [newPassword, confirmPassword]);

  // Handle countdown redirection on success
  useEffect(() => {
    if (!successMessage) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/login');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [successMessage, router]);

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    setApiError(null);

    if (!validation.isValid) {
      return;
    }

    setLoading(true);

    try {
      let updateOk = false;
      let updateErrMsg = '';

      // 1. Update password in Supabase Auth if client session is active
      try {
        const { error: supabaseError } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (!supabaseError) {
          updateOk = true;
        } else {
          console.warn('Supabase client update warning:', supabaseError.message);
          updateErrMsg = supabaseError.message;
        }
      } catch (authErr: any) {
        console.warn('Supabase auth update notice:', authErr);
        updateErrMsg = authErr?.message || '';
      }

      // 2. Call backend Next.js API route to securely hash password and update user database
      try {
        const response = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(recoveryToken ? { Authorization: `Bearer ${recoveryToken}` } : {}),
          },
          body: JSON.stringify({
            newPassword,
            confirmPassword,
            token: recoveryToken,
            email: userEmail,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          updateOk = true;
        } else if (!updateOk) {
          throw new Error(data.error || updateErrMsg || 'Failed to reset password. Please try again.');
        }
      } catch (backendErr: any) {
        if (!updateOk) {
          throw backendErr;
        }
      }

      if (!updateOk) {
        throw new Error(updateErrMsg || 'Failed to update password. Your recovery link may have expired.');
      }

      setSuccessMessage(
        'Your password has been changed successfully! Redirecting to login...'
      );
    } catch (err: any) {
      setApiError(err?.message || 'An unexpected error occurred while resetting your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.card}>
        {successMessage ? (
          <div className={styles.successCard}>
            <div className={styles.successIconWrapper}>
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className={styles.title}>Password Changed!</h1>
            <p className={styles.subtitle}>{successMessage}</p>
            <p className={styles.countdownText}>
              Redirecting to login in <strong>{countdown}</strong> seconds...
            </p>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className={styles.submitButton}
            >
              <span>Go to Login Now</span>
            </button>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <div className={styles.iconWrapper}>
                <KeyRound className="w-6 h-6" />
              </div>
              <h1 className={styles.title}>Set New Password</h1>
              <p className={styles.subtitle}>
                {userEmail
                  ? `Choose a strong new password for ${userEmail}.`
                  : 'Enter your new secure password below to complete account recovery.'}
              </p>
            </div>

            {apiError && (
              <div className={styles.alertError} role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form} noValidate>
              {/* New Password Field */}
              <div className={styles.inputGroup}>
                <label htmlFor="new-password" className={styles.label}>
                  <span>New Password</span>
                  {isSubmitted && !validation.minLength && (
                    <span className={styles.errorMessage}>Min 8 characters</span>
                  )}
                </label>
                <div className={styles.inputWrapper}>
                  <Lock className={`w-4 h-4 ${styles.fieldIcon}`} />
                  <input
                    id="new-password"
                    name="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (apiError) setApiError(null);
                    }}
                    placeholder="Enter new password"
                    autoComplete="new-password"
                    disabled={loading}
                    className={`${styles.input} ${
                      isSubmitted && (!validation.minLength || !validation.hasUpper || !validation.hasLower)
                        ? styles.inputError
                        : ''
                    } ${newPassword.length >= 8 && validation.score >= 3 ? styles.inputSuccess : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className={styles.toggleButton}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Real-time Strength Meter */}
                {newPassword.length > 0 && (
                  <div className={styles.strengthSection}>
                    <div className={styles.strengthHeader}>
                      <span>Password Strength</span>
                      <span
                        className={styles.strengthStatus}
                        style={{ color: validation.strengthColor }}
                      >
                        {validation.strengthLabel}
                      </span>
                    </div>
                    <div className={styles.meterBars}>
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={styles.meterSegment}
                          style={{
                            backgroundColor:
                              validation.score >= step ? validation.strengthColor : undefined,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password Field */}
              <div className={styles.inputGroup}>
                <label htmlFor="confirm-password" className={styles.label}>
                  <span>Confirm Password</span>
                  {isSubmitted && confirmPassword.length > 0 && !validation.passwordsMatch && (
                    <span className={styles.errorMessage}>Passwords do not match</span>
                  )}
                </label>
                <div className={styles.inputWrapper}>
                  <ShieldCheck className={`w-4 h-4 ${styles.fieldIcon}`} />
                  <input
                    id="confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (apiError) setApiError(null);
                    }}
                    placeholder="Re-enter your new password"
                    autoComplete="new-password"
                    disabled={loading}
                    className={`${styles.input} ${
                      isSubmitted && (!confirmPassword || !validation.passwordsMatch)
                        ? styles.inputError
                        : ''
                    } ${validation.passwordsMatch && confirmPassword.length >= 8 ? styles.inputSuccess : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className={styles.toggleButton}
                    aria-label={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Requirements Checklist */}
              <div className={styles.requirementsBox}>
                <div className={styles.requirementsTitle}>Password Requirements:</div>
                <div
                  className={`${styles.requirementItem} ${
                    validation.minLength ? styles.requirementMet : ''
                  }`}
                >
                  <Check
                    className={`w-3.5 h-3.5 ${styles.requirementIcon} ${
                      validation.minLength ? 'text-emerald-600' : 'text-slate-300'
                    }`}
                  />
                  <span>At least 8 characters long</span>
                </div>
                <div
                  className={`${styles.requirementItem} ${
                    validation.hasUpper && validation.hasLower ? styles.requirementMet : ''
                  }`}
                >
                  <Check
                    className={`w-3.5 h-3.5 ${styles.requirementIcon} ${
                      validation.hasUpper && validation.hasLower
                        ? 'text-emerald-600'
                        : 'text-slate-300'
                    }`}
                  />
                  <span>Upper & lowercase letters</span>
                </div>
                <div
                  className={`${styles.requirementItem} ${
                    validation.hasNumber || validation.hasSpecial ? styles.requirementMet : ''
                  }`}
                >
                  <Check
                    className={`w-3.5 h-3.5 ${styles.requirementIcon} ${
                      validation.hasNumber || validation.hasSpecial
                        ? 'text-emerald-600'
                        : 'text-slate-300'
                    }`}
                  />
                  <span>At least one number or special character</span>
                </div>
                <div
                  className={`${styles.requirementItem} ${
                    validation.passwordsMatch ? styles.requirementMet : ''
                  }`}
                >
                  <Check
                    className={`w-3.5 h-3.5 ${styles.requirementIcon} ${
                      validation.passwordsMatch ? 'text-emerald-600' : 'text-slate-300'
                    }`}
                  />
                  <span>Passwords match</span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className={styles.submitButton}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>
            </form>

            <div className={styles.footerLinks}>
              <Link href="/login" className={styles.backLink}>
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Login</span>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.pageContainer}>
          <div className={styles.card}>
            <div className="flex flex-col items-center justify-center p-8 space-y-3 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Loading password recovery form...</p>
            </div>
          </div>
        </div>
      }
    >
      <ResetPasswordFormContent />
    </Suspense>
  );
}
