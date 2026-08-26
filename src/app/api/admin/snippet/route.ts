import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { saveSnippet, setSnippetEnabled, deleteSnippet } from '@/lib/db';

/** 跳回后台：优先用请求的 Host。 */
function back(request: NextRequest): NextResponse {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3035';
  return NextResponse.redirect(new URL('/admin_config', `http://${host}`));
}

/**
 * 站点脚本管理（普通表单提交，不依赖 server action ID）。
 * 动作由隐藏字段 _action 区分：save | toggle | delete
 */
export async function POST(request: NextRequest) {
  const c = await cookies();
  const authed = !!process.env.ADMIN_TOKEN && c.get('admin')?.value === process.env.ADMIN_TOKEN;
  const fd = await request.formData();
  const action = String(fd.get('_action') ?? 'save');
  const id = Number(fd.get('id')) || 0;
  const name = String(fd.get('name') ?? '');
  console.error(`[snippet-api] authed=${authed} action=${action} id=${id} name=${name} len=${fd.get('content')?.toString().length ?? 0}`);
  if (!authed) return back(request);

  if (action === 'toggle') {
    setSnippetEnabled(id, fd.get('enabled') === '1');
  } else if (action === 'delete') {
    deleteSnippet(id);
  } else {
    saveSnippet(id || null, name, String(fd.get('content') ?? ''));
  }
  console.error(`[snippet-api] saved OK, now rows=${(await import('@/lib/db')).listSnippets().length}`);
  return back(request);
}
