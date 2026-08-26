'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { insertTopic, retryPost, deletePost, setSetting, clearLogs, deleteSearchTerm, deleteComment, setCommentStatus, getWishes, markWishesDone, deleteWish, saveSnippet, setSnippetEnabled, deleteSnippet, insertTryonItem, updateTryonItem, setTryonItemEnabled, deleteTryonItem, deleteTryonJob, updateTryonJob, getPost, publishPost, getTryonJob, insertTryonPost, replaceTags, addTryonSourceTag, setPostStatus, type TryonItemType } from '@/lib/db';
import { updatePostContent, getTryonPostByJob } from '@/lib/db';
import { generateTopics, runPipeline } from '@/lib/pipeline/run';
import { ensureSeeded, applySeedTranslations } from '@/lib/tryon/catalog';
import { processTryonJob } from '@/lib/tryon/generate';
import { buildCardBody, genCardContent } from '@/lib/tryon/publish';
import { parseMulti, LANG_KEYS, type Lang } from '@/lib/config';
import { setSeo } from '@/lib/seo';

async function authed() {
  return !!process.env.ADMIN_TOKEN && (await cookies()).get('admin')?.value === process.env.ADMIN_TOKEN;
}

/** 诊断日志：确认 server action POST 是否到达、cookie 是否携带。 */
async function logAdmin(step: string) {
  const c = await cookies();
  console.error(`[admin] ${step} | authed=${await authed()} | cookie=${c.get('admin')?.value ? 'present:' + c.get('admin')!.value.slice(0, 4) + '...' : 'MISSING'} | ADMIN_TOKEN=${process.env.ADMIN_TOKEN ? 'set' : 'unset'} | host=${(await headers()).get('host')}`);
}

