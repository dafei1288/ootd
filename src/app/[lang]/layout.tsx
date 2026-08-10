import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LANGS, LANG_KEYS, SITE_NAME, type Lang } from '@/lib/config';

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
  return (
    <div className="mx-auto max-w-5xl px-4">
      <header className="flex flex-wrap items-center justify-between gap-3 py-6">
        <Link href={`${LANGS[l].prefix}/`} className="text-xl font-bold tracking-tight">
          {SITE_NAME}
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
      </header>
      <main>{children}</main>
      <footer className="py-10 text-center text-xs text-neutral-400">{SITE_NAME}</footer>
    </div>
  );
}
