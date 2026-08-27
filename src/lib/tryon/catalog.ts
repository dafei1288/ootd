import fs from 'node:fs';
import path from 'node:path';
import {
  countTryonItems,
  getEnabledTryonItems,
  getDb,
  insertTryonItem,
  listEnabledTryonItems,
  updateTryonItem,
  IMAGES_DIR,
  type TryonItem,
  type TryonItemType,
} from '../db';
import { parseMulti, type Lang, type MultiLang } from '../config';

/**
 * 试衣间素材库：查询 + prompt 组装 + 种子数据。
 * prompt 片段全部为英文（直接喂给文生图模型），name/emoji 用于前端展示。
 */

export function enabledCatalog(): Record<TryonItemType, TryonItem[]> {
  const items = listEnabledTryonItems();
  const out = {
    model: [],
    top: [],
    bottom: [],
    dress: [],
    accessory: [],
    scene: [],
    style: [],
  } as Record<TryonItemType, TryonItem[]>;
  for (const it of items) out[it.type].push(it);
  return out;
}

const TYPE_LABEL: Record<TryonItemType, string> = {
  model: '模特',
  top: '上衣',
  bottom: '下装',
  dress: '连衣裙',
  accessory: '配饰',
  scene: '场景',
  style: '画风',
};

export { TYPE_LABEL };

/** English list join: ["a", "b", "c"] -> "a, b and c" */
function joinEn(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

const DEFAULT_MODEL = 'a stylish young woman';
const DEFAULT_SCENE = 'in a stylish urban setting';

/**
 * Assemble the final image prompt from selected item ids.
 * Order: style → model → clothing → accessories → scene. Throws on invalid selection.
 */
export function buildPrompt(ids: number[]): string {
  const items = getEnabledTryonItems(ids);
  if (items.length === 0) throw new Error('请至少选择一件衣服和一种画风');

  const style = items.find((i) => i.type === 'style')?.prompt;
  if (!style) throw new Error('请选择画风');

  const model = items.find((i) => i.type === 'model')?.prompt ?? DEFAULT_MODEL;
  const scene = items.find((i) => i.type === 'scene')?.prompt ?? DEFAULT_SCENE;

  const clothing = items
    .filter((i) => i.type === 'top' || i.type === 'bottom' || i.type === 'dress')
    .map((i) => i.prompt);
  if (clothing.length === 0) throw new Error('请至少选择一件衣服');

  const accessories = items.filter((i) => i.type === 'accessory').map((i) => i.prompt);

  const wearing = `wearing ${joinEn(clothing)}`;
  const acc = accessories.length > 0 ? `, accessorized with ${joinEn(accessories)}` : '';

  return `${style} Full body fashion lookbook photo. ${model} ${wearing}${acc}. Setting: ${scene}. Head to toe visible, fashion magazine quality, highly detailed.`;
}

/** Validate a selection shape (used by the submit guard before prompt building). */
export function validateSelection(ids: number[]): { ok: true } | { ok: false; reason: string } {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, reason: 'invalid' };
  if (ids.length > 20) return { ok: false, reason: 'invalid' };
  for (const id of ids) {
    // ids must be positive integers; content requirements are checked in buildPrompt.
    if (!Number.isInteger(id) || id <= 0) return { ok: false, reason: 'invalid' };
  }
  return { ok: true };
}

/** 素材的展示名（按当前语言；缺失时回退 en → 中文名）。 */
export function itemName(it: Pick<TryonItem, 'name' | 'names_json'>, lang: Lang): string {
  const m = parseMulti(it.names_json);
  if (m) return m[lang]?.trim() || m.en?.trim() || it.name;
  return it.name;
}

// ---------------------------------------------------------------------------
// 参考图（B 档：按图组合生成）——素材图按画风拆分，生成时按选中画风取用
// ---------------------------------------------------------------------------

export type StyleKind = 'anime' | 'real';

/** 从选中素材里判断画风（style 素材的名称/prompt 含关键词）；缺省 anime。 */
export function styleKindOf(items: Pick<TryonItem, 'type' | 'name' | 'prompt'>[]): StyleKind {
  const s = items.find((i) => i.type === 'style');
  const text = `${s?.name ?? ''} ${s?.prompt ?? ''}`.toLowerCase();
  if (/photo|real|photoreal|写实|真人/.test(text)) return 'real';
  return 'anime';
}

