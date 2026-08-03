import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400'],
  variable: '--font-display',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://unwavering.band'),
  title: 'unwavering.band',
  description:
    'A person is a band of light. Sign in, share where you are, and be one of them.',
  openGraph: {
    title: 'unwavering.band',
    description:
      'A person is a band of light. Sign in, share where you are, and be one of them.',
    url: 'https://unwavering.band',
    siteName: 'unwavering.band',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'unwavering.band',
    description: 'A person is a band of light.',
  },
};

export const viewport: Viewport = {
  themeColor: '#03030a',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
