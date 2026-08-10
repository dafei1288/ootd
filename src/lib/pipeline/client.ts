import OpenAI from 'openai';

// 文本 LLM:DeepSeek 官方 API(OpenAI 兼容)
export const chatLLM = new OpenAI({
  apiKey: process.env.LLM_DS_API_KEY,
  baseURL: process.env.LLM_DS_BASE_URL ?? 'https://api.deepseek.com',
  timeout: 120_000,
  maxRetries: 2,
});

// 文生图:dmxapi 代理(OpenAI 兼容)
export const imageLLM = new OpenAI({
  apiKey: process.env.DMXAPI_KEY,
  baseURL: process.env.DMXAPI_BASE_URL ?? 'https://www.dmxapi.cn/v1',
  timeout: 120_000,
  maxRetries: 2,
});

export const LLM_MODEL = process.env.LLM_MODEL ?? 'deepseek-chat';
export const IMAGE_MODEL = process.env.IMAGE_MODEL ?? 'dall-e-3';
