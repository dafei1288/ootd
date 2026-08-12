import { headers } from 'next/headers';
import { LANGS, type Lang } from '@/lib/config';
import SiteSnippets from '@/components/SiteSnippets';
import './globals.css';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = ((await headers()).get('x-lang') ?? 'en') as Lang;
  const htmlLang = LANGS[lang]?.hreflang ?? 'en';
  return (
    <html lang={htmlLang}>
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
        <SiteSnippets />
      </body>
    </html>
  );
}
