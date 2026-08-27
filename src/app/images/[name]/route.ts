import fs from 'node:fs';
import path from 'node:path';
import { IMAGES_DIR } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  // 生成结果 tryon_{id}.png / 样例 tryon_sample_{id}.png / 素材图 tryon_item_{id}.png / tryon_item_{id}_{anime|real}.png
  if (!/^(?:tryon(?:_sample|_item)?_)?\d+(?:_anime|_real)?\.png$/.test(name)) return new Response('not found', { status: 404 });
  const file = path.join(IMAGES_DIR, name);
  if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
