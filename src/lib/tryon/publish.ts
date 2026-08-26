import { chatJSON } from '../pipeline/steps';
import { getEnabledTryonItems } from '../db';
import { LANG_KEYS, parseMulti, type Lang, type MultiLang, type TypedTags } from '../config';
import { itemName } from './catalog';

/**
 * 试衣间卡片内容生成：
 * - title/char/style 优先走 LLM（用户给了标题则以用户标题为锚翻译成 5 语言）
 * - desc/body 用多语言模板（免费、稳定；详情页对缺失内容本就容错）
 * - LLM 失败时兜底用素材名拼标题，保证发布流程永不因 LLM 挂掉
 */

const SCHEMA = '{"en":"","zh":"","jp":"","kr":"","es":""}';

interface CardContent {
  title: MultiLang;
  char: MultiLang;
  style: MultiLang;
}

function assertMultiLang(o: unknown): MultiLang {
  const m = o as Record<string, unknown>;
  const out = {} as MultiLang;
  for (const k of LANG_KEYS) {
    const v = typeof m[k] === 'string' ? (m[k] as string).trim() : '';
    out[k] = v;
  }
  // 至少保证一种语言可用（缺的用 en 或 zh 兜底）
  const anchor = out.en || out.zh;
  if (!anchor) throw new Error('empty multilang');
  for (const k of LANG_KEYS) if (!out[k]) out[k] = anchor;
  return out;
}

function parseContent(raw: CardContent): { titleJson: string; tagsJson: string } {
  const title = assertMultiLang(raw.title);
  const char = assertMultiLang(raw.char);
  const style = assertMultiLang(raw.style);
  return {
    titleJson: JSON.stringify(title),
    tagsJson: JSON.stringify({ char, style } satisfies TypedTags),
  };
}

/** 素材的多语言展示（供 LLM 理解 + 模板正文）。 */
function itemLines(itemIds: number[]): { list: string; zh: string; perLang: Record<Lang, string> } {
  const items = getEnabledTryonItems(itemIds);
  const perLang = {} as Record<Lang, string>;
  for (const k of LANG_KEYS) perLang[k] = items.map((it) => itemName(it, k)).join(' · ');
  const zh = perLang.zh || items.map((it) => it.name).join(' · ');
  const list = items
    .map((it) => `${it.name} / ${parseMulti(it.names_json)?.en ?? ''}`)
    .join('、');
  return { list: list || '未选择素材', zh, perLang };
}

/** LLM 生成标题+标签；失败时兜底。 */
export async function genCardContent(
  itemIds: number[],
  userTitle?: string
): Promise<{ titleJson: string; tagsJson: string; summary: string }> {
  const { list, zh } = itemLines(itemIds);
  const user = (userTitle ?? '').trim();
  const userLine = user ? `\n用户提供的标题（必须以其为核心展开并翻译成各语言）：${user}` : '';

  try {
    const r = await chatJSON<CardContent>(
      'tryon-card',
      '你是时尚穿搭编辑，擅长给穿搭起标题和打标签。',
      `用户在试衣间选择了以下素材：${list}${userLine}\n\n请生成：\n1. title：一句吸引人的穿搭标题，包含核心单品/造型/风格（若用户给了标题则以其为核心）；\n2. char：出场"人物"标签（模特/造型类型，如银发双马尾少女）；\n3. style：穿搭/服装/配饰/风格标签，3~5 个，用英文逗号分隔。\n所有字段输出 en/zh/jp/kr/es 五种语言。只输出 JSON，格式：{"title":${SCHEMA},"char":${SCHEMA},"style":${SCHEMA}}`
    );
    return { ...parseContent(r), summary: zh };
  } catch {
    // 兜底：素材名拼接（不阻塞发布）
    const t = {} as MultiLang;
    for (const k of LANG_KEYS) t[k] = `${perLangTitle(k, itemLines(itemIds).perLang[k])}`;
    const tags = {
      char: allLangs(zh),
      style: { en: 'outfit,fashion', zh: '穿搭,时尚', jp: 'コーデ,ファッション', kr: '코디,패션', es: 'outfit,moda' },
    } as unknown as TypedTags;
    return {
      titleJson: JSON.stringify(t),
      tagsJson: JSON.stringify(tags),
      summary: zh,
    };
  }
}

function perLangTitle(k: Lang, names: string): string {
  const heads: Record<Lang, string> = {
    en: 'A stylish look with',
    zh: '时尚穿搭：',
    jp: 'おしゃれコーデ：',
    kr: '스타일리시 코디:',
    es: 'Look elegante con',
  };
  return `${heads[k]} ${names}`;
}

function allLangs(zh: string): MultiLang {
  const heads: Record<Lang, string> = {
    en: 'Fitting Room Model',
    zh: '试衣间模特',
    jp: '試着室モデル',
    kr: '피팅룸 모델',
    es: 'Modelo del Probador',
  };
  const out = {} as MultiLang;
  for (const k of LANG_KEYS) out[k] = `${heads[k]}:${zh}`.slice(0, 50);
  return out;
}

/** desc/body 多语言模板。 */
export function buildCardBody(itemIds: number[]): { descJson: string; bodyJson: string } {
  const { perLang } = itemLines(itemIds);
  const desc = {} as MultiLang;
  const body = {} as MultiLang;
  for (const k of LANG_KEYS) {
    const names = perLang[k];
    desc[k] = descTpl(k, names);
    body[k] = `<p>${bodyTpl(k, names)}</p>`;
  }
  return { descJson: JSON.stringify(desc), bodyJson: JSON.stringify(body) };
}

function descTpl(k: Lang, names: string): string {
  const t: Record<Lang, string> = {
    en: `A fashion look generated in the Fitting Room with ${names}.`,
    zh: `在试衣间用 ${names} 生成的时尚穿搭。`,
    jp: `試着室で ${names} を使って作られたファッションコーデ。`,
    kr: `피팅룸에서 ${names} 으로 만든 패션 코디.`,
    es: `Un look de moda creado en el Probador con ${names}.`,
  };
  return t[k];
}

function bodyTpl(k: Lang, names: string): string {
  const t: Record<Lang, string> = {
    en: `This look was put together in the Fitting Room with ${names}. Pick your own model, outfit and scene to create yours.`,
    zh: `这套穿搭来自试衣间：${names}。选你的模特、衣服和场景，搭出属于自己的一套。`,
    jp: `このコーデは試着室で ${names} を組み合わせて完成。モデルと服と背景を選んで、自分だけのコーデを作ろう。`,
    kr: `이 코디는 피팅룸에서 ${names} 으로 완성됐어요. 모델과 옷, 배경을 골라 나만의 코디를 만들어 보세요.`,
    es: `Este look se creó en el Probador con ${names}. Elige tu modelo, prendas y escenario para crear el tuyo.`,
  };
  return t[k];
}
