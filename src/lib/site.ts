import { getSetting } from '@/lib/db';
import { SITE_URL, LANGS, type Lang } from '@/lib/config';

/**
 * 网站对外 URL（server-only）：
 * 后台设置里的 site_url 优先，回退 .env 的 SITE_URL。
 * canonical / sitemap / robots / OG / JSON-LD 全部走这里，改域名不用改代码。
 */
export function siteUrl(): string {
  const v = (getSetting('site_url') ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(v) ? v : SITE_URL;
}

/** 某语言的绝对 URL，如 langUrl('zh', '/page/foo') → https://host/zh/page/foo */
export function langUrl(lang: Lang, path: string): string {
  return `${siteUrl()}${LANGS[lang].prefix}${path}`;
}
