'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { Lang } from '@/lib/config';
import type { TryonItem, TryonItemType } from '@/lib/db';
import { t } from '@/lib/i18n';
import {
  getTryonJobAction,
  myTryonHistoryAction,
  publishTryonAction,
  submitTryonAction,
} from '@/app/[lang]/tryon/actions';

interface JobCard {
  id: number;
  status: string;
  image_path: string | null;
  created_at: string;
}

interface Props {
  lang: Lang;
  catalog: Record<TryonItemType, TryonItem[]>;
  defaults: Partial<Record<TryonItemType, number[]>>;
  history: JobCard[];
  perUserDaily: number;
  todayQuota: number;
  isDev: boolean;
}

const GROUPS: { type: TryonItemType; multi?: boolean; max?: number }[] = [
  { type: 'model' },
  { type: 'top' },
  { type: 'bottom' },
  { type: 'dress' },
  { type: 'accessory', multi: true, max: 3 },
  { type: 'scene' },
  { type: 'style' },
];

type ResultState =
  | { status: 'idle' }
  | { status: 'pending'; jobId: number }
  | { status: 'done'; jobId: number; image_path: string }
  | { status: 'failed'; error?: string };

const KNOWN_REASONS = new Set(['disabled', 'quota', 'budget', 'busy', 'invalid']);

function imageUrl(imagePath: string): string {
  return `/images/${imagePath.split('/').pop() ?? imagePath}`;
}

