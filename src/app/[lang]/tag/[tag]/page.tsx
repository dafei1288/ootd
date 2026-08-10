import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { listPostsByTag } from '@/lib/db';
import { LANGS, SITE_NAME, langUrl, parseMulti, type Lang } from '@/lib/config';

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
  return {
    title: `${tag} | ${SITE_NAME}`,
    alternates: { canonical: langUrl(lang, `/tag/${encodeURIComponent(tag)}`) },
  };
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

  return (
    <>
      <h1 className="mb-8 text-xl font-bold">{tag}</h1>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => {
          const t = parseMulti(p.title_json);
          return (
            <Link
              key={p.id}
              href={`${prefix}/page/${p.slug}`}
              className="group overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 transition hover:shadow-md"
            >
              {p.image_path && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/${p.image_path}`} alt={t?.[lang] ?? ''} className="aspect-square w-full object-cover" />
              )}
              <div className="p-4">
                <h2 className="line-clamp-2 text-sm font-medium group-hover:underline">{t?.[lang] ?? t?.en}</h2>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
