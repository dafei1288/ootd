import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/** 跳回后台：优先用请求的 Host（本地是 localhost:3035，生产反代是真实域名）。 */
function back(request: NextRequest): NextResponse {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3035';
  return NextResponse.redirect(new URL('/admin_config', `http://${host}`));
}

/**
 * 后台登录（普通表单提交，不依赖 server action ID——旧页面/缓存页面也能用）。
 * 成功设置 admin cookie 后跳回后台。
 */
export async function POST(request: NextRequest) {
  const fd = await request.formData();
  const token = String(fd.get('token') ?? '');
  if (token && token === process.env.ADMIN_TOKEN) {
    (await cookies()).set('admin', token, { httpOnly: true, sameSite: 'lax', path: '/' });
  }
  return back(request);
}
