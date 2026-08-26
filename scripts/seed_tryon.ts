process.loadEnvFile('.env.local');

/** 导入试衣间种子素材（已存在则跳过），并回填多语言名称。用法: npx tsx scripts/seed_tryon.ts */
async function main() {
  const { ensureSeeded, applySeedTranslations } = await import('../src/lib/tryon/catalog');
  const n = ensureSeeded();
  const backfill = applySeedTranslations();
  console.log(n > 0 ? `[seed] 已导入 ${n} 条素材` : '[seed] 素材库已存在，跳过');
  if (backfill > 0) console.log(`[seed] 已回填 ${backfill} 条素材的多语言名称`);
}

main().catch((e) => {
  console.error('[seed] fatal:', e);
  process.exit(1);
});

export {};
