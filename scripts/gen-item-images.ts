/**
 * 批量生成服装素材的白底平铺图：动漫 + 真人各一张。
 * 默认生成 top/bottom/accessory（dress 已完成）；--all 包含 dress；--only=<id> 单测。
 * 用法: npx tsx scripts/gen-item-images.ts [--all] [--only <id>]
 * 输出: data/images/tryon_item_{id}_{anime|real}.png，并回写 DB（含展示图）。
 * 注意: 真实调用 dmxapi 文生图，有成本（seedream-4-5 约 0.25 元/张）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb, updateTryonItem, IMAGES_DIR, type TryonItem, type TryonItemType } from '../src/lib/db';

const API_KEY = process.env.DMXAPI_KEY;
const BASE = (process.env.DMXAPI_BASE_URL ?? 'https://www.dmxapi.cn/v1').replace(/\/+$/, '');
const MODEL = 'doubao-seedream-4-5-251128';
const SIZE = '1920x1920';

const DEFAULT_TYPES: TryonItemType[] = ['top', 'bottom', 'accessory', 'dress'];
const ALL_TYPES: TryonItemType[] = ['top', 'bottom', 'accessory', 'dress', 'model', 'scene'];

// 服装/配饰：白底平铺单品图
const PROMPT_ANIME = (garment: string) =>
  `E-commerce catalog photo: ${garment}, displayed flat on pure white background, anime illustration style, cel shading, clean line art, vibrant colors, item only, no person, no mannequin, no hanger, centered, sharp focus`;
const PROMPT_REAL = (garment: string) =>
  `E-commerce catalog photo: ${garment}, displayed flat on pure white background, photorealistic, realistic fabric texture and drape, item only, no person, no mannequin, no hanger, centered, sharp focus`;

// 人物：白/灰底全身立绘，素色打底不抢戏（参考图只锁形象，衣着由服装素材决定）
const PROMPT_MODEL_ANIME = (model: string) =>
  `Full body anime character reference: ${model}, wearing a simple plain white t-shirt and black leggings, neutral standing pose, arms relaxed, plain light gray studio background, cel shading, clean line art, character only, no text`;
const PROMPT_MODEL_REAL = (model: string) =>
  `Full body fashion model reference: ${model}, wearing a simple plain white t-shirt and black leggings, neutral standing pose, plain light gray studio background, photorealistic, model only, no text`;

// 场景：无人的背景图（人物/服装由其他素材决定）
const PROMPT_SCENE_ANIME = (scene: string) =>
  `Anime background illustration: ${scene}, no people, no characters, wide establishing shot, detailed background art, cel shading, vibrant colors`;
const PROMPT_SCENE_REAL = (scene: string) =>
  `Photorealistic photo: ${scene}, no people, wide angle, natural lighting, high detail`;

function promptFor(it: TryonItem, kind: 'anime' | 'real'): string {
  if (it.type === 'model') return kind === 'anime' ? PROMPT_MODEL_ANIME(it.prompt) : PROMPT_MODEL_REAL(it.prompt);
  if (it.type === 'scene') return kind === 'anime' ? PROMPT_SCENE_ANIME(it.prompt) : PROMPT_SCENE_REAL(it.prompt);
  return kind === 'anime' ? PROMPT_ANIME(it.prompt) : PROMPT_REAL(it.prompt);
}

async function gen(prompt: string): Promise<Buffer> {
  const res = await fetch(`${BASE}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, n: 1, size: SIZE }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { data?: { url?: string; b64_json?: string }[] };
  const item = j.data?.[0];
  if (!item) throw new Error('no data');
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item.url) {
    const r = await fetch(item.url);
    if (!r.ok) throw new Error(`download ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error('no image');
}

async function main() {
  if (!API_KEY) throw new Error('DMXAPI_KEY not set');

  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : undefined;
  const typesIdx = args.findIndex((a) => a.startsWith('--types='));
  const types: TryonItemType[] = typesIdx >= 0
    ? (args[typesIdx].split('=')[1].split(',') as TryonItemType[])
    : all
      ? ALL_TYPES
      : DEFAULT_TYPES;

  const rows = getDb()
    .prepare(`SELECT * FROM tryon_items WHERE enabled = 1 ORDER BY id`)
    .all() as unknown as TryonItem[];
  const items = rows.filter((r) => types.includes(r.type) && (!only || r.id === Number(only)));
  if (items.length === 0) {
    console.log(`no items found (types: ${types.join(',')}${only ? `, only=${only}` : ''})`);
    return;
  }
  console.log(`生成 ${items.length} 个素材 × 2 画风 = ${items.length * 2} 张 (seedream-4-5)`);

  let ok = 0;
  let fail = 0;
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  for (const it of items) {
    for (const kind of ['anime', 'real'] as const) {
      const prompt = promptFor(it, kind);
      const rel = `images/tryon_item_${it.id}_${kind}.png`;
      try {
        const buf = await gen(prompt);
        fs.writeFileSync(path.join(IMAGES_DIR, path.basename(rel)), buf);
        updateTryonItem(it.id, { [kind === 'anime' ? 'image_path_anime' : 'image_path_real']: rel } as never);
        if (!getDb().prepare(`SELECT image_path FROM tryon_items WHERE id = ?`).get(it.id)?.image_path) {
          updateTryonItem(it.id, { image_path: rel } as never);
        }
        ok++;
        console.log(`✓ #${it.id} [${it.type}] ${it.name} ${kind} ${buf.length} bytes`);
      } catch (e) {
        fail++;
        console.error(`✗ #${it.id} [${it.type}] ${it.name} ${kind} ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  console.log(`\n完成: 成功 ${ok} / 失败 ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
