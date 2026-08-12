import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { listPublished, siteName, getTagsForPosts, getCommentCounts, recordSearch } from '@/lib/db';
import { LANGS, LANG_KEYS, langUrl, type Lang } from '@/lib/config';
import { t } from '@/lib/i18n';
import { withSeo } from '@/lib/seo';
import PostCard from '@/components/PostCard';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  const languages = Object.fromEntries(LANG_KEYS.map((k) => [LANGS[k].hreflang, langUrl(k, '/')]));
  return withSeo(
    {
      title: siteName(),
      alternates: {
        canonical: langUrl(lang, '/'),
        languages: { ...languages, 'x-default': langUrl('en', '/') },
      },
    },
    { lang },
  );
}

export default async function Home({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Lang }>;
  searchParams: Promise<{ search?: string }>;
}) {
  const { lang } = await params;
  const { search } = await searchParams;
  const posts = listPublished(search);
  const prefix = LANGS[lang].prefix;

  // record the search so admin can see what users want (esp. terms with no results)
  const term = (search ?? '').trim();
  if (term) {
    try {
      recordSearch(lang, term, posts.length > 0);
    } catch {
      /* never let analytics break rendering */
    }
  }

  // tags for the cards (single batched query)
  const tagMap = getTagsForPosts(posts.map((p) => p.id), lang);

  // comment counts for the cards (single batched query)
  const commentMap = getCommentCounts(posts.map((p) => p.id));

  // which posts this browser has already liked
  const liked = new Set<number>();
  for (const c of (await cookies()).getAll()) {
    if (c.value === '1') {
      const m = c.name.match(/^liked_(\d+)$/);
      if (m) liked.add(Number(m[1]));
    }
  }

  return (
    <>
      <form action="" method="get" className="mb-8">
        <input
          type="search"
          name="search"
          defaultValue={search ?? ''}
          placeholder={t('home.search', lang)}
          className="w-full rounded-lg border border-neutral-300 px-4 py-2"
        />
      </form>
      {posts.length === 0 && <p className="py-20 text-center text-neutral-400">{t('home.empty', lang)}</p>}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            lang={lang}
            prefix={prefix}
            tags={tagMap.get(p.id) ?? []}
            liked={liked.has(p.id)}
            commentCount={commentMap.get(p.id) ?? 0}
          />
        ))}
      </div>
    </>
  );
}
