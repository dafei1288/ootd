import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteUrl();
  return {
    rules: [
      // 生成式 AI「答案引擎」爬虫：显式放行，让 ChatGPT/Perplexity/Claude/Google AI Overviews 能引用本站内容
      {
        userAgent: [
          'GPTBot',
          'OAI-SearchBot',
          'ChatGPT-User',
          'PerplexityBot',
          'ClaudeBot',
          'Claude-Web',
          'Google-Extended',
          'Applebot-Extended',
          'Bingbot',
        ],
        allow: '/',
      },
      // 纯训练型爬虫：不产生引用、只消耗带宽，屏蔽
      {
        userAgent: ['CCBot', 'Bytespider', 'Amazonbot', 'meta-externalagent', 'ImagesiftBot'],
        disallow: '/',
      },
      // 兜底：其余全部允许，仅屏蔽后台与 API
      { userAgent: '*', allow: '/', disallow: ['/admin_config', '/api'] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
