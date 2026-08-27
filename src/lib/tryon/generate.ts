import fs from 'node:fs';
import path from 'node:path';
import {
  IMAGES_DIR,
  bumpTryonQuota,
  getEnabledTryonItems,
  getTryonJob,
  insertLog,
  logCost,
  todayStr,
  updateTryonJob,
} from '../db';
import { fetchImage, fetchImageWithRefs } from '../pipeline/steps';
import { collectRefImages, styleKindOf } from './catalog';
import { IMAGE_MODEL } from '../pipeline/client';
import { IMAGE_PRICES } from '../config';

/**
 * Execute one try-on generation job (status pending → done/failed).
 * Writes data/images/tryon_{id}.png, records the LLM cost, and only on
 * success bumps the user's daily quota (failed jobs are free retries).
 *
 * B 档（按图组合）：素材带图时，解析选中素材 → 按画风收集参考图 →
 * 走 seedream 多参考图生图（fetchImageWithRefs）；无图则退回纯文生图。
 */
export async function processTryonJob(id: number): Promise<void> {
  const job = getTryonJob(id);
  if (!job || job.status !== 'pending') return;

  const t0 = Date.now();

  // 参考图：选中素材（style/scene/model 除外）按画风取图，最多 4 张
  let refs: string[] = [];
  try {
    const parsed = JSON.parse(job.items_json ?? '[]');
    if (Array.isArray(parsed)) {
      const itemIds = parsed.filter((n) => Number.isInteger(n) && n > 0);
      if (itemIds.length > 0) {
        refs = collectRefImages(itemIds, styleKindOf(getEnabledTryonItems(itemIds)));
      }
    }
  } catch {
    /* 无 items_json 则纯文生图 */
  }

  const model = refs.length > 0 ? (process.env.TRYON_IMAGE_MODEL ?? 'doubao-seedream-4-0-250828') : IMAGE_MODEL;
  const log = (over: { error: string | null; result: string | null }) =>
    insertLog({
      post_id: null,
      step: 'tryon_image',
      model,
      prompt: job.prompt,
      duration_ms: Date.now() - t0,
      prompt_tokens: null,
      completion_tokens: null,
      result: over.result,
      error: over.error,
    });

  try {
    const { buffer, promptTokens, completionTokens } =
      refs.length > 0 ? await fetchImageWithRefs(job.prompt, refs) : await fetchImage(job.prompt);
    const file = path.join(IMAGES_DIR, `tryon_${id}.png`);
    fs.writeFileSync(file, buffer);
    const rel = `images/tryon_${id}.png`;

    const cost = (() => {
      const p = IMAGE_PRICES[model];
      if (typeof p === 'number') return p;
      if (p && promptTokens != null && completionTokens != null) {
        return (promptTokens * p.input + completionTokens * p.output) / 1e6;
      }
      return null;
    })();

    updateTryonJob(id, {
      status: 'done',
      image_path: rel,
      cost,
      error: null,
      done_at: new Date().toISOString(),
    });
    bumpTryonQuota(job.uid, todayStr());
    log({ error: null, result: rel });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    updateTryonJob(id, { status: 'failed', error: msg.slice(0, 500) });
    log({ error: msg, result: null });
    console.error(`[tryon] job #${id} failed: ${msg}`);
  }
}

// re-export so callers can compute cost from a log row if needed
export { logCost };
