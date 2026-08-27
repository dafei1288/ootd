import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LANGS, LANG_KEYS, type Lang } from '@/lib/config';
import { langUrl, siteUrl } from '@/lib/site';
import { siteName, getSetting } from '@/lib/db';
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
  // 版权/备案：后台 settings 优先，兼容 .env.local 旧配置
  const copyright = getSetting('copyright') ?? process.env.COPYRIGHT?.trim() ?? '';
  const icp = getSetting('icp') ?? process.env.ICP?.trim() ?? '';
  return (
    <div className="mx-auto max-w-5xl px-4">
      {/* RSS feed 链接（hoist 到 <head>，供订阅器与 AI 引擎发现） */}
      <link rel="alternate" type="application/rss+xml" title={`${name} RSS`} href={`${await siteUrl()}/feed.xml`} />
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
            href={`${LANGS[l].prefix}/tryon`}
            className="rounded-full bg-pink-500 px-4 py-1.5 text-sm text-white transition hover:bg-pink-600"
          >
            🧥 {t('nav.tryon', l)}
          </Link>
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
        {copyright && <div className="mt-1">{copyright}</div>}
        {icp && (
          <div className="mt-1">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-600"
            >
              {icp}
            </a>
          </div>
        )}
      </footer>
    </div>
  );
}
