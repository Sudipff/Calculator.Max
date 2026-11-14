import './globals.css';
import type { Metadata, Viewport } from 'next';
import PwaRuntime from '../components/PwaRuntime';

export const metadata: Metadata = {
  title: 'Calculator Max • All Calculators, Notes & Tasks',
  description: 'Calculator Max with Scientific Calculator, EMI, Wishlist Savings Goal Planner, Notes, Tasks Manager, and Offline Cloud Sync',
  manifest: '/manifest.json',
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
  themeColor: '#2563eb',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full w-full">
      <body className="min-h-full w-full max-w-[100vw] overflow-x-clip antialiased">
        {children}
        <PwaRuntime />
      </body>
    </html>
  );
}

