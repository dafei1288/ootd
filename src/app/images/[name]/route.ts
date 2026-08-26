import fs from 'node:fs';
import path from 'node:path';
import { IMAGES_DIR } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^(?:tryon(?:_sample)?_)?\d+\.png$/.test(name)) return new Response('not found', { status: 404 });
  const file = path.join(IMAGES_DIR, name);
  if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
