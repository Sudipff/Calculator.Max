import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Retail Calculator',
  description: 'Smart retail assistant with EMI Calculator, Wishlist Savings Goal Planner, Discount & Weight tools',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Retail Calculator',
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
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full w-full">
      <body className="min-h-full w-full max-w-[100vw] overflow-x-hidden antialiased">{children}</body>
    </html>
  );
}

