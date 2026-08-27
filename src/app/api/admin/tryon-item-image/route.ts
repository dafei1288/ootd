import fs from 'node:fs';
import path from 'node:path';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { IMAGES_DIR, getTryonItem, updateTryonItem } from '@/lib/db';

const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX = 5 * 1024 * 1024; // 5MB

/**
 * 上传素材图（multipart: id + style + file）。
 * style: anime | real | default（default 写 image_path 展示图；anime/real 写对应画风参考图，
 * 且展示图为空时同步设为 image_path，保证前端选择器有图可显示）。
 */
export async function POST(req: Request) {
  const authed =
    !!process.env.ADMIN_TOKEN && (await cookies()).get('admin')?.value === process.env.ADMIN_TOKEN;
  if (!authed) return new Response('unauthorized', { status: 401 });

  const fd = await req.formData();
  const id = Number(fd.get('id'));
  const style = String(fd.get('style') ?? 'default');
  const file = fd.get('file');
  if (!Number.isFinite(id) || id <= 0 || !(file instanceof File) || file.size === 0) {
    return new Response('bad request', { status: 400 });
  }
  if (!TYPES.has(file.type) || file.size > MAX) return new Response('bad file', { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const fileKey = style === 'anime' || style === 'real' ? style : 'item';
  const rel = `images/tryon_item_${id}_${fileKey}.png`;
  fs.writeFileSync(path.join(IMAGES_DIR, `tryon_item_${id}_${fileKey}.png`), buf);

  if (style === 'anime') {
    const cur = getTryonItem(id)?.image_path;
    updateTryonItem(id, {
      image_path_anime: rel,
      // 展示图未设置时同步，让前端选择器有图可显示
      ...(cur ? {} : { image_path: rel }),
    });
  } else if (style === 'real') {
    const cur = getTryonItem(id)?.image_path;
    updateTryonItem(id, {
      image_path_real: rel,
      ...(cur ? {} : { image_path: rel }),
    });
  } else {
    updateTryonItem(id, { image_path: rel });
  }
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
  return new Response('ok', { status: 200 });
}
