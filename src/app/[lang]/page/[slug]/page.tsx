import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPostBySlug, getTagsForPost } from '@/lib/db';
import { LANGS, LANG_KEYS, SITE_NAME, langUrl, parseMulti, parseTypedTags, type Lang } from '@/lib/config';

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
  return {
    title: t?.[lang] ?? t?.en,
    description: d?.[lang] ?? d?.en,
    keywords: g ? `${g.char[lang] ?? g.char.en},${g.style[lang] ?? g.style.en}` : undefined,
    alternates: {
      canonical: langUrl(lang, `/page/${slug}`),
      languages: { ...languages, 'x-default': langUrl('en', `/page/${slug}`) },
    },
  };
}

export default async function PostPage({ params }: { params: Promise<{ lang: Lang; slug: string }> }) {
  const { lang, post } = await load(params);
  if (!post) notFound();
  const t = parseMulti(post.title_json);
  const b = parseMulti(post.body_json);
  const tags = getTagsForPost(post.id, lang);
  const prefix = LANGS[lang].prefix;

  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold leading-snug">{t?.[lang] ?? t?.en}</h1>
      {post.image_path && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/${post.image_path}`} alt={t?.[lang] ?? ''} className="mb-8 w-full rounded-xl object-cover" />
      )}
      <div
        className="prose max-w-none leading-7 [&>p]:mb-4"
        dangerouslySetInnerHTML={{ __html: b?.[lang] ?? b?.en ?? '' }}
      />
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
    </article>
  );
}
