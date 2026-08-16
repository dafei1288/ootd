import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { getPostBySlug, getTagsForPost, siteName } from '@/lib/db';
import { LANGS, LANG_KEYS, langUrl, parseMulti, parseTypedTags, type Lang } from '@/lib/config';
import { withSeo, absImage } from '@/lib/seo';
import { t as ui } from '@/lib/i18n';
import LikeButton from '@/components/LikeButton';
import ShareButton from '@/components/ShareButton';
import Comments from '@/components/Comments';

async function load(params: Promise<{ lang: Lang; slug: string }>) {
  const { lang, slug } = await params;
  const post = getPostBySlug(slug);
  return { lang, slug, post };
}

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang; slug: string }> }): Promise<Metadata> {
  const { lang, slug, post } = await load(params);
  if (!post) return {};
  const t = parseMulti(post.title_json);
  const d = parseMulti(post.desc_json);
  const g = parseTypedTags(post.tags_json);
  const languages = Object.fromEntries(LANG_KEYS.map((k) => [LANGS[k].hreflang, langUrl(k, `/page/${slug}`)]));
  return withSeo(
    {
      title: t?.[lang] ?? t?.en,
      description: d?.[lang] ?? d?.en,
      keywords: g ? `${g.char[lang] ?? g.char.en},${g.style[lang] ?? g.style.en}` : undefined,
      alternates: {
        canonical: langUrl(lang, `/page/${slug}`),
        languages: { ...languages, 'x-default': langUrl('en', `/page/${slug}`) },
      },
    },
    { lang, image: post.image_path ?? undefined, type: 'article' },
  );
}

export default async function PostPage({ params }: { params: Promise<{ lang: Lang; slug: string }> }) {
  const { lang, slug, post } = await load(params);
  if (!post) notFound();
  const t = parseMulti(post.title_json);
  const b = parseMulti(post.body_json);
  const d = parseMulti(post.desc_json);
  const tags = getTagsForPost(post.id, lang);
  const prefix = LANGS[lang].prefix;
  const liked = (await cookies()).get(`liked_${post.id}`)?.value === '1';

  return (
    <article className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: t?.[lang] ?? t?.en,
            description: d?.[lang] ?? d?.en,
            image: absImage(post.image_path ?? undefined),
            datePublished: post.published_at ?? undefined,
            author: { '@type': 'Organization', name: siteName() },
            publisher: { '@type': 'Organization', name: siteName() },
            mainEntityOfPage: { '@type': 'WebPage', '@id': langUrl(lang, `/page/${slug}`) },
          }),
        }}
      />
      <h1 className="mb-6 text-2xl font-bold leading-snug">{t?.[lang] ?? t?.en}</h1>
      {post.image_path && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/${post.image_path}`} alt={t?.[lang] ?? ''} className="mb-8 w-full rounded-xl object-cover" />
      )}
      <div
        className="prose max-w-none leading-7 [&>p]:mb-4"
        dangerouslySetInnerHTML={{ __html: b?.[lang] ?? b?.en ?? '' }}
      />
      <div className="mt-8 flex items-center gap-3">
        <LikeButton id={post.id} count={post.likes} liked={liked} ariaLabel={ui('like.aria', lang)} />
        <ShareButton
          url={langUrl(lang, `/page/${slug}`)}
          title={t?.[lang] ?? t?.en}
          label={ui('share.label', lang)}
          copiedText={ui('share.copied', lang)}
          failedText={ui('share.failed', lang)}
        />
      </div>
      {tags.length > 0 && (
        <div className="mt-10 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`${prefix}/tag/${encodeURIComponent(tag)}`}
              className="rounded-full bg-neutral-200 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-300"
            >
              {tag}
            </Link>
          ))}
        </div>
      )}
      <Comments postId={post.id} lang={lang} />
    </article>
  );
}
