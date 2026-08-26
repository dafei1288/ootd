import fs from 'node:fs';
import path from 'node:path';
import {
  IMAGES_DIR,
  bumpTryonQuota,
  getTryonJob,
  insertLog,
  logCost,
  todayStr,
  updateTryonJob,
} from '../db';
import { fetchImage } from '../pipeline/steps';
import { IMAGE_MODEL } from '../pipeline/client';
import { IMAGE_PRICES } from '../config';

/**
 * Execute one try-on generation job (status pending → done/failed).
 * Writes data/images/tryon_{id}.png, records the LLM cost, and only on
 * success bumps the user's daily quota (failed jobs are free retries).
 */
export async function processTryonJob(id: number): Promise<void> {
  const job = getTryonJob(id);
  if (!job || job.status !== 'pending') return;

  const t0 = Date.now();
  const log = (over: { error: string | null; result: string | null }) =>
    insertLog({
      post_id: null,
      step: 'tryon_image',
      model: IMAGE_MODEL,
      prompt: job.prompt,
      duration_ms: Date.now() - t0,
      prompt_tokens: null,
      completion_tokens: null,
      result: over.result,
      error: over.error,
    });

  try {
    const { buffer, promptTokens, completionTokens } = await fetchImage(job.prompt);
    const file = path.join(IMAGES_DIR, `tryon_${id}.png`);
    fs.writeFileSync(file, buffer);
    const rel = `images/tryon_${id}.png`;

    const cost = (() => {
      const p = IMAGE_PRICES[IMAGE_MODEL];
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

