import OpenAI from 'openai';

// Clients are created lazily so that importing this module (e.g. during
// `next build`, when env vars are absent) never throws "Missing credentials".
// openai SDK v7 validates the apiKey at construction time.
const g = globalThis as unknown as { __chatLLM?: OpenAI; __imageLLM?: OpenAI };

// 文本 LLM:DeepSeek 官方 API(OpenAI 兼容)
export function getChatLLM(): OpenAI {
  const apiKey = process.env.LLM_DS_API_KEY;
  if (!apiKey) throw new Error('LLM_DS_API_KEY is not set');
  g.__chatLLM ??= new OpenAI({
    apiKey,
    baseURL: process.env.LLM_DS_BASE_URL ?? 'https://api.deepseek.com',
    timeout: 120_000,
    maxRetries: 2,
  });
  return g.__chatLLM;
}

// 文生图:dmxapi 代理(OpenAI 兼容)
export function getImageLLM(): OpenAI {
  const apiKey = process.env.DMXAPI_KEY;
  if (!apiKey) throw new Error('DMXAPI_KEY is not set');
  g.__imageLLM ??= new OpenAI({
    apiKey,
    baseURL: process.env.DMXAPI_BASE_URL ?? 'https://www.dmxapi.cn/v1',
    timeout: 120_000,
    maxRetries: 2,
  });
  return g.__imageLLM;
}

export const LLM_MODEL = process.env.LLM_MODEL ?? 'deepseek-chat';
export const IMAGE_MODEL = process.env.IMAGE_MODEL ?? 'dall-e-3';
