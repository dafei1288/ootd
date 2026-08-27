import type { Metadata } from 'next';
import { getSetting, setSetting, siteName } from '@/lib/db';
import { LANGS, LANG_KEYS, type Lang, type MultiLang } from '@/lib/config';
import { siteUrl } from '@/lib/site';

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

/** Absolute image URL: leave http(s):// as-is, else prefix siteUrl(). Undefined if empty. */
export async function absImage(p?: string): Promise<string | undefined> {
  if (!p) return undefined;
  const s = p.trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  return `${await siteUrl()}/${s.replace(/^\/+/, '')}`;
}

function titleString(t: Metadata['title']): string | undefined {
  return typeof t === 'string' ? t : undefined;
}

/**
 * Wrap a page's base Metadata with Open Graph + Twitter Card + metadataBase.
 * - description falls back to the admin SEO default (by lang, then en) when the page omits it.
 * - image: page-specific (e.g. a post's image_path) → admin default ogImage → none.
 */
export async function withSeo(
  meta: Metadata,
  opts: { lang: Lang; image?: string; type?: 'website' | 'article' },
): Promise<Metadata> {
  const seo = getSeo();
  const { lang } = opts;
  const base = await siteUrl();
  const desc = meta.description ?? seo.description?.[lang] ?? seo.description?.en;
  const img = await absImage(opts.image ?? seo.ogImage);
  const title = titleString(meta.title);
  const canonical =
    typeof meta.alternates?.canonical === 'string' ? meta.alternates.canonical : undefined;

  return {
    ...meta,
    description: desc,
    metadataBase: new URL(base),
    // max-image-preview:large — Google AI Overviews 等生成式结果可直接使用大图
    robots: { index: true, follow: true, 'max-image-preview': 'large' },
    openGraph: {
      title,
      description: desc,
      url: canonical,
      siteName: siteName(),
      locale: LANGS[lang].hreflang,
      // 社交平台按地区/语言本地化：列出其余语言的 og:locale
      alternateLocale: LANG_KEYS.filter((k) => k !== lang).map((k) => LANGS[k].hreflang),
      type: opts.type ?? 'website',
      ...(img ? { images: [{ url: img, alt: title }] } : {}),
    },
    twitter: {
      card: img ? 'summary_large_image' : 'summary',
      title,
      description: desc,
      ...(img ? { images: [img] } : {}),
    },
  };
}
