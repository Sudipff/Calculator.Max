import './globals.css';
import type { Metadata, Viewport } from 'next';
import PwaRuntime from '../components/PwaRuntime';
import NotificationBanner from '../components/NotificationBanner';
import { ThemeProvider } from '../components/ThemeProvider';

export const metadata: Metadata = {
  title: 'Calculator Max • All Calculators, Notes & Tasks',
  description: 'Calculator Max with Scientific Calculator, EMI, Wishlist Savings Goal Planner, Notes, Tasks Manager, and Offline Cloud Sync',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Calculator Max',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
    { media: '(prefers-color-scheme: light)', color: '#2563eb' },
  ],
};

const themeInitScript = `
(function() {
  try {
    var userSet = localStorage.getItem('calculator-max-user-theme-set') === 'true';
    var saved = localStorage.getItem('calculator-max-theme');
    var theme = (userSet && (saved === 'light' || saved === 'dark')) ? saved : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('calculator-max-theme', theme);
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.classList.remove('dark');
  }
  try {
    window.__deferredPWAInstallPrompt = window.__deferredPWAInstallPrompt || null;
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      window.__deferredPWAInstallPrompt = e;
      window.dispatchEvent(new CustomEvent('calcmax:pwa-prompt-ready'));
    });
    window.addEventListener('appinstalled', function() {
      window.__deferredPWAInstallPrompt = null;
      window.dispatchEvent(new CustomEvent('calcmax:pwa-installed'));
    });
  } catch (e) {}
  try {
    var dismissSplash = function() {
      setTimeout(function() {
        var splash = document.getElementById('calcmax-startup-splash');
        if (splash) {
          splash.style.opacity = '0';
          splash.style.pointerEvents = 'none';
          setTimeout(function() {
            if (splash) {
              splash.style.visibility = 'hidden';
            }
          }, 260);
        }
      }, 320);
    };
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', dismissSplash);
    } else {
      dismissSplash();
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className="h-full w-full">
      <head>
        <meta name="google-site-verification" content="sBlRqa8QMWy3a5OWfUJ5TIzNLT2KncwoxVcztjcKKEM" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full w-full max-w-[100vw] overflow-x-clip antialiased transition-colors duration-200">
        {/* Startup Loading Screen: Displays Calculator Max clearly at the bottom during startup */}
        <div
          id="calcmax-startup-splash"
          suppressHydrationWarning
          role="status"
          aria-live="polite"
          aria-label="Calculator Max startup loading screen"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#eef2ff] dark:from-[#0b0f19] dark:via-[#0f172a] dark:to-[#111827] px-6 py-10 select-none transition-opacity duration-250"
        >
          <div className="h-12" aria-hidden="true" />
          <div className="flex flex-col items-center justify-center gap-5">
            <div className="relative flex items-center justify-center">
              <span
                aria-hidden="true"
                className="absolute -inset-2.5 rounded-[28px] border-2 border-blue-500/25 border-t-blue-600 dark:border-blue-400/20 dark:border-t-blue-400 animate-spin"
              />
              <div className="w-20 h-20 rounded-3xl bg-white dark:bg-slate-900 shadow-[0_12px_32px_rgba(37,99,235,0.16)] border border-slate-200/80 dark:border-slate-800 flex items-center justify-center p-2">
                <img
                  src="/pwa-192x192.png"
                  alt="Calculator Max Logo"
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-2xl object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
          <div className="w-full flex flex-col items-center justify-end pb-4 sm:pb-6 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400 mb-1">
              Smart Retail &amp; Math Suite
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight m-0">
              Calculator Max
            </p>
          </div>
        </div>
        <ThemeProvider>
          {children}
          <PwaRuntime />
          <NotificationBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}

