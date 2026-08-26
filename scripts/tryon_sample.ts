process.loadEnvFile('.env.local');

/**
 * 用种子素材生成几张样例穿搭图，供人工评估效果。
 * 用法: npx tsx scripts/tryon_sample.ts
 */
async function main() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { ensureSeeded, buildPrompt } = await import('../src/lib/tryon/catalog');
  const { listEnabledTryonItems } = await import('../src/lib/db');
  const { fetchImage } = await import('../src/lib/pipeline/steps');

  ensureSeeded();
  const items = listEnabledTryonItems();
  const byType = (t: string) => items.filter((i) => i.type === t);
  const pick = (t: string, idx: number) => {
    const it = byType(t)[idx];
    if (!it) throw new Error(`no ${t} item #${idx}`);
    return it.id;
  };

  const samples: { name: string; ids: number[] }[] = [
    {
      name: 'anime_street',
      ids: [
        pick('style', 0), // 动漫插画风
        pick('model', 0), // 银发双马尾
        pick('top', 0), // 白衬衫
        pick('bottom', 1), // 格纹百褶裙
        pick('accessory', 0), // 贝雷帽
        pick('accessory', 5), // 帆布包
        pick('scene', 0), // 城市街头
      ],
    },
    {
      name: 'realistic_cafe',
      ids: [
        pick('style', 1), // 真人摄影风
        pick('model', 1), // 黑长直御姐
        pick('dress', 1), // 小黑裙
        pick('accessory', 3), // 珍珠项链
        pick('accessory', 6), // 耳环
        pick('scene', 1), // 咖啡店
      ],
    },
    {
      name: 'anime_rooftop',
      ids: [
        pick('style', 0),
        pick('model', 3), // 蓝发酷女孩
        pick('top', 1), // Oversize 卫衣
        pick('bottom', 6), // 工装裤
        pick('accessory', 8), // 发带
        pick('scene', 3), // 天台黄昏
      ],
    },
  ];

  const outDir = path.join(process.cwd(), 'data', 'images');
  fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const prompt = buildPrompt(s.ids);
    console.log(`[sample] #${i + 1} ${s.name} 生成中…`);
    const { buffer } = await fetchImage(prompt);
    const file = path.join(outDir, `tryon_sample_${i + 1}.png`);
    fs.writeFileSync(file, buffer);
    console.log(`[sample] #${i + 1} 完成 → data/images/tryon_sample_${i + 1}.png`);
  }
  console.log('[sample] 全部完成');
}

main().catch((e) => {
  console.error('[sample] fatal:', e);
  process.exit(1);
});

export {};
