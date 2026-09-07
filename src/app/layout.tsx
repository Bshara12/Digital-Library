import type { Metadata, Viewport } from 'next';
import { Amiri, Noto_Naskh_Arabic, IBM_Plex_Sans_Arabic, Cormorant_Garamond, Inter } from 'next/font/google';
import './globals.css';

/* الخطوط تُستضاف محلياً عبر next/font — بلا أي طلب لخادم خارجي */
const amiri = Amiri({
  subsets: ['arabic', 'latin'],
  weight: ['400', '700'],
  variable: '--font-amiri',
  display: 'swap',
});

const naskh = Noto_Naskh_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-naskh',
  display: 'swap',
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-ar',
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  variable: '--font-cormorant',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'مكتبة عصام السالم',
    template: '%s — مكتبة عصام السالم',
  },
  description: 'المكتبة الرقمية لأعمال المهندس عصام السالم — تُقرأ كاملة عبر الموقع.',
  authors: [{ name: 'عصام السالم' }],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0C',
  width: 'device-width',
  initialScale: 1,
  // نسمح بالتكبير — منعه إخلال بإمكانية الوصول
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${amiri.variable} ${naskh.variable} ${plexArabic.variable} ${cormorant.variable} ${inter.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
