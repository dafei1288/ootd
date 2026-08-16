import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LANGS, LANG_KEYS, langUrl, ICP, COPYRIGHT, type Lang } from '@/lib/config';
import { siteName } from '@/lib/db';
import { t } from '@/lib/i18n';

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!(lang in LANGS)) notFound();
  const l = lang as Lang;
  const name = siteName();
  return (
    <div className="mx-auto max-w-5xl px-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name,
            url: langUrl(l, '/'),
          }),
        }}
      />
      <header className="flex flex-wrap items-center justify-between gap-3 py-6">
        <Link href={`${LANGS[l].prefix}/`} className="text-xl font-bold tracking-tight">
          {name}
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href={`${LANGS[l].prefix}/wish`}
            className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm text-white transition hover:bg-neutral-700"
          >
            🌠 {t('nav.wish', l)}
          </Link>
          <nav className="flex gap-3 text-sm">
            {LANG_KEYS.map((k) => (
              <Link
                key={k}
                href={`${LANGS[k].prefix}/`}
                className={k === l ? 'font-bold' : 'text-neutral-500 hover:text-neutral-900'}
              >
                {LANGS[k].name}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="py-10 text-center text-xs text-neutral-400">
        <div>{name}</div>
        {COPYRIGHT && <div className="mt-1">{COPYRIGHT}</div>}
        {ICP && (
          <div className="mt-1">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-600"
            >
              {ICP}
            </a>
          </div>
        )}
      </footer>
    </div>
  );
}
