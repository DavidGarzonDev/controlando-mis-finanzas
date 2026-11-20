import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/manrope';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pilas',
  description: 'Pilas con la plata: gastos, cuentas, tarjetas y metas',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Pilas', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f4f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0e15' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Aplica el tema elegido antes de pintar, para que no parpadee. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('tema');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;if(localStorage.getItem('privado')==='1')document.documentElement.dataset.privado='1'}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
