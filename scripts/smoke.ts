process.loadEnvFile('.env.local');

async function main() {
  const { parseLLMJson } = await import('../src/lib/pipeline/steps');

  // 1. JSON parsing robustness
  const clean = parseLLMJson<{ a: number }>('{"a":1}');
  console.assert(clean.a === 1, 'clean JSON failed');
  const fenced = parseLLMJson<{ a: number }>('好的,结果如下:\n```json\n{"a":2}\n```\n希望对你有帮助');
  console.assert(fenced.a === 2, 'fenced JSON failed');
  const wrapped = parseLLMJson<{ a: number }>('prefix text {"a":3} suffix');
  console.assert(wrapped.a === 3, 'wrapped JSON failed');
  console.log('[smoke] parseLLMJson: 3/3 ok');

  // 2. deepseek + dmxapi connectivity
  const { getChatLLM, getImageLLM, LLM_MODEL, IMAGE_MODEL } = await import('../src/lib/pipeline/client');
  const dsIds: string[] = [];
  for await (const m of await getChatLLM().models.list()) dsIds.push(m.id);
  console.log(`[smoke] deepseek reachable, models: ${dsIds.slice(0, 5).join(', ')}`);
  const dmxIds: string[] = [];
  for await (const m of await getImageLLM().models.list()) dmxIds.push(m.id);
  console.log(`[smoke] dmxapi reachable, ${dmxIds.length} models`);
  console.log(`[smoke] LLM_MODEL=${LLM_MODEL} IMAGE_MODEL=${IMAGE_MODEL}`);
  console.log(
    '[smoke] dmxapi image-ish models:',
    dmxIds.filter((i) => /image|dall|flux|sd|mj|kolors|seedream/i.test(i)).join(', ') || '(none matched)'
  );

  // 3. db insert/select roundtrip (rollback-ish: delete after)
  const { insertTopic, getPost, deletePost } = await import('../src/lib/db');
  const id = insertTopic('smoke test topic', 'manual');
  const row = getPost(id);
  console.assert(row?.topic === 'smoke test topic' && row?.status === 'pending', 'db roundtrip failed');
  deletePost(id);
  console.log('[smoke] db roundtrip ok');

  console.log('[smoke] ALL OK');
}

main().catch((e) => {
  console.error('[smoke] FATAL:', e);
  process.exit(1);
});

export {};
