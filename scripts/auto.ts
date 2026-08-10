process.loadEnvFile('.env.local');

async function main() {
  const { generateTopics, runPipeline } = await import('../src/lib/pipeline/run');

  const n = Number(process.env.AUTO_NEW_TOPICS ?? 1);
  console.log(`[auto] generating ${n} topic(s)...`);
  const ids = await generateTopics(n, process.env.AUTO_TOPIC_HINT || undefined);
  console.log(`[auto] topics created: ${ids.join(', ')}`);

  const r = await runPipeline();
  console.log(`[auto] done=${r.done} failed=${r.failed}`);
}

main().catch((e) => {
  console.error('[auto] fatal:', e);
  process.exit(1);
});

export {};