export async function login(formData: FormData) {
  await logAdmin('login()');
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
  const copyright = String(formData.get('copyright') ?? '').trim();
  const icp = String(formData.get('icp') ?? '').trim();
  if (name) setSetting('site_name', name);
  setSetting('copyright', copyright);
  setSetting('icp', icp);
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
  await logAdmin('saveSnippetAction()');
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

// --- try-on room (试衣间) ---

export async function saveTryonSettingsAction(formData: FormData) {
  if (!(await authed())) return;
  setSetting('tryon_enabled', formData.get('enabled') === '1' ? '1' : '0');
  const num = (k: string, fb: number) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && v >= 0 ? String(v) : String(fb);
  };
  setSetting('tryon_per_user_daily', num('per_user_daily', 3));
  setSetting('tryon_daily_budget_cny', num('daily_budget_cny', 50));
  setSetting('tryon_max_pending_per_user', num('max_pending_per_user', 1));
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

export async function seedTryonAction() {
  if (!(await authed())) return;
  ensureSeeded();
  applySeedTranslations();
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

export async function addTryonItemAction(formData: FormData) {
  if (!(await authed())) return;
  const type = String(formData.get('type') ?? '') as TryonItemType;
  const name = String(formData.get('name') ?? '');
  const prompt = String(formData.get('prompt') ?? '');
  const emoji = String(formData.get('emoji') ?? '');
  if (!name.trim() || !prompt.trim()) return;
  // 添加时只填中文名；其他语言可后续在行内编辑补充（缺省回退到中文名）
  insertTryonItem(type, name, prompt, emoji, 0, JSON.stringify({ zh: name.trim() }));
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

export async function updateTryonItemAction(formData: FormData) {
  if (!(await authed())) return;
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) return;
  const names: Record<string, string> = {};
  for (const k of ['zh', 'en', 'jp', 'kr', 'es'] as const) {
    const v = String(formData.get(`name_${k}`) ?? '').trim();
    if (v) names[k] = v;
  }
  updateTryonItem(id, {
    name: names.zh || String(formData.get('name_zh') ?? ''),
    prompt: String(formData.get('prompt') ?? ''),
    emoji: String(formData.get('emoji') ?? ''),
    ...(Object.keys(names).length > 0 ? { names_json: JSON.stringify(names) } : {}),
  });
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

export async function toggleTryonItemAction(formData: FormData) {
  if (!(await authed())) return;
  setTryonItemEnabled(Number(formData.get('id')), formData.get('enabled') === '1');
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

export async function deleteTryonItemAction(formData: FormData) {
  if (!(await authed())) return;
  deleteTryonItem(Number(formData.get('id')));
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

export async function deleteTryonJobAction(formData: FormData) {
  if (!(await authed())) return;
  deleteTryonJob(Number(formData.get('id')));
  revalidatePath('/admin_config');
}

export async function retryTryonJobAction(formData: FormData) {
  if (!(await authed())) return;
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id <= 0) return;
  updateTryonJob(id, { status: 'pending', error: null });
  revalidatePath('/admin_config');
  after(async () => {
    try {
      await processTryonJob(id);
    } catch (e) {
      console.error('[tryon] retry job failed:', e);
    }
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** 审核通过：review → published（生成 slug）。 */
export async function approveTryonCardAction(formData: FormData) {
  if (!(await authed())) return;
  const id = Number(formData.get('id'));
  const post = getPost(id);
  if (!post || post.status !== 'review') return;
  const t = parseMulti(post.title_json);
  const base = slugify(t?.en ?? '') || 'tryon';
  try {
    publishPost(id, base);
  } catch {
    publishPost(id, `${base}-${id}`);
  }
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

/** 审核拒绝：不发布，卡片保留（状态 rejected，可重新审核）。 */
export async function rejectTryonCardAction(formData: FormData) {
  if (!(await authed())) return;
  setPostStatus(Number(formData.get('id')), 'rejected');
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

/** 重新审核：rejected → review（重新进入待审核队列）。 */
export async function reReviewTryonCardAction(formData: FormData) {
  if (!(await authed())) return;
  const id = Number(formData.get('id'));
  const post = getPost(id);
  if (!post || post.status !== 'rejected') return;
  updatePostContent(id, { slug: null, published_at: null });
  setPostStatus(id, 'review');
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}

/** 管理员自主发布：从试衣间生成记录直接创建卡片并公开。 */
export async function adminPublishTryonJobAction(formData: FormData) {
  if (!(await authed())) return;
  const jobId = Number(formData.get('id'));
  const job = getTryonJob(jobId);
  if (!job || job.status !== 'done' || !job.image_path) return;
  // 已有关联卡片：仅当被拒时允许直接转公开；待审核/已公开则跳过
  const existing = getTryonPostByJob(jobId);
  if (existing && existing.status !== 'rejected') return;

  let itemIds: number[] = [];
  try {
    const parsed = JSON.parse(job.items_json);
    if (Array.isArray(parsed)) itemIds = parsed.filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);
  } catch {
    /* keep empty */
  }
  const content = await genCardContent(itemIds);
  const body = buildCardBody(itemIds);
  const t = parseMulti(content.titleJson);
  const base = slugify(t?.en ?? '') || 'tryon';

  let postId: number;
  if (existing) {
    updatePostContent(existing.id, {
      topic: content.summary,
      title_json: content.titleJson,
      tags_json: content.tagsJson,
      desc_json: body.descJson,
      body_json: body.bodyJson,
    });
    try {
      publishPost(existing.id, base);
    } catch {
      publishPost(existing.id, `${base}-${existing.id}`);
    }
    postId = existing.id;
  } else {
    try {
      postId = insertTryonPost({
        jobId,
        topic: content.summary,
        imagePath: job.image_path,
        titleJson: content.titleJson,
        tagsJson: content.tagsJson,
        descJson: body.descJson,
        bodyJson: body.bodyJson,
        status: 'published',
        slug: base,
      });
    } catch {
      postId = insertTryonPost({
        jobId,
        topic: content.summary,
        imagePath: job.image_path,
        titleJson: content.titleJson,
        tagsJson: content.tagsJson,
        descJson: body.descJson,
        bodyJson: body.bodyJson,
        status: 'published',
        slug: `${base}-${jobId}`,
      });
    }
  }
  try {
    replaceTags(postId, JSON.parse(content.tagsJson) as Parameters<typeof replaceTags>[1]);
  } catch {
    /* tags already embedded */
  }
  addTryonSourceTag(postId);
  revalidatePath('/admin_config');
  revalidatePath('/', 'layout');
}


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
