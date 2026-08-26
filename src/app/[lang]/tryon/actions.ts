'use server';

import { after } from 'next/server';
import {
  addTryonSourceTag,
  getTryonJob,
  getTryonPostByJob,
  getTryonQuota,
  insertTryonJob,
  insertTryonPost,
  listTryonJobs,
  replaceTags,
  setPostStatus,
  todayStr,
  updatePostContent,
} from '@/lib/db';
import { checkTryonSubmit, ensureTryonCookie, clientIdentity, getTryonSettings } from '@/lib/tryon/guard';
import { buildPrompt } from '@/lib/tryon/catalog';
import { processTryonJob } from '@/lib/tryon/generate';
import { buildCardBody, genCardContent } from '@/lib/tryon/publish';

export type TryonSubmitResult =
  | { ok: true; jobId: number; remaining: number }
  | { ok: false; reason: string };

/**
 * 提交一次试衣生成。校验（开关/选择/配额/并发/预算）→ 落库 pending →
 * after() 后台出图（不阻塞响应）。配额在成功出图后才扣除（失败免费重试）。
 */
export async function submitTryonAction(itemIds: number[]): Promise<TryonSubmitResult> {
  // 先种指纹 cookie 并拿到新值（同一请求内 cookies().set() 后 get() 读不到新值，需显式传入）
  const cookieUid = await ensureTryonCookie();
  const guard = await checkTryonSubmit(itemIds, cookieUid);
  if (!guard.ok) return { ok: false, reason: guard.reason };

  let prompt: string;
  try {
    prompt = buildPrompt(itemIds);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'invalid' };
  }

  const jobId = insertTryonJob(guard.uid, JSON.stringify(itemIds), prompt);

  after(async () => {
    try {
      await processTryonJob(jobId);
    } catch (e) {
      console.error('[tryon] background job failed:', e);
    }
  });

  const remaining = Math.max(0, guard.settings.perUserDaily - (guard.todayQuota + 1));
  return { ok: true, jobId, remaining };
}

/** 轮询单个任务状态（生成中/完成/失败）。 */
export async function getTryonJobAction(id: number) {
  const job = getTryonJob(id);
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    image_path: job.image_path,
    error: job.error,
  };
}

/** 当前访客的生成历史（本机 IP 维度）。 */
export async function myTryonHistoryAction(limit = 24) {
  const { uid } = await clientIdentity();
  return listTryonJobs(uid, limit).map((j) => ({
    id: j.id,
    status: j.status,
    image_path: j.image_path,
    created_at: j.created_at,
  }));
}

/** 今日剩余次数（页面刷新后取最新配额）。 */
export async function tryonRemainingAction() {
  const { uid, isDev } = await clientIdentity();
  const settings = getTryonSettings();
  if (isDev) return settings.perUserDaily;
  const used = getTryonQuota(uid, todayStr());
  return Math.max(0, settings.perUserDaily - used);
}

export type TryonPublishResult = { ok: true; postId: number } | { ok: false; reason: string };

/**
 * 用户把已生成的穿搭发布为卡片（状态 review，待管理员审核后公开）。
 * 标题：用户输入则以其为锚生成 5 语言；不输入则 LLM 自由生成。
 */
export async function publishTryonAction(jobId: number, userTitle?: string): Promise<TryonPublishResult> {
  const { uid } = await clientIdentity();
  const job = getTryonJob(jobId);
  if (!job) return { ok: false, reason: 'job_not_found' };
  if (job.uid !== uid) return { ok: false, reason: 'not_yours' };
  if (job.status !== 'done' || !job.image_path) return { ok: false, reason: 'not_ready' };

  // 已有卡片：仅当被拒绝时允许重新提交（更新同一张回到待审核），否则视为重复发布
  const existing = getTryonPostByJob(jobId);
  if (existing && existing.status !== 'rejected') return { ok: false, reason: 'already_published' };

  let itemIds: number[] = [];
  try {
    const parsed = JSON.parse(job.items_json);
    if (Array.isArray(parsed)) itemIds = parsed.filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);
  } catch {
    /* keep empty */
  }

  const content = await genCardContent(itemIds, userTitle?.trim() || undefined);
  const body = buildCardBody(itemIds);

  let postId: number;
  if (existing) {
    // 被拒后重新提交：替换内容、回到待审核（slug/发布时间清空）
    updatePostContent(existing.id, {
      topic: content.summary,
      title_json: content.titleJson,
      tags_json: content.tagsJson,
      desc_json: body.descJson,
      body_json: body.bodyJson,
      slug: null,
      published_at: null,
    });
    setPostStatus(existing.id, 'review');
    postId = existing.id;
  } else {
    postId = insertTryonPost({
      jobId,
      topic: content.summary,
      imagePath: job.image_path,
      titleJson: content.titleJson,
      tagsJson: content.tagsJson,
      descJson: body.descJson,
      bodyJson: body.bodyJson,
      status: 'review',
    });
  }
  try {
    replaceTags(postId, JSON.parse(content.tagsJson) as Parameters<typeof replaceTags>[1]);
  } catch {
    /* tags already embedded */
  }
  addTryonSourceTag(postId);
  return { ok: true, postId };
}
