import fs from 'node:fs';
import path from 'node:path';
import { getChatLLM, getImageLLM, LLM_MODEL, IMAGE_MODEL } from './client';
import { LANG_KEYS, type MultiLang, type TypedTags } from '../config';
import { IMAGES_DIR, insertLog } from '../db';

export function parseLLMJson<T>(raw: string): T {
  const attempts = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) attempts.push(fenced[1]);
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) attempts.push(raw.slice(first, last + 1));
  for (const a of attempts) {
    try {
      return JSON.parse(a) as T;
    } catch {
      /* try next */
    }
  }
  throw new Error(`LLM returned unparseable JSON: ${raw.slice(0, 300)}`);
}

async function chat(step: string, system: string, user: string, postId: number | null = null): Promise<string> {
  const t0 = Date.now();
  const prompt = `[system]\n${system}\n[user]\n${user}`;
  try {
    const r = await getChatLLM().chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const c = r.choices[0]?.message?.content;
    if (!c) throw new Error('empty LLM response');
    insertLog({
      post_id: postId,
      step,
      model: LLM_MODEL,
      prompt,
      duration_ms: Date.now() - t0,
      prompt_tokens: r.usage?.prompt_tokens ?? null,
      completion_tokens: r.usage?.completion_tokens ?? null,
      result: c,
      error: null,
    });
    return c;
  } catch (e) {
    insertLog({
      post_id: postId,
      step,
      model: LLM_MODEL,
      prompt,
      duration_ms: Date.now() - t0,
      prompt_tokens: null,
      completion_tokens: null,
      result: null,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function chatJSON<T>(step: string, system: string, user: string, postId: number | null = null): Promise<T> {
  const sys = `${system}\n只输出 JSON,不要输出任何其他内容。`;
  try {
    return parseLLMJson<T>(await chat(step, sys, user, postId));
  } catch {
    // one re-ask, then give up
    return parseLLMJson<T>(await chat(`${step}-retry`, sys, `${user}\n\n上一次输出不是合法 JSON,请只返回 JSON 对象本身。`, postId));
  }
}

function assertMultiLang(obj: unknown): MultiLang {
  const o = obj as Record<string, unknown>;
  for (const k of LANG_KEYS) {
    if (typeof o[k] !== 'string' || !(o[k] as string).trim()) {
      throw new Error(`multilang JSON missing key "${k}": ${JSON.stringify(o).slice(0, 300)}`);
    }
  }
  return o as unknown as MultiLang;
}

const MULTI_SCHEMA = `{"en":"","zh":"","jp":"","kr":"","es":""}`;

export async function genTopic(hint?: string): Promise<string> {
  return chat(
    'topic',
    '你是一个动漫穿搭选题编辑。',
    `给出一个选题:一个知名的动漫女性角色,时尚穿搭,随机穿搭。${
      hint ? `限定要求:${hint}。` : ''
    }直接输出选题内容(角色名+具体穿搭描述),100~200字,不要输出其他内容。`
  );
}

export async function imagePrompt(topic: string, postId?: number): Promise<{ prompt: string }> {
  const r = await chatJSON<{ prompt: string }>(
    'imagePrompt',
    '你是写画图提示词的打工人。',
    `请根据以下主题内容,简化成一段文生图 prompt 提示词,做到简洁又精准,输出为英文,返回json格式 {"prompt":"..."}。\n\n主题内容:${topic}`,
    postId ?? null
  );
  if (typeof r.prompt !== 'string' || !r.prompt.trim()) throw new Error('bad image prompt JSON');
  return r;
}

export async function titles(topic: string, postId?: number): Promise<MultiLang> {
  const r = await chatJSON(
    'titles',
    '你是标题党高手。',
    `将以下主题内容提炼概括出一句话的核心内容,需要包含什么人穿了什么衣服,每种语言最多100个字节,最终翻译成英文、简体中文、日文、韩文、西班牙文。用json输出,格式:${MULTI_SCHEMA}\n\n主题内容:${topic}`,
    postId ?? null
  );
  return assertMultiLang(r);
}

export async function tags(topic: string, postId?: number): Promise<TypedTags> {
  const r = await chatJSON(
    'tags',
    '你是一名自然语言处理专家,非常善于处理各种语言下的分词。',
    `根据以下主题内容切分成相关的词组用来当作文章内容的标签,标签对应的词组用英文符号','来分隔。标签分两类:char=出场人物/角色名/作品名(动漫、游戏系列名),style=穿搭/服饰/风格相关词组。只选择重点内容的核心词组作为标签,去除无意义且不适合做标签的词组,相似词只选择一个,不选纯数字作为标签,最终翻译成英文、简体中文、日文、韩文、西班牙文。用json输出,格式:{"char":${MULTI_SCHEMA},"style":${MULTI_SCHEMA}}\n\n主题内容:${topic}`,
    postId ?? null
  );
  const t = r as TypedTags;
  return { char: assertMultiLang(t.char), style: assertMultiLang(t.style) };
}

export async function description(topic: string, postId?: number): Promise<MultiLang> {
  const r = await chatJSON(
    'description',
    '你是一名seo高手,非常善于写网页内容的description。',
    `请根据以下主题内容写一段符合要求的description,既满足seo要求又提炼出核心内容,最终翻译成英文、简体中文、日文、韩文、西班牙文。用json输出,格式:${MULTI_SCHEMA}\n\n主题内容:${topic}`,
    postId ?? null
  );
  return assertMultiLang(r);
}

export async function body(topic: string, postId?: number): Promise<MultiLang> {
  const r = await chatJSON(
    'body',
    '你是文本创作大师。',
    `请根据以下主题内容,用一个动漫杂志结合时尚杂志的角度来扩写对应的内容,不脱离原文主题的情况下,变成一篇可读性强的文章,每种语言500字以内,段落用<p></p>来区分。最终翻译成英文、简体中文、日文、韩文、西班牙文。用json输出,格式:${MULTI_SCHEMA}\n\n主题内容:${topic}`,
    postId ?? null
  );
  return assertMultiLang(r);
}

export async function genImage(prompt: string, postId: number): Promise<string> {
  const t0 = Date.now();
  try {
    const { buffer, promptTokens, completionTokens } = await fetchImage(prompt);
    const file = path.join(IMAGES_DIR, `${postId}.png`);
    fs.writeFileSync(file, buffer);
    const rel = `images/${postId}.png`;
    insertLog({
      post_id: postId,
      step: 'image',
      model: IMAGE_MODEL,
      prompt,
      duration_ms: Date.now() - t0,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      result: rel,
      error: null,
    });
    return rel;
  } catch (e) {
    insertLog({
      post_id: postId,
      step: 'image',
      model: IMAGE_MODEL,
      prompt,
      duration_ms: Date.now() - t0,
      prompt_tokens: null,
      completion_tokens: null,
      result: null,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/**
 * Call the image model and return the raw PNG buffer plus token usage.
 * Shared by the content pipeline (genImage) and the try-on room.
 */
export async function fetchImage(prompt: string): Promise<{ buffer: Buffer; promptTokens: number | null; completionTokens: number | null }> {
  const r = await getImageLLM().images.generate({
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size: (process.env.IMAGE_SIZE ?? '1024x1024') as '1024x1024',
  });
  const item = r.data?.[0];
  if (!item) throw new Error('image API returned no data');
  const u = r.usage as { prompt_tokens?: number; input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined;
  const promptTokens = u?.prompt_tokens ?? u?.input_tokens ?? null;
  const completionTokens =
    u?.output_tokens ?? (u?.total_tokens != null && promptTokens != null ? u.total_tokens - promptTokens : null);
  if (item.b64_json) {
    return { buffer: Buffer.from(item.b64_json, 'base64'), promptTokens, completionTokens };
  }
  if (item.url) {
    const resp = await fetch(item.url);
    if (!resp.ok) throw new Error(`image download failed: ${resp.status}`);
    return { buffer: Buffer.from(await resp.arrayBuffer()), promptTokens, completionTokens };
  }
  throw new Error('image API returned neither url nor b64_json');
}

/**
 * 图生图（多参考图）：直连 dmxapi images/generations，把参考图作为 input_image 数组传入。
 * 用 fetch 而非 openai SDK —— SDK 的 zod 校验会剥掉非标准字段 input_image。
 * 参考图存在时模型用 TRYON_IMAGE_MODEL（默认 seedream-4-0 多参考），尺寸 1920x1920。
 */
export async function fetchImageWithRefs(
  prompt: string,
  refImages: string[]
): Promise<{ buffer: Buffer; promptTokens: number | null; completionTokens: number | null }> {
  const apiKey = process.env.DMXAPI_KEY;
  if (!apiKey) throw new Error('DMXAPI_KEY is not set');
  const base = (process.env.DMXAPI_BASE_URL ?? 'https://www.dmxapi.cn/v1').replace(/\/+$/, '');
  const model = process.env.TRYON_IMAGE_MODEL ?? 'doubao-seedream-4-0-250828';

  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size: '1920x1920', // seedream 要求 >= 3686400 像素
  };
  if (refImages.length > 0) body.input_image = refImages;

  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`image API ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    data?: { b64_json?: string; url?: string }[];
    usage?: { prompt_tokens?: number; input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };
  const item = j.data?.[0];
  if (!item) throw new Error('image API returned no data');
  const u = j.usage;
  const promptTokens = u?.prompt_tokens ?? u?.input_tokens ?? null;
  const completionTokens =
    u?.output_tokens ?? (u?.total_tokens != null && promptTokens != null ? u.total_tokens - promptTokens : null);
  if (item.b64_json) {
    return { buffer: Buffer.from(item.b64_json, 'base64'), promptTokens, completionTokens };
  }
  if (item.url) {
    const resp = await fetch(item.url);
    if (!resp.ok) throw new Error(`image download failed: ${resp.status}`);
    return { buffer: Buffer.from(await resp.arrayBuffer()), promptTokens, completionTokens };
  }
  throw new Error('image API returned neither url nor b64_json');
}
