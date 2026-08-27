import type { Metadata } from 'next';
import { enabledCatalog, itemName } from '@/lib/tryon/catalog';
import { clientIdentity, getTryonSettings } from '@/lib/tryon/guard';
import { getTryonQuota, listTryonJobs, todayStr, type TryonItem, type TryonItemType } from '@/lib/db';
import { type Lang } from '@/lib/config';
import { langUrl } from '@/lib/site';
import { t } from '@/lib/i18n';
import { withSeo } from '@/lib/seo';
import TryOnRoom from '@/components/TryOnRoom';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return withSeo(
    {
      title: `${t('nav.tryon', lang)} — Anime OOTD`,
      description: t('tryon.tagline', lang),
      alternates: { canonical: langUrl(lang, '/tryon') },
    },
    { lang },
  );
}

export default async function TryonPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const raw = enabledCatalog();
  const settings = getTryonSettings();
  const { uid, isDev } = await clientIdentity();
  const todayQuota = getTryonQuota(uid, todayStr());
  const history = listTryonJobs(uid, 24).map((j) => ({
    id: j.id,
    status: j.status,
    image_path: j.image_path,
    created_at: j.created_at,
  }));

  // node:sqlite 返回的行是 null-prototype 对象，无法序列化进 client 组件，先拍平成普通对象
  // 同时把素材名按当前语言解析好（names_json → lang → en → 中文名回退）
  const catalog = Object.fromEntries(
    Object.entries(raw).map(([type, items]) => [
      type,
      items.map((it) => ({
        id: it.id,
        type: it.type,
        name: itemName(it, lang),
        emoji: it.emoji,
        prompt: it.prompt,
        // 展示图：优先通用图，其次动漫/真人参考图
        image_path: it.image_path ?? it.image_path_anime ?? it.image_path_real,
        image_path_anime: it.image_path_anime,
        image_path_real: it.image_path_real,
        sort_order: it.sort_order,
        enabled: it.enabled,
      })),
    ])
  ) as Record<TryonItemType, TryonItem[]>;

  // 默认预选：画风(动漫) + 第一个模特 + 城市街头，降低首张生成门槛
  const defaults = {
    style: catalog.style[0] ? [catalog.style[0].id] : [],
    model: catalog.model[0] ? [catalog.model[0].id] : [],
    scene: catalog.scene[0] ? [catalog.scene[0].id] : [],
  };

  return (
    <div className="py-4">
      <h1 className="text-2xl font-bold tracking-tight">🧥 {t('nav.tryon', lang)}</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-500">{t('tryon.tagline', lang)}</p>
      <TryOnRoom
        lang={lang}
        catalog={catalog}
        defaults={defaults}
        history={history}
        perUserDaily={settings.perUserDaily}
        todayQuota={isDev ? 0 : todayQuota}
        isDev={isDev}
      />
    </div>
  );
}