/** 某素材在指定画风下的参考图（画风图缺失时回退通用图）。 */
export function refImageFor(it: TryonItem, kind: StyleKind): string | null {
  if (kind === 'real') return it.image_path_real ?? it.image_path;
  return it.image_path_anime ?? it.image_path;
}

const REF_MAX = 6; // seedream 多参考图上限，防止元素过多崩图

// 参考图优先级：人物形象 → 场景 → 服装 → 配饰（先保主体，配饰后补）
const REF_ORDER: Record<TryonItemType, number> = {
  model: 0,
  scene: 1,
  top: 2,
  bottom: 2,
  dress: 2,
  accessory: 3,
  style: 9,
};

/**
 * 收集选中素材的参考图（data URL 数组，最多 REF_MAX 张）。
 * 跳过 style（画风是文字风格，不参与按图组合）；model/scene 也纳入参考。
 */
export function collectRefImages(ids: number[], kind: StyleKind): string[] {
  const items = [...getEnabledTryonItems(ids)].sort((a, b) => REF_ORDER[a.type] - REF_ORDER[b.type]);
  const out: string[] = [];
  for (const it of items) {
    if (it.type === 'style') continue;
    const rel = refImageFor(it, kind);
    if (!rel) continue;
    try {
      const file = path.join(IMAGES_DIR, rel.split('/').pop() ?? rel);
      const buf = fs.readFileSync(file);
      out.push(`data:image/png;base64,${buf.toString('base64')}`);
      if (out.length >= REF_MAX) break;
    } catch {
      /* 文件缺失跳过 */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 种子素材库（先手写一套验证效果，后续可在 admin 里增改）
// 描述用中性词（不写 anime/realistic），画风由 style 项控制，两套画风都适用。
// ---------------------------------------------------------------------------

interface SeedItem {
  type: TryonItemType;
  name: string; // 中文名（同时作为 zh 语言名）
  emoji: string;
  prompt: string;
  names: Omit<MultiLang, 'zh'>; // 其他 4 语言名
}

const SEED: SeedItem[] = [
  // 画风
  { type: 'style', name: '动漫插画风', emoji: '🎨', prompt: 'Anime illustration style, cel shading, clean line art, vibrant colors, high quality anime key visual, detailed fabric and accessories.', names: { en: 'Anime Illustration', jp: 'アニメイラスト風', kr: '애니메 일러스트풍', es: 'Ilustración anime' } },
  { type: 'style', name: '真人摄影风', emoji: '📷', prompt: 'Photorealistic fashion photography, natural skin texture, realistic fabric and lighting, studio quality, ultra detailed, 8k.', names: { en: 'Photorealistic', jp: 'リアル写真風', kr: '실사 사진풍', es: 'Fotografía realista' } },
  // 模特
  { type: 'model', name: '银发双马尾少女', emoji: '🦊', prompt: 'a petite girl with long silver twin tails and bright blue eyes', names: { en: 'Silver Twin-Tail Girl', jp: '銀髪ツインテールの少女', kr: '은발 트윈테일 소녀', es: 'Chica de coletas plateadas' } },
  { type: 'model', name: '黑长直御姐', emoji: '👩', prompt: 'a tall elegant woman with long straight black hair and calm amber eyes', names: { en: 'Elegant Black Hair', jp: '黒髪ロングのクール美女', kr: '흑발 롱헤어 누님', es: 'Elegante de pelo negro largo' } },
  { type: 'model', name: '金发卷发甜妹', emoji: '🌼', prompt: 'a sweet girl with golden wavy hair and hazel eyes', names: { en: 'Sweet Golden Waves', jp: '金髪ウェーブの甘め女子', kr: '금발 웨이브 소녀', es: 'Chica dulce de ondas doradas' } },
  { type: 'model', name: '蓝发酷女孩', emoji: '🎧', prompt: 'a cool tomboyish girl with short blue hair and a confident smile', names: { en: 'Cool Blue-Hair Girl', jp: '青髪のクール系女子', kr: '파란 머리 쿨 걸', es: 'Chica cool de pelo azul' } },
  { type: 'model', name: '棕发邻家女孩', emoji: '🍑', prompt: 'a friendly girl-next-door with a brown bob haircut and a gentle smile', names: { en: 'Girl Next Door', jp: '茶髪ボブの隣の女の子', kr: '갈색 단발 옆집 소녀', es: 'Chica de al lado (bob castaño)' } },
  { type: 'model', name: '红发辣妹', emoji: '🔥', prompt: 'an energetic girl with wavy red hair and freckles', names: { en: 'Fiery Red-Hair Girl', jp: '赤髪のギャル', kr: '빨간 머리 걸', es: 'Chica ardiente de pelo rojo' } },
  // 上衣
  { type: 'top', name: '白衬衫', emoji: '⚪', prompt: 'a crisp white button-up shirt', names: { en: 'White Shirt', jp: '白シャツ', kr: '흰 셔츠', es: 'Camisa blanca' } },
  { type: 'top', name: 'Oversize 卫衣', emoji: '🧥', prompt: 'an oversized gray hoodie', names: { en: 'Oversized Hoodie', jp: 'オーバーサイズパーカー', kr: '오버사이즈 후드티', es: 'Sudadera oversized' } },
  { type: 'top', name: '格纹衬衫', emoji: '🟥', prompt: 'a red plaid flannel shirt', names: { en: 'Plaid Shirt', jp: 'チェックシャツ', kr: '체크 셔츠', es: 'Camisa de cuadros' } },
  { type: 'top', name: '针织开衫', emoji: '🧶', prompt: 'a soft cream knit cardigan', names: { en: 'Knit Cardigan', jp: 'ニットカーディガン', kr: '니트 가디건', es: 'Cárdigan de punto' } },
  { type: 'top', name: '条纹露肩针织衫', emoji: '👗', prompt: 'an off-shoulder striped knit top', names: { en: 'Off-Shoulder Knit', jp: 'ストライプオフショルニット', kr: '스트라이프 오프숄더 니트', es: 'Punto off-shoulder' } },
  { type: 'top', name: '印花 T 恤', emoji: '👕', prompt: 'a graphic band t-shirt', names: { en: 'Graphic Tee', jp: 'グラフィックTシャツ', kr: '그래픽 티셔츠', es: 'Camiseta gráfica' } },
  { type: 'top', name: '黑色西装外套', emoji: '🧷', prompt: 'a tailored black blazer', names: { en: 'Black Blazer', jp: '黒テーラードジャケット', kr: '블랙 블레이저', es: 'Blazer negro' } },
  { type: 'top', name: '皮夹克', emoji: '🪖', prompt: 'a classic black leather jacket', names: { en: 'Leather Jacket', jp: 'レザージャケット', kr: '가죽 자켓', es: 'Chaqueta de cuero' } },
  { type: 'top', name: '水手服上衣', emoji: '⚓', prompt: 'a sailor school uniform top with a red neckerchief', names: { en: 'Sailor Top', jp: 'セーラー服の上着', kr: '세일러복 상의', es: 'Blusa marinera' } },
  { type: 'top', name: '汉服上衣', emoji: '🎐', prompt: 'a traditional hanfu top with wide sleeves', names: { en: 'Hanfu Top', jp: '漢服トップス', kr: '한푸 상의', es: 'Parte superior hanfu' } },
  // 下装
  { type: 'bottom', name: '浅色牛仔裤', emoji: '👖', prompt: 'light blue skinny jeans', names: { en: 'Light Blue Jeans', jp: 'ライトブルージーンズ', kr: '연청 데님 팬츠', es: 'Vaqueros azul claro' } },
  { type: 'bottom', name: '格纹百褶裙', emoji: '👗', prompt: 'a pleated plaid miniskirt', names: { en: 'Pleated Skirt', jp: 'チェックプリーツスカート', kr: '체크 플리츠 스커트', es: 'Falda plisada' } },
  { type: 'bottom', name: 'A 字短裙', emoji: '🎀', prompt: 'an A-line denim skirt', names: { en: 'A-Line Skirt', jp: 'Aラインスカート', kr: 'A라인 스커트', es: 'Falda línea A' } },
  { type: 'bottom', name: '高腰阔腿裤', emoji: '👖', prompt: 'high-waisted wide-leg trousers', names: { en: 'Wide-Leg Pants', jp: 'ハイウエストワイドパンツ', kr: '하이웨스트 와이드 팬츠', es: 'Pantalones anchos' } },
  { type: 'bottom', name: '黑色紧身裤', emoji: '🖤', prompt: 'black leggings', names: { en: 'Black Leggings', jp: '黒レギンス', kr: '블랙 레깅스', es: 'Leggings negros' } },
  { type: 'bottom', name: '碎花半身长裙', emoji: '🌸', prompt: 'a flowing floral midi skirt', names: { en: 'Floral Midi Skirt', jp: '花柄ミディスカート', kr: '플라워 미디 스커트', es: 'Falda midi floral' } },
  { type: 'bottom', name: '工装裤', emoji: '🪖', prompt: 'olive green cargo pants', names: { en: 'Cargo Pants', jp: 'カーゴパンツ', kr: '카고 팬츠', es: 'Pantalones cargo' } },
  { type: 'bottom', name: '运动短裤', emoji: '🩳', prompt: 'white athletic shorts', names: { en: 'Athletic Shorts', jp: 'スポーツショートパンツ', kr: '스포츠 반바지', es: 'Shorts deportivos' } },
  // 连衣裙
  { type: 'dress', name: '碎花连衣裙', emoji: '🌸', prompt: 'a floral sundress', names: { en: 'Floral Sundress', jp: '花柄ワンピース', kr: '플라워 원피스', es: 'Vestido floral' } },
  { type: 'dress', name: '小黑裙', emoji: '⚫', prompt: 'a little black cocktail dress', names: { en: 'Little Black Dress', jp: 'リトルブラックドレス', kr: '리틀 블랙 드레스', es: 'Vestidito negro' } },
  { type: 'dress', name: '洛丽塔裙', emoji: '🎀', prompt: 'a frilly Lolita dress with lace and ribbons', names: { en: 'Lolita Dress', jp: 'ロリータドレス', kr: '로리타 드레스', es: 'Vestido lolita' } },
  { type: 'dress', name: '礼服长裙', emoji: '✨', prompt: 'an elegant floor-length evening gown', names: { en: 'Evening Gown', jp: 'イブニングドレス', kr: '이브닝 드레스', es: 'Vestido de noche' } },
  { type: 'dress', name: '和服', emoji: '🎏', prompt: 'a traditional Japanese kimono with an obi belt', names: { en: 'Kimono', jp: '着物', kr: '기모노', es: 'Kimono' } },
  { type: 'dress', name: '汉服长裙', emoji: '🏮', prompt: 'a flowing traditional hanfu dress', names: { en: 'Hanfu Dress', jp: '漢服ドレス', kr: '한푸 드레스', es: 'Vestido hanfu' } },
  { type: 'dress', name: '吊带连衣裙', emoji: '👗', prompt: 'a simple slip dress', names: { en: 'Slip Dress', jp: 'スリップドレス', kr: '슬립 드레스', es: 'Vestido lencero' } },
  // 配饰
  { type: 'accessory', name: '贝雷帽', emoji: '🎩', prompt: 'a black beret', names: { en: 'Beret', jp: 'ベレー帽', kr: '베레모', es: 'Boina' } },
  { type: 'accessory', name: '棒球帽', emoji: '🧢', prompt: 'a red baseball cap', names: { en: 'Baseball Cap', jp: 'キャップ', kr: '야구모자', es: 'Gorra' } },
  { type: 'accessory', name: '圆框眼镜', emoji: '🤓', prompt: 'round-frame glasses', names: { en: 'Round Glasses', jp: '丸メガネ', kr: '동그란 안경', es: 'Gafas redondas' } },
  { type: 'accessory', name: '珍珠项链', emoji: '📿', prompt: 'a pearl necklace', names: { en: 'Pearl Necklace', jp: 'パールネックレス', kr: '진주 목걸이', es: 'Collar de perlas' } },
  { type: 'accessory', name: '斜挎包', emoji: '👜', prompt: 'a small crossbody bag', names: { en: 'Crossbody Bag', jp: 'ショルダーバッグ', kr: '크로스백', es: 'Bolso bandolera' } },
  { type: 'accessory', name: '帆布包', emoji: '🎒', prompt: 'a canvas tote bag', names: { en: 'Canvas Tote', jp: 'キャンバストート', kr: '캔버스 토트백', es: 'Bolso de lona' } },
  { type: 'accessory', name: '耳环', emoji: '💍', prompt: 'dainty earrings', names: { en: 'Earrings', jp: 'イヤリング', kr: '귀걸이', es: 'Pendientes' } },
  { type: 'accessory', name: '围巾', emoji: '🧣', prompt: 'a cozy knit scarf', names: { en: 'Scarf', jp: 'マフラー', kr: '목도리', es: 'Bufanda' } },
  { type: 'accessory', name: '发带', emoji: '🎀', prompt: 'a satin ribbon headband', names: { en: 'Ribbon Headband', jp: 'リボンカチューシャ', kr: '리본 머리띠', es: 'Diadema de cinta' } },
  { type: 'accessory', name: '露指手套', emoji: '🧤', prompt: 'fingerless gloves', names: { en: 'Fingerless Gloves', jp: 'フィンガーレスグローブ', kr: '핑거리스 장갑', es: 'Guantes sin dedos' } },
  // 场景
  { type: 'scene', name: '城市街头', emoji: '🏙️', prompt: 'on a busy city street, urban backdrop', names: { en: 'City Street', jp: '街中', kr: '도시 거리', es: 'Calle urbana' } },
  { type: 'scene', name: '咖啡店', emoji: '☕', prompt: 'inside a cozy cafe with warm lighting', names: { en: 'Cozy Cafe', jp: 'カフェ', kr: '카페', es: 'Cafetería' } },
  { type: 'scene', name: '教室', emoji: '🏫', prompt: 'in a bright school classroom', names: { en: 'Classroom', jp: '教室', kr: '교실', es: 'Aula' } },
  { type: 'scene', name: '天台黄昏', emoji: '🌇', prompt: 'on a rooftop at golden hour', names: { en: 'Rooftop at Dusk', jp: '夕暮れの屋上', kr: '황혼의 옥상', es: 'Azotea al atardecer' } },
  { type: 'scene', name: '海边', emoji: '🏖️', prompt: 'at a sunny seaside with ocean breeze', names: { en: 'Seaside', jp: '海辺', kr: '바닷가', es: 'Playa' } },
  { type: 'scene', name: '樱花大道', emoji: '🌸', prompt: 'under blooming cherry blossom trees', names: { en: 'Cherry Blossoms', jp: '桜並木', kr: '벚꽃길', es: 'Cerezos en flor' } },
  { type: 'scene', name: '雪景', emoji: '❄️', prompt: 'in a snowy winter landscape', names: { en: 'Snowy Scene', jp: '雪景色', kr: '설경', es: 'Paisaje nevado' } },
  { type: 'scene', name: '棚拍纯色背景', emoji: '📸', prompt: 'in front of a clean solid-color studio backdrop', names: { en: 'Studio Backdrop', jp: 'スタジオ背景', kr: '스튜디오 배경', es: 'Fondo de estudio' } },
];

/** 每个素材的完整 5 语言名。 */
function fullNames(s: SeedItem): MultiLang {
  return { en: s.names.en, zh: s.name, jp: s.names.jp, kr: s.names.kr, es: s.names.es };
}

/** Insert the seed catalog once. Returns number of rows added (0 if already seeded). */
export function ensureSeeded(): number {
  if (countTryonItems() > 0) return 0;
  for (const it of SEED) insertTryonItem(it.type, it.name, it.prompt, it.emoji, 0, JSON.stringify(fullNames(it)));
  return SEED.length;
}

/**
 * Backfill multi-language names for existing rows (matched by Chinese name).
 * Idempotent — safe to call on every deploy so translations stay in sync.
 */
export function applySeedTranslations(): number {
  let n = 0;
  for (const it of SEED) {
    const row = getDb().prepare(`SELECT id FROM tryon_items WHERE name = ?`).get(it.name) as { id: number } | undefined;
    if (!row) continue;
    updateTryonItem(row.id, { names_json: JSON.stringify(fullNames(it)) });
    n++;
  }
  return n;
}
