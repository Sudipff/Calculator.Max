import './globals.css';
import type { Metadata, Viewport } from 'next';
import PwaRuntime from '../components/PwaRuntime';
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
        <meta name="google-site-verification" content="zLnAfNCPiMfQANuiwxvayjzk3slcniqnV0SRY1bwCxM" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full w-full max-w-[100vw] overflow-x-clip antialiased transition-colors duration-200">
        <ThemeProvider>
          {children}
          <PwaRuntime />
        </ThemeProvider>
      </body>
    </html>
  );
}

