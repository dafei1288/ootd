import type { MetadataRoute } from 'next';
import { getDb, distinctTags } from '@/lib/db';
import { LANGS, LANG_KEYS, langUrl, type Lang } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getDb()
    .prepare(`SELECT slug, published_at FROM posts WHERE status = 'published' ORDER BY id DESC`)
    .all() as { slug: string; published_at: string | null }[];

  const entries: MetadataRoute.Sitemap = [];

  const homeLangs = Object.fromEntries(LANG_KEYS.map((k) => [LANGS[k].hreflang, langUrl(k, '/')]));
  for (const k of LANG_KEYS) {
    entries.push({ url: langUrl(k, '/'), alternates: { languages: { ...homeLangs, 'x-default': langUrl('en', '/') } } });
  }

  for (const p of posts) {
    const languages = Object.fromEntries(LANG_KEYS.map((k) => [LANGS[k].hreflang, langUrl(k, `/page/${p.slug}`)]));
    for (const k of LANG_KEYS) {
      entries.push({
        url: langUrl(k, `/page/${p.slug}`),
        lastModified: p.published_at ?? undefined,
        alternates: { languages: { ...languages, 'x-default': langUrl('en', `/page/${p.slug}`) } },
      });
    }
  }

  for (const t of distinctTags()) {
    entries.push({ url: langUrl(t.lang as Lang, `/tag/${encodeURIComponent(t.tag)}`) });
  }

  return entries;
}
