import { getDb } from '@/lib/db';
import { siteUrl } from '@/lib/site';
import { SITE_NAME } from '@/lib/config';

export const dynamic = 'force-dynamic';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 从 "YYYY-MM-DD HH:MM:SS"（localtime）转 RFC 822 pubDate。 */
function toRfc822(s: string | null): string {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return d.toUTCString();
}

/** RSS 2.0 feed — 供订阅器与生成式 AI 引擎收录最新卡片。 */
export async function GET() {
  const base = await siteUrl();
  const posts = getDb()
    .prepare(
      `SELECT slug, title_json, desc_json, published_at FROM posts WHERE status = 'published' ORDER BY id DESC LIMIT 30`
    )
    .all() as { slug: string; title_json: string | null; desc_json: string | null; published_at: string | null }[];

  const items = posts.map((p) => {
    let title = p.slug;
    let desc = '';
    try {
      const t = JSON.parse(p.title_json ?? '{}');
      title = t.en ?? t.zh ?? t.jp ?? p.slug;
    } catch {
      /* keep slug */
    }
    try {
      const d = JSON.parse(p.desc_json ?? '{}');
      desc = d.en ?? d.zh ?? '';
    } catch {
      /* keep empty */
    }
    const pub = toRfc822(p.published_at);
    return `    <item>
      <title>${esc(title)}</title>
      <link>${base}/page/${p.slug}</link>
      <guid isPermaLink="true">${base}/page/${p.slug}</guid>
      <description>${esc(desc)}</description>
      ${pub ? `<pubDate>${pub}</pubDate>` : ''}
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_NAME)}</title>
    <link>${base}/</link>
    <description>AI-generated anime character outfit ideas (Anime OOTD)</description>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}
