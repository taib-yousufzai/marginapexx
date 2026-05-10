import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import InstallPrompt from '@/components/InstallPrompt';

import { Inter, Playfair_Display } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-playfair',
});

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#ffffff' }, { media: '(prefers-color-scheme: dark)', color: '#1E1E1E' }],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export const metadata: Metadata = {
  title: 'Margin Apex',
  description: 'Clean Icons & Trading App UI',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Margin Apex'
  },
  formatDetection: {
    telephone: false
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <head>
        {/* Font Awesome 6 */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" />
      </head>
      <body suppressHydrationWarning>
        <Script id="theme-script" strategy="beforeInteractive" dangerouslySetInnerHTML={{__html: `
          (function(){
            try {
              var t = localStorage.getItem('marginApexTheme');
              if(t === 'dark') document.body.classList.add('dark');
            } catch(e){}
            if('scrollRestoration' in history) history.scrollRestoration = 'manual';
            window.addEventListener('load', function() {
              var el = document.getElementById('home-scroll');
              if(el) el.scrollTop = 0;
              window.scrollTo(0,0);
            });
            document.addEventListener('DOMContentLoaded', function() {
              var el = document.getElementById('home-scroll');
              if(el) el.scrollTop = 0;
            });
          })();
        `}} />
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
