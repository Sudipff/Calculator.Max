'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, MoreVertical, PlusSquare, Share, Smartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __deferredPWAInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

type AndroidBrowserKind = 'samsung' | 'firefox' | 'edge' | 'opera' | 'chrome';

function detectAndroidBrowser(ua: string): AndroidBrowserKind {
  if (/samsungbrowser/i.test(ua)) return 'samsung';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/edga|edg/i.test(ua)) return 'edge';
  if (/opr|opera/i.test(ua)) return 'opera';
  return 'chrome';
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [androidBrowser, setAndroidBrowser] = useState<AndroidBrowserKind>('chrome');

  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const minimalQuery = window.matchMedia('(display-mode: minimal-ui)');
    const checkStandalone = () =>
      standaloneQuery.matches ||
      minimalQuery.matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.startsWith('android-app://');

    setIsInstalled(checkStandalone());

    const ua = window.navigator.userAgent || '';
    const lowerUa = ua.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(lowerUa) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroidDevice = /android/.test(lowerUa);

    setIsIOS(isIOSDevice);
    setIsAndroid(isAndroidDevice);
    if (isAndroidDevice) {
      setAndroidBrowser(detectAndroidBrowser(lowerUa));
    }

    // Pick up early pre-hydration beforeinstallprompt captured in layout.tsx
    if (window.__deferredPWAInstallPrompt) {
      setDeferredPrompt(window.__deferredPWAInstallPrompt);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__deferredPWAInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleEarlyPromptReady = () => {
      if (window.__deferredPWAInstallPrompt) {
        setDeferredPrompt(window.__deferredPWAInstallPrompt);
      }
    };

    const handleAppInstalled = () => {
      window.__deferredPWAInstallPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const handleDisplayModeChange = () => {
      setIsInstalled(checkStandalone());
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('calcmax:pwa-prompt-ready', handleEarlyPromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('calcmax:pwa-installed', handleAppInstalled);
    standaloneQuery.addEventListener('change', handleDisplayModeChange);
    minimalQuery.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('calcmax:pwa-prompt-ready', handleEarlyPromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('calcmax:pwa-installed', handleAppInstalled);
      standaloneQuery.removeEventListener('change', handleDisplayModeChange);
      minimalQuery.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    const promptToUse = deferredPrompt || window.__deferredPWAInstallPrompt;
    if (!promptToUse) return false;
    try {
      await promptToUse.prompt();
      const { outcome } = await promptToUse.userChoice;
      window.__deferredPWAInstallPrompt = null;
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        setIsInstalled(true);
        return true;
      }
    } catch {
      // Prompt was already consumed or rejected
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isAndroid,
    androidBrowser,
    install,
  };
}

export default function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, isAndroid, androidBrowser, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState<'ios' | 'android' | null>(null);

  // Never show when already running inside an installed PWA standalone window
  if (isInstalled) {
    return null;
  }

  // Native Chromium / Android / Desktop prompt is available
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="Install Calculator Max app"
        className={`inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white border border-blue-600 transition-all active:scale-95 cursor-pointer font-bold shadow-xs whitespace-nowrap ${
          compact ? 'px-2.5 py-1.5 text-[11px] min-h-[36px]' : 'px-3.5 py-2 text-xs min-h-[40px]'
        }`}
        title="Install Calculator Max"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Install</span>
      </button>
    );
  }

  // iOS Safari & Android browsers where native beforeinstallprompt isn't active yet
  if (isIOS || isAndroid) {
    const targetMode = isIOS ? 'ios' : 'android';
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuideModal(targetMode)}
          aria-label="Install Calculator Max app"
          className={`inline-flex items-center gap-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 transition-all active:scale-95 cursor-pointer font-bold shadow-2xs whitespace-nowrap ${
            compact ? 'px-2.5 py-1.5 text-[11px] min-h-[36px]' : 'px-3.5 py-2 text-xs min-h-[40px]'
          }`}
          title="Install Calculator Max"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Install</span>
        </button>

        {showGuideModal &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pwa-install-guide-title"
              className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
              onClick={() => setShowGuideModal(null)}
            >
              <div
                className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-100 text-slate-800 space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </span>
                    <h3
                      id="pwa-install-guide-title"
                      className="text-base font-extrabold text-slate-900"
                    >
                      Install Calculator Max
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGuideModal(null)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer shrink-0"
                    aria-label="Close install instructions"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {showGuideModal === 'ios' ? (
                  <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <Share className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span>
                        1. Tap the <strong>Share</strong> button in your Safari browser toolbar.
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <PlusSquare className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span>
                        2. Scroll down and select <strong>Add to Home Screen</strong>.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <MoreVertical className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span>
                        1. Tap the browser menu{' '}
                        <strong>{androidBrowser === 'samsung' ? '(≡)' : '(⋮)'}</strong> in{' '}
                        {androidBrowser === 'samsung'
                          ? 'Samsung Internet'
                          : androidBrowser === 'firefox'
                          ? 'Firefox'
                          : androidBrowser === 'edge'
                          ? 'Edge'
                          : androidBrowser === 'opera'
                          ? 'Opera'
                          : 'Chrome'}
                        .
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <PlusSquare className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span>
                        2. Tap{' '}
                        <strong>
                          {androidBrowser === 'firefox'
                            ? 'Install'
                            : androidBrowser === 'samsung'
                            ? 'Add page to → Home screen'
                            : 'Add to Home screen / Install app'}
                        </strong>
                        .
                      </span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowGuideModal(null)}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Got it
                </button>
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }

  return null;
}
