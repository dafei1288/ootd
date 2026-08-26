export const LANGS = {
  en: { prefix: '', hreflang: 'en', name: 'English' },
  zh: { prefix: '/zh', hreflang: 'zh', name: '简体中文' },
  jp: { prefix: '/jp', hreflang: 'ja', name: '日本語' },
  kr: { prefix: '/kr', hreflang: 'ko', name: '한국어' },
  es: { prefix: '/es', hreflang: 'es', name: 'Español' },
} as const;

export type Lang = keyof typeof LANGS;
export const LANG_KEYS = Object.keys(LANGS) as Lang[];
export const DEFAULT_LANG: Lang = 'en';

export type MultiLang = Record<Lang, string>;

// strip any trailing slash(es) so `${SITE_URL}${path}` never yields a double slash,
// which breaks crawlers (e.g. WeChat won't render a link card for //images/x.png).
export const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
export const SITE_NAME = 'Anime OOTD';

// ICP 备案号 + 版权信息：留空时 footer 不显示。仅服务端读取（footer 是 server component）。
export const ICP = process.env.ICP?.trim() ?? '';
export const COPYRIGHT = process.env.COPYRIGHT?.trim() ?? '';

export function langUrl(lang: Lang, path: string): string {
  return `${SITE_URL}${LANGS[lang].prefix}${path}`;
}

export function parseMulti(json: string | null): MultiLang | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as MultiLang;
  } catch {
    return null;
  }
}

export type TypedTags = { char: MultiLang; style: MultiLang };

export function parseTypedTags(json: string | null): TypedTags | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as TypedTags;
    return o.char && o.style ? o : null;
  } catch {
    return null;
  }
}

// ¥ / 1M tokens(deepseek 价为估计值,以官方账单为准;文本成本占比极小)
export const TEXT_PRICES: Record<string, { input: number; output: number }> = {
  'deepseek-v4-flash': { input: 1, output: 2 },
  'deepseek-v4-pro': { input: 3, output: 6 },
};

// ¥:数字 = 固定价/张;{input,output} = 按 token 计费(dmxapi 2026-08 实价,6.8折后)
export const IMAGE_PRICES: Record<string, number | { input: number; output: number }> = {
  'gpt-image-2': { input: 24.82, output: 148.92 },
  'doubao-seedream-4-5-251128': 0.25,
};

// --- try-on room (试衣间) runtime defaults; overridable via settings table (admin) ---

export const TRYON_DEFAULTS = {
  enabled: true,
  perUserDaily: 3, // 每人每天免费生成次数
  dailyBudgetCny: 50, // 每日全局成本熔断上限(元)
  maxPendingPerUser: 1, // 同一用户同时最多待生成任务数
  estimateCnyPerImage: 0.3, // 生成前预估单张成本(元),用于预算熔断预判
} as const;
