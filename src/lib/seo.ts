import type { Metadata } from 'next';
import { getSetting, setSetting, siteName } from '@/lib/db';
import { SITE_URL, LANGS, type Lang, type MultiLang } from '@/lib/config';

/** Admin-configurable SEO defaults, persisted as JSON in the `seo` settings key. */
export interface SeoConfig {
  description?: Partial<MultiLang>;
  keywords?: Partial<MultiLang>;
  ogImage?: string;
}

const KEY = 'seo';

export function getSeo(): SeoConfig {
  const raw = getSetting(KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SeoConfig;
  } catch {
    return {};
  }
}

export function setSeo(cfg: SeoConfig) {
  setSetting(KEY, JSON.stringify(cfg));
}

/** Absolute image URL: leave http(s):// as-is, else prefix SITE_URL. Undefined if empty. */
export function absImage(p?: string): string | undefined {
  if (!p) return undefined;
  const s = p.trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  return `${SITE_URL}/${s.replace(/^\/+/, '')}`;
}

function titleString(t: Metadata['title']): string | undefined {
  return typeof t === 'string' ? t : undefined;
}

/**
 * Wrap a page's base Metadata with Open Graph + Twitter Card + metadataBase.
 * - description falls back to the admin SEO default (by lang, then en) when the page omits it.
 * - image: page-specific (e.g. a post's image_path) → admin default ogImage → none.
 */
export function withSeo(
  meta: Metadata,
  opts: { lang: Lang; image?: string; type?: 'website' | 'article' },
): Metadata {
  const seo = getSeo();
  const { lang } = opts;
  const desc = meta.description ?? seo.description?.[lang] ?? seo.description?.en;
  const img = absImage(opts.image ?? seo.ogImage);
  const title = titleString(meta.title);
  const canonical =
    typeof meta.alternates?.canonical === 'string' ? meta.alternates.canonical : undefined;

  return {
    ...meta,
    description: desc,
    metadataBase: new URL(SITE_URL),
    openGraph: {
      title,
      description: desc,
      url: canonical,
      siteName: siteName(),
      locale: LANGS[lang].hreflang,
      type: opts.type ?? 'website',
      ...(img ? { images: [{ url: img }] } : {}),
    },
    twitter: {
      card: img ? 'summary_large_image' : 'summary',
      title,
      description: desc,
      ...(img ? { images: [img] } : {}),
    },
  };
}
