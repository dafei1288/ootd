import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { listPostsByTag, siteName, getTagsForPosts, getCommentCounts } from '@/lib/db';
import { LANGS, parseMulti, type Lang } from '@/lib/config';
import { langUrl } from '@/lib/site';
import { withSeo } from '@/lib/seo';
import PostCard from '@/components/PostCard';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Lang; tag: string }>;
}): Promise<Metadata> {
  const { lang, tag: rawTag } = await params;
  let tag: string;
  try {
    tag = decodeURIComponent(rawTag);
  } catch {
    tag = rawTag;
  }
  return withSeo(
    {
      title: `${tag} | ${siteName()}`,
      alternates: { canonical: langUrl(lang, `/tag/${encodeURIComponent(tag)}`) },
    },
    { lang },
  );
}

export default async function TagPage({ params }: { params: Promise<{ lang: Lang; tag: string }> }) {
  const { lang, tag: rawTag } = await params;
  let tag: string;
  try {
    tag = decodeURIComponent(rawTag);
  } catch {
    notFound();
  }
  const posts = listPostsByTag(lang, tag);
  if (posts.length === 0) notFound();
  const prefix = LANGS[lang].prefix;

  const tagMap = getTagsForPosts(posts.map((p) => p.id), lang);

  const commentMap = getCommentCounts(posts.map((p) => p.id));

  const liked = new Set<number>();
  for (const c of (await cookies()).getAll()) {
    if (c.value === '1') {
      const m = c.name.match(/^liked_(\d+)$/);
      if (m) liked.add(Number(m[1]));
    }
  }

  return (
    <>
      <h1 className="mb-8 text-xl font-bold">{tag}</h1>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: tag,
            url: langUrl(lang, `/tag/${encodeURIComponent(tag)}`),
            itemListElement: posts.slice(0, 20).map((p, i) => {
              const t = parseMulti(p.title_json);
              return {
                '@type': 'ListItem',
                position: i + 1,
                name: t?.[lang] ?? t?.en ?? '',
                url: langUrl(lang, `/page/${p.slug}`),
              };
            }),
          }),
        }}
      />
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
