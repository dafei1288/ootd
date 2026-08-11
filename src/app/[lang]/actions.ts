'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { likePost, insertComment, insertWish } from '@/lib/db';
import type { Lang } from '@/lib/config';

/** Increment a post's like counter once per browser (cookie-guarded). */
export async function likeAction(postId: number) {
  const key = `liked_${postId}`;
  const store = await cookies();
  if (store.get(key)?.value === '1') return;
  likePost(postId);
  store.set(key, '1', { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
}

/** Best-effort visitor IP for moderation. Falls back to '' if no proxy header is present. */
async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h
      .get('x-forwarded-for')
      ?.split(',')[0]
      ?.trim() ||
    h.get('x-real-ip')?.trim() ||
    ''
  );
}

/** Publish a visitor comment on a post. Auto-approved; admin may hide/delete later. */
export async function addCommentAction(formData: FormData) {
  const postId = Number(formData.get('postId'));
  const author = String(formData.get('author') ?? '');
  const body = String(formData.get('body') ?? '');
  const lang = String(formData.get('lang') ?? 'en') as Lang;
  // Validate: need a real post and non-empty text. Input length is capped in insertComment.
  if (!Number.isFinite(postId) || postId <= 0) return;
  if (body.trim().length === 0) return;
  insertComment(postId, author, body, lang, await clientIp());
  revalidatePath('/', 'layout');
}

/** Submit a visitor wish (许愿池). Pending until admin executes it. */
export async function addWishAction(formData: FormData) {
  const content = String(formData.get('content') ?? '');
  const nickname = String(formData.get('nickname') ?? '');
  const lang = String(formData.get('lang') ?? 'en') as Lang;
  if (content.trim().length === 0) return;
  insertWish(content, nickname, lang, await clientIp());
  revalidatePath('/', 'layout');
}
