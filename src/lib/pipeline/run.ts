import {
  listQueue, getPost, updateStep, failPost, publishPost, replaceTags, insertTopic,
} from '../db';
import { genTopic, imagePrompt, genImage, titles, tags, description, body } from './steps';
import type { MultiLang, TypedTags } from '../config';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function generateTopics(n: number, hint?: string): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const topic = await genTopic(hint);
    ids.push(insertTopic(topic.trim(), 'auto'));
  }
  return ids;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function publish(id: number, titleEn: string, tagsJson: string) {
  const base = slugify(titleEn) || 'post';
  try {
    publishPost(id, base);
  } catch {
    publishPost(id, `${base}-${id}`); // slug collision
  }
  replaceTags(id, JSON.parse(tagsJson) as TypedTags);
}

async function processOne(id: number) {
  for (;;) {
    const p = getPost(id);
    if (!p) throw new Error(`post ${id} disappeared`);
    switch (p.status) {
      case 'pending': {
        const r = await imagePrompt(p.topic, id);
        updateStep(id, 'image_prompt', JSON.stringify(r), 'image_prompt');
        break;
      }
      case 'image_prompt': {
        const prompt = JSON.parse(p.image_prompt!) as { prompt: string };
        const rel = await genImage(prompt.prompt, id);
        updateStep(id, 'image_path', rel, 'image');
        break;
      }
      case 'image': {
        const r = await titles(p.topic, id);
        updateStep(id, 'title_json', JSON.stringify(r), 'title');
        break;
      }
      case 'title': {
        const r = await tags(p.topic, id);
        updateStep(id, 'tags_json', JSON.stringify(r), 'tags');
        break;
      }
      case 'tags': {
        const r = await description(p.topic, id);
        updateStep(id, 'desc_json', JSON.stringify(r), 'description');
        break;
      }
      case 'description': {
        const r = await body(p.topic, id);
        updateStep(id, 'body_json', JSON.stringify(r), 'body');
        break;
      }
      case 'body': {
        const t = JSON.parse(p.title_json!) as MultiLang;
        publish(id, t.en, p.tags_json!);
        return;
      }
      default:
        throw new Error(`unknown status ${p.status}`);
    }
  }
}

export async function runPipeline(maxPosts = Number(process.env.RUN_MAX_POSTS ?? 5)): Promise<{ done: number; failed: number }> {
  const queue = listQueue(maxPosts);
  let done = 0;
  let failed = 0;
  for (const p of queue) {
    try {
      await processOne(p.id);
      done++;
      console.log(`[pipeline] #${p.id} published`);
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      failPost(p.id, msg);
      console.error(`[pipeline] #${p.id} failed: ${msg}`);
    }
    await sleep(500);
  }
  return { done, failed };
}