export default function TryOnRoom({ lang, catalog, defaults, history: initHistory, perUserDaily, todayQuota, isDev }: Props) {
  const [sel, setSel] = useState<Record<TryonItemType, number[]>>(() => {
    const s = {} as Record<TryonItemType, number[]>;
    for (const g of GROUPS) s[g.type] = [...(defaults[g.type] ?? [])];
    return s;
  });
  const [history, setHistory] = useState<JobCard[]>(initHistory);
  const [result, setResult] = useState<ResultState>({ status: 'idle' });
  // hover 素材预览卡片：跟随鼠标显示单品大图（动漫/真人两张）
  const [preview, setPreview] = useState<{ it: TryonItem; x: number; y: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(Math.max(0, perUserDaily - todayQuota));
  const [isPending, startTransition] = useTransition();
  const [pubTitle, setPubTitle] = useState('');
  const [publish, setPublish] = useState<{ status: 'idle' | 'submitting' | 'done' | 'error'; msg?: string }>({ status: 'idle' });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 弹出提示（发布成功等），4 秒后自动消失
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await myTryonHistoryAction(24));
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = (type: TryonItemType, id: number) => {
    setSel((prev) => {
      const cur = prev[type] ?? [];
      if (cur.includes(id)) return { ...prev, [type]: cur.filter((x) => x !== id) };
      if (type === 'accessory') {
        if (cur.length >= 3) return prev;
        return { ...prev, [type]: [...cur, id] };
      }
      return { ...prev, [type]: [id] };
    });
    setMsg(null);
  };

  const hasClothing =
    (sel.top?.length ?? 0) + (sel.bottom?.length ?? 0) + (sel.dress?.length ?? 0) > 0;
  const hasStyle = (sel.style?.length ?? 0) > 0;
  const canGenerate = hasClothing && hasStyle && !isPending && result.status !== 'pending';
  const pending = result.status === 'pending';

  // Poll the job until it finishes (image gen takes 10–60s).
  const pendingJobId = result.status === 'pending' ? result.jobId : null;
  useEffect(() => {
    if (pendingJobId == null) return;
    let stopped = false;
    const check = async () => {
      try {
        const j = await getTryonJobAction(pendingJobId);
        if (stopped || !j) return;
        if (j.status === 'done' && j.image_path) {
          setResult({ status: 'done', jobId: j.id, image_path: j.image_path });
          void refreshHistory();
        } else if (j.status === 'failed') {
          setResult({ status: 'failed', error: j.error ?? undefined });
        }
      } catch {
        /* keep polling */
      }
    };
    void check();
    const timer = setInterval(check, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pendingJobId, refreshHistory]);

  const reasonText = (r: string) => (KNOWN_REASONS.has(r) ? t(`tryon.err.${r}` as never, lang) : r);

  const publishErrText = (r: string) => {
    switch (r) {
      case 'already_published':
        return t('tryon.err.alreadyPublished', lang);
      case 'not_ready':
        return t('tryon.err.notReady', lang);
      case 'not_yours':
        return t('tryon.err.notYours', lang);
      default:
        return t('tryon.err.publish', lang);
    }
  };

  const doPublish = () => {
    if (result.status !== 'done') return;
    setPublish({ status: 'submitting' });
    startTransition(async () => {
      const res = await publishTryonAction(result.jobId, pubTitle.trim() || undefined);
      if (res.ok) {
        setPublish({ status: 'done' });
        showToast(t('tryon.publishSubmitted', lang));
      } else {
        setPublish({ status: 'error', msg: res.reason });
      }
    });
  };

  const generate = () => {
    if (!canGenerate) {
      setMsg(t('tryon.err.invalid', lang));
      return;
    }
    setMsg(null);
    const allIds = Object.values(sel).flat();
    startTransition(async () => {
      const res = await submitTryonAction(allIds);
      if (!res.ok) {
        setMsg(reasonText(res.reason));
        return;
      }
      setRemaining((r) => Math.max(0, r - 1));
      setResult({ status: 'pending', jobId: res.jobId });
    });
  };

  const summary = GROUPS.flatMap((g) =>
    (sel[g.type] ?? []).map((id) => catalog[g.type].find((it) => it.id === id)).filter(Boolean)
  ).map((it) => `${it!.emoji} ${it!.name}`);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* 左侧：选择区 */}
      <div className="space-y-5">
        {GROUPS.map((g) => (
          <div key={g.type}>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-neutral-700">
                {t(`tryon.group.${g.type}` as never, lang)}
              </h3>
              {g.type === 'accessory' && (
                <span className="text-xs text-neutral-400">{t('tryon.accessoryHint', lang)}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {catalog[g.type].map((it) => {
                const active = (sel[g.type] ?? []).includes(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggle(g.type, it.id)}
                    title={it.name}
                    onMouseEnter={(e) =>
                      it.image_path && setPreview({ it, x: e.clientX, y: e.clientY })
                    }
                    onMouseMove={(e) =>
                      setPreview((p) => (p && p.it.id === it.id ? { it: p.it, x: e.clientX, y: e.clientY } : p))
                    }
                    onMouseLeave={() => setPreview((p) => (p && p.it.id === it.id ? null : p))}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      active
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500'
                    }`}
                  >
                    {it.image_path ? (
                      <span className="inline-flex items-center gap-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl(it.image_path)}
                          alt={it.name}
                          loading="lazy"
                          className="h-8 w-8 rounded-full object-cover"
                        />
                        {it.name}
                      </span>
                    ) : (
                      <>
                        {it.emoji} {it.name}
                      </>
                    )}
                  </button>
                );
              })}
              {catalog[g.type].length === 0 && (
                <span className="text-xs text-neutral-400">—</span>
              )}
            </div>
          </div>
        ))}
        <p className="text-xs text-neutral-400">{t('tryon.selectHint', lang)}</p>
      </div>

      {/* 右侧：结果区 */}
      <div className="space-y-4">
        {summary.length > 0 && (
          <div className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-600 ring-1 ring-neutral-200">
            {summary.join(' · ')}
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">
            {t('tryon.remaining', lang).replace('{n}', isDev ? '∞' : String(remaining))}
          </span>
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className={`rounded-full px-6 py-2.5 text-sm font-semibold transition ${
              canGenerate
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'cursor-not-allowed bg-neutral-200 text-neutral-400'
            }`}
          >
            {pending ? t('tryon.generating', lang) : t('tryon.generate', lang)}
          </button>
        </div>

        {msg && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{msg}</p>}

        {/* 结果图 */}
        <div className="overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-neutral-200">
          {result.status === 'idle' && (
            <div className="flex aspect-square items-center justify-center text-neutral-400">
              🧥
            </div>
          )}
          {result.status === 'pending' && (
            <div className="flex aspect-square flex-col items-center justify-center gap-3 text-neutral-500">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
              <span className="text-sm">{t('tryon.generating', lang)}</span>
            </div>
          )}
          {result.status === 'done' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl(result.image_path)} alt="tryon" className="w-full" />
          )}
          {result.status === 'failed' && (
            <div className="flex aspect-square flex-col items-center justify-center gap-3 text-neutral-500">
              <span className="text-sm">{t('tryon.failed', lang)}</span>
              {result.error && <span className="max-w-xs truncate text-xs text-neutral-400">{result.error}</span>}
              <button
                type="button"
                onClick={() => setResult({ status: 'idle' })}
                className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm hover:border-neutral-500"
              >
                {t('tryon.retry', lang)}
              </button>
            </div>
          )}
        </div>

        {result.status === 'done' && (
          <a
            href={imageUrl(result.image_path)}
            download
            className="inline-block rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            ⬇ {t('tryon.download', lang)}
          </a>
        )}

        {result.status === 'done' && (
          <div className="rounded-xl bg-white p-3 ring-1 ring-neutral-200">
            {publish.status === 'done' ? (
              <p className="text-sm text-green-700">✓ {t('tryon.publishSubmitted', lang)}</p>
            ) : (
              <div className="space-y-2">
                <input
                  value={pubTitle}
                  onChange={(e) => setPubTitle(e.target.value)}
                  placeholder={t('tryon.publishTitle', lang)}
                  disabled={publish.status === 'submitting'}
                  className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                />
                {publish.status === 'error' && (
                  <p className="text-sm text-red-600">{publishErrText(publish.msg ?? '')}</p>
                )}
                <button
                  type="button"
                  onClick={doPublish}
                  disabled={publish.status === 'submitting'}
                  className="w-full rounded-full bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
                >
                  {publish.status === 'submitting' ? t('tryon.publishing', lang) : `📌 ${t('tryon.publish', lang)}`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 发布成功 / 其他全局提示（toast） */}
        {toast && (
          <div
            role="status"
            className="fixed bottom-10 left-1/2 z-50 rounded-full bg-green-600 px-6 py-3 text-sm font-medium text-white shadow-lg animate-[toast-in_.3s_ease-out]"
          >
            ✓ {toast}
          </div>
        )}

        {/* 历史 */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-700">{t('tryon.history', lang)}</h3>
          {history.length === 0 ? (
            <p className="text-xs text-neutral-400">{t('tryon.historyEmpty', lang)}</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {history.map((j) =>
                j.image_path ? (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setResult({ status: 'done', jobId: j.id, image_path: j.image_path! })}
                    className="overflow-hidden rounded-lg ring-1 ring-neutral-200 transition hover:ring-neutral-400"
                    title={j.created_at}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl(j.image_path)} alt="" className="aspect-square w-full object-cover" />
                  </button>
                ) : (
                  <div key={j.id} className="flex aspect-square items-center justify-center rounded-lg bg-neutral-100 text-xs text-neutral-400 ring-1 ring-neutral-200">
                    {j.status === 'pending' ? '…' : '✕'}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
      {/* hover 单品大图预览：鼠标悬停素材时显示（动漫/真人两张对照） */}
      {preview?.it.image_path && (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            left: Math.min(preview.x + 16, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 460),
            top: Math.min(preview.y + 16, (typeof window !== 'undefined' ? window.innerHeight : 768) - 240),
          }}
        >
          <div className="flex gap-2 rounded-xl bg-white p-2 shadow-2xl ring-1 ring-neutral-200">
            {[preview.it.image_path_anime, preview.it.image_path_real]
              .filter(Boolean)
              .map((p, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl(p!)}
                    alt={preview.it.name}
                    className="h-44 w-44 rounded-lg object-cover"
                  />
                  <span className="text-[10px] text-neutral-400">{i === 0 ? '动漫' : '真人'}</span>
                </div>
              ))}
          </div>
          <p className="mt-1 text-center text-xs font-medium text-neutral-700">{preview.it.name}</p>
        </div>
      )}
    </div>
  );
}
