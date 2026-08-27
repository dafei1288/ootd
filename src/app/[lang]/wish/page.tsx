import Link from 'next/link';
import type { Metadata } from 'next';
import { listPendingWishes, listDoneWishes, siteName } from '@/lib/db';
import { LANGS, LANG_KEYS, type Lang } from '@/lib/config';
import { langUrl } from '@/lib/site';
import { withSeo } from '@/lib/seo';
import { t } from '@/lib/i18n';
import { addWishAction } from '@/app/[lang]/actions';
import SubmitButton from '@/components/SubmitButton';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  const languages = Object.fromEntries(LANG_KEYS.map((k) => [LANGS[k].hreflang, langUrl(k, '/wish')]));
  return withSeo(
    {
      title: `${t('nav.wish', lang)} | ${siteName()}`,
      alternates: {
        canonical: langUrl(lang, '/wish'),
        languages: { ...languages, 'x-default': langUrl('en', '/wish') },
      },
    },
    { lang },
  );
}

export default async function WishPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const prefix = LANGS[lang].prefix;
  const pending = listPendingWishes(50);
  const done = listDoneWishes(50);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">{t('nav.wish', lang)}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('wish.intro', lang)}</p>

      <form action={addWishAction} className="mb-12 rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
        <input type="hidden" name="lang" value={lang} />
        <label className="mb-1 block text-xs text-neutral-500">{t('ui.nickname', lang)}</label>
        <input
          type="text"
          name="nickname"
          maxLength={50}
          placeholder={t('ui.anon', lang)}
          className="mb-3 w-full max-w-xs rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <label className="mb-1 block text-xs text-neutral-500">{t('wish.content', lang)}</label>
        <textarea
          name="content"
          required
          maxLength={200}
          rows={3}
          placeholder={t('wish.placeholder', lang)}
          className="mb-3 w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <SubmitButton label={t('wish.submit', lang)} pendingLabel={t('wish.submitting', lang)} />
      </form>

      <h2 className="mb-3 text-lg font-bold">
        {t('wish.done', lang)}
        <span className="ml-1 text-sm font-normal text-neutral-400">{done.length}</span>
      </h2>
      <ul className="mb-10 space-y-2">
        {done.length === 0 ? (
          <li className="rounded-xl bg-white p-4 text-sm text-neutral-400 shadow-sm ring-1 ring-neutral-200">
            {t('wish.doneEmpty', lang)}
          </li>
        ) : (
          done.map((w) => {
            const ready = w.post_status === 'published' && w.slug;
            return (
              <li key={w.id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-neutral-200">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-neutral-800">{w.content}</p>
                  {ready ? (
                    <Link href={`${prefix}/page/${w.slug}`} className="shrink-0 text-xs text-blue-600 hover:underline">
                      {t('ui.view', lang)}
                    </Link>
                  ) : (
                    <span className="shrink-0 text-xs text-neutral-400">{t('ui.generating', lang)}</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  {w.nickname.trim() || t('ui.anon', lang)} · {w.completed_at}
                </div>
              </li>
            );
          })
        )}
      </ul>

      <h2 className="mb-3 text-lg font-bold">
        {t('wish.pending', lang)}
        <span className="ml-1 text-sm font-normal text-neutral-400">{pending.length}</span>
      </h2>
      <ul className="space-y-2">
        {pending.length === 0 ? (
          <li className="rounded-xl bg-white p-4 text-sm text-neutral-400 shadow-sm ring-1 ring-neutral-200">
            {t('wish.pendingEmpty', lang)}
          </li>
        ) : (
          pending.map((w) => (
            <li key={w.id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-neutral-200">
              <p className="text-sm text-neutral-800">{w.content}</p>
              <div className="mt-1 text-xs text-neutral-400">
                {w.nickname.trim() || t('ui.anon', lang)} · {w.created_at}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
