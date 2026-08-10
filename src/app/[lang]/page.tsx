import Link from 'next/link';
import type { Metadata } from 'next';
import { listPublished } from '@/lib/db';
import { LANGS, LANG_KEYS, SITE_NAME, langUrl, parseMulti, type Lang } from '@/lib/config';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  const languages = Object.fromEntries(LANG_KEYS.map((k) => [LANGS[k].hreflang, langUrl(k, '/')]));
  return {
    title: SITE_NAME,
    description: 'Anime character outfit-of-the-day ideas, generated daily.',
    alternates: {
      canonical: langUrl(lang, '/'),
      languages: { ...languages, 'x-default': langUrl('en', '/') },
    },
  };
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

  return (
    <>
      <form action="" method="get" className="mb-8">
        <input
          type="search"
          name="search"
          defaultValue={search ?? ''}
          placeholder="Search..."
          className="w-full rounded-lg border border-neutral-300 px-4 py-2"
        />
      </form>
      {posts.length === 0 && <p className="py-20 text-center text-neutral-400">No posts yet.</p>}
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
