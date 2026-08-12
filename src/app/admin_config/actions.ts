'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { insertTopic, retryPost, deletePost, setSetting, clearLogs, deleteSearchTerm, deleteComment, setCommentStatus, getWishes, markWishesDone, deleteWish, saveSnippet, setSnippetEnabled, deleteSnippet } from '@/lib/db';
import { generateTopics, runPipeline } from '@/lib/pipeline/run';
import { LANG_KEYS, type Lang } from '@/lib/config';
import { setSeo } from '@/lib/seo';

async function authed() {
  return !!process.env.ADMIN_TOKEN && (await cookies()).get('admin')?.value === process.env.ADMIN_TOKEN;
}

export async function login(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  if (token && token === process.env.ADMIN_TOKEN) {
    (await cookies()).set('admin', token, { httpOnly: true, sameSite: 'lax', path: '/' });
  }
  revalidatePath('/admin_config');
}

export async function logout() {
  (await cookies()).delete('admin');
  revalidatePath('/admin_config');
}

export async function importTopics(formData: FormData) {
  if (!(await authed())) return;
  const text = String(formData.get('topics') ?? '');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t) insertTopic(t, 'manual');
  }
  await runPipeline();
  revalidatePath('/admin_config');
}

export async function genTopicsAction(formData: FormData) {
  if (!(await authed())) return;
  const n = Math.min(10, Math.max(1, Number(formData.get('n') ?? 1)));
  const hint = String(formData.get('hint') ?? '').trim() || undefined;
  await generateTopics(n, hint);
  await runPipeline();
  revalidatePath('/admin_config');
}

export async function runAction() {
  if (!(await authed())) return;
  await runPipeline();
  revalidatePath('/admin_config');
}

export async function retryAction(formData: FormData) {
  if (!(await authed())) return;
  retryPost(Number(formData.get('id')));
  revalidatePath('/admin_config');
}

export async function deleteAction(formData: FormData) {
  if (!(await authed())) return;
  deletePost(Number(formData.get('id')));
  revalidatePath('/admin_config');
}

export async function saveSettings(formData: FormData) {
  if (!(await authed())) return;
  const name = String(formData.get('site_name') ?? '').trim();
  if (name) setSetting('site_name', name);
  revalidatePath('/', 'layout');
  revalidatePath('/admin_config');
}

export async function clearLogsAction() {
  if (!(await authed())) return;
  clearLogs();
  revalidatePath('/admin_config');
}

export async function seedFromSearchAction(formData: FormData) {
  if (!(await authed())) return;
  const term = String(formData.get('term') ?? '').trim();
  if (term) {
    insertTopic(term, 'auto');
    await runPipeline();
  }
  revalidatePath('/admin_config');
}

export async function dismissSearchAction(formData: FormData) {
  if (!(await authed())) return;
  const term = String(formData.get('term') ?? '');
  const lang = String(formData.get('lang') ?? '');
  deleteSearchTerm(term, lang);
  revalidatePath('/admin_config');
}

export async function hideCommentAction(formData: FormData) {
  if (!(await authed())) return;
  setCommentStatus(Number(formData.get('id')), 'hidden');
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

export async function approveCommentAction(formData: FormData) {
  if (!(await authed())) return;
  setCommentStatus(Number(formData.get('id')), 'approved');
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

export async function deleteCommentAction(formData: FormData) {
  if (!(await authed())) return;
  deleteComment(Number(formData.get('id')));
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

/** Execute one or more wishes: seed a post per wish from its content, mark them done
 *  and link to the generated post ids, then kick off generation in the BACKGROUND via
 *  after(). The pipeline is slow (image + LLM per post), so we don't await it — the
 *  admin gets an instant response and the wishes show "生成中" until published. */
export async function executeWishesAction(formData: FormData) {
  if (!(await authed())) return;
  const ids = formData
    .getAll('ids')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return;
  const wishes = getWishes(ids).filter((w) => w.status === 'pending');
  const done = wishes.map((w) => ({ id: w.id, postId: insertTopic(w.content, 'manual') }));
  if (done.length === 0) return;
  markWishesDone(done);
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
  after(async () => {
    try {
      await runPipeline();
    } catch (e) {
      console.error('[wishes] background pipeline failed:', e);
    }
  });
}

export async function deleteWishAction(formData: FormData) {
  if (!(await authed())) return;
  deleteWish(Number(formData.get('deleteId')));
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

// --- site snippets (admin-managed analytics / ad code) ---

export async function saveSnippetAction(formData: FormData) {
  if (!(await authed())) return;
  const id = Number(formData.get('id')) || 0;
  const name = String(formData.get('name') ?? '');
  const content = String(formData.get('content') ?? '');
  saveSnippet(id || null, name, content);
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

export async function setSnippetEnabledAction(formData: FormData) {
  if (!(await authed())) return;
  setSnippetEnabled(Number(formData.get('id')), formData.get('enabled') === '1');
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

export async function deleteSnippetAction(formData: FormData) {
  if (!(await authed())) return;
  deleteSnippet(Number(formData.get('id')));
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

// --- SEO defaults (admin-configurable per-language description/keywords + default OG image) ---

export async function saveSeoAction(formData: FormData) {
  if (!(await authed())) return;
  const description: Partial<Record<Lang, string>> = {};
  const keywords: Partial<Record<Lang, string>> = {};
  for (const k of LANG_KEYS) {
    const d = String(formData.get(`desc_${k}`) ?? '').trim();
    const kw = String(formData.get(`kw_${k}`) ?? '').trim();
    if (d) description[k] = d;
    if (kw) keywords[k] = kw;
  }
  const ogImage = String(formData.get('og_image') ?? '').trim();
  setSeo({ description, keywords, ...(ogImage ? { ogImage } : {}) });
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}
