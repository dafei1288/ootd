import { getDb } from '@/lib/db';
import { siteUrl } from '@/lib/site';
import { LANGS, LANG_KEYS } from '@/lib/config';

export const dynamic = 'force-dynamic';

/** llms.txt — 生成式 AI 引擎（ChatGPT/Perplexity/Claude 等）读取站点的标准入口。 */
export async function GET() {
  const base = await siteUrl();
  const posts = getDb()
    .prepare(`SELECT slug, title_json FROM posts WHERE status = 'published' ORDER BY id DESC LIMIT 20`)
    .all() as { slug: string; title_json: string | null }[];

  const lines = [
    `# ${LANGS.en.name}`,
    ``,
    `> Anime OOTD — AI 生成的动漫角色穿搭灵感站。每张卡片 = 一个角色 + 一套完整穿搭（上衣/下装/鞋/配饰），含 5 语言标题、描述与正文。`,
    `> Anime OOTD is a multilingual gallery of AI-generated anime character outfit ideas. Each card features one character with a complete look (top/bottom/shoes/accessories), with titles, descriptions and body in 5 languages.`,
    ``,
    `## Key pages`,
    ...LANG_KEYS.map((k) => `- [${LANGS[k].name} homepage](${base}${LANGS[k].prefix}/)`),
    `- [Try-on room (试衣间)](${base}/tryon)`,
    `- [Wish pool (许愿池)](${base}/wish)`,
    `- [RSS feed](${base}/feed.xml)`,
    `- [Sitemap](${base}/sitemap.xml)`,
    ``,
    `## Latest cards`,
    ...posts.map((p) => {
      let title = p.slug;
      try {
        const t = JSON.parse(p.title_json ?? '{}');
        title = t.en ?? t.zh ?? p.slug;
      } catch {
        /* keep slug */
      }
      return `- [${title}](${base}/page/${p.slug})`;
    }),
  ];

  return new Response(lines.join('\n') + '\n', {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
