/**
 * 批量生成连衣裙（dress）素材的白底平铺图：动漫 + 真人各一张。
 * 用法: npx tsx scripts/gen-dress-images.ts [--only <id>]   （--only 可先单测某个素材）
 * 输出: data/images/tryon_item_{id}_anime.png / tryon_item_{id}_real.png，并回写 DB。
 * 注意: 真实调用 dmxapi 文生图，有成本（seedream-4-5 约 0.25 元/张）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb, updateTryonItem, IMAGES_DIR, type TryonItem } from '../src/lib/db';

const API_KEY = process.env.DMXAPI_KEY;
const BASE = (process.env.DMXAPI_BASE_URL ?? 'https://www.dmxapi.cn/v1').replace(/\/+$/, '');
const MODEL = 'doubao-seedream-4-5-251128';
const SIZE = '1920x1920';

const PROMPT_ANIME = (garment: string) =>
  `E-commerce catalog photo: ${garment}, displayed flat on pure white background, anime illustration style, cel shading, clean line art, vibrant colors, garment only, no person, no mannequin, no hanger, centered, sharp focus`;
const PROMPT_REAL = (garment: string) =>
  `E-commerce catalog photo: ${garment}, displayed flat on pure white background, photorealistic, realistic fabric texture and drape, garment only, no person, no mannequin, no hanger, centered, sharp focus`;

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
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
  const rows = getDb()
    .prepare(`SELECT * FROM tryon_items WHERE type = 'dress' AND enabled = 1 ORDER BY id`)
    .all() as unknown as TryonItem[];
  const items = only ? rows.filter((r) => r.id === Number(only)) : rows;
  if (items.length === 0) {
    console.log('no dress items found');
    return;
  }
  console.log(`生成 ${items.length} 个连衣裙 × 2 画风 = ${items.length * 2} 张 (seedream-4-5)`);

  let ok = 0;
  let fail = 0;
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  for (const it of items) {
    for (const kind of ['anime', 'real'] as const) {
      const prompt = kind === 'anime' ? PROMPT_ANIME(it.prompt) : PROMPT_REAL(it.prompt);
      const rel = `images/tryon_item_${it.id}_${kind}.png`;
      try {
        const buf = await gen(prompt);
        fs.writeFileSync(path.join(IMAGES_DIR, path.basename(rel)), buf);
        updateTryonItem(it.id, { [kind === 'anime' ? 'image_path_anime' : 'image_path_real']: rel } as never);
        if (!getDb().prepare(`SELECT image_path FROM tryon_items WHERE id = ?`).get(it.id)?.image_path) {
          updateTryonItem(it.id, { image_path: rel } as never);
        }
        ok++;
        console.log(`✓ #${it.id} ${it.name} [${kind}] ${buf.length} bytes`);
      } catch (e) {
        fail++;
        console.error(`✗ #${it.id} ${it.name} [${kind}] ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  console.log(`\n完成: 成功 ${ok} / 失败 ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
