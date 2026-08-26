import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { listSnippets } from '@/lib/db';

/** 只读查询：站点脚本列表（用于验证，避免直接碰数据库文件）。 */
export async function GET(request: NextRequest) {
  const c = await cookies();
  const authed = !!process.env.ADMIN_TOKEN && c.get('admin')?.value === process.env.ADMIN_TOKEN;
  if (!authed) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(listSnippets());
}
