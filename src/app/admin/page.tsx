import { cookies } from 'next/headers';
import { listAll, usageByModel, logCost, listLogsWithTopic, tagStats, type Post, type LogWithTopic } from '@/lib/db';
import { TEXT_PRICES, IMAGE_PRICES } from '@/lib/config';
import { login, logout, importTopics, genTopicsAction, runAction, retryAction, deleteAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_COLOR: Record<string, string> = {
  published: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-neutral-200 text-neutral-700',
};

function Row({ p }: { p: Post }) {
  return (
    <tr className="border-t border-neutral-200 text-sm">
      <td className="px-2 py-2">{p.id}</td>
      <td className="px-2 py-2">
        <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_COLOR[p.status] ?? 'bg-blue-100 text-blue-800'}`}>
          {p.status}
        </span>
      </td>
      <td className="px-2 py-2">{p.attempts}</td>
      <td className="max-w-xs truncate px-2 py-2" title={p.topic}>
        {p.slug ?? p.topic.slice(0, 40)}
      </td>
      <td className="max-w-xs truncate px-2 py-2 text-red-600" title={p.error ?? ''}>
        {p.error?.slice(0, 80)}
      </td>
      <td className="px-2 py-2 text-neutral-500">{p.created_at}</td>
      <td className="px-2 py-2">
        <div className="flex gap-2">
          {(p.status === 'failed' || p.attempts > 0) && (
            <form action={retryAction}>
              <input type="hidden" name="id" value={p.id} />
              <button className="text-blue-600 hover:underline">重试</button>
            </form>
          )}
          <form action={deleteAction}>
            <input type="hidden" name="id" value={p.id} />
            <button className="text-red-600 hover:underline">删除</button>
          </form>
        </div>
      </td>
    </tr>
  );
}

export default async function AdminPage() {
  const authed = !!process.env.ADMIN_TOKEN && (await cookies()).get('admin')?.value === process.env.ADMIN_TOKEN;

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm py-24">
        <h1 className="mb-6 text-xl font-bold">Admin 登录</h1>
        <form action={login} className="flex gap-2">
          <input
            type="password"
            name="token"
            placeholder="ADMIN_TOKEN"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2"
          />
          <button className="rounded-lg bg-neutral-900 px-4 py-2 text-white">登录</button>
        </form>
      </div>
    );
  }

  const posts = listAll(100);
  const usage = usageByModel();
  let textCost = 0;
  let imageCost = 0;
  const costByModel: Record<string, number> = {};
  for (const u of usage) {
    let c = 0;
    const tp = TEXT_PRICES[u.model];
    if (tp) {
      const t = (u.prompt_tokens * tp.input + u.completion_tokens * tp.output) / 1e6;
      textCost += t;
      c += t;
    }
    const ip = IMAGE_PRICES[u.model];
    if (typeof ip === 'number') {
      imageCost += u.images * ip;
      c += u.images * ip;
    } else if (ip) {
      const t = (u.prompt_tokens * ip.input + u.completion_tokens * ip.output) / 1e6;
      imageCost += t;
      c += t;
    }
    costByModel[u.model] = c;
  }
  const totalCalls = usage.reduce((s, u) => s + u.calls, 0);
  const totalPrompt = usage.reduce((s, u) => s + u.prompt_tokens, 0);
  const totalCompletion = usage.reduce((s, u) => s + u.completion_tokens, 0);

  const tagsTop = tagStats(40);

  const groups = new Map<string, { topic: string | null; logs: LogWithTopic[] }>();
  for (const l of listLogsWithTopic(300)) {
    const key = l.post_id != null ? String(l.post_id) : 'none';
    const g = groups.get(key) ?? { topic: l.topic, logs: [] };
    g.logs.push(l);
    groups.set(key, g);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-bold">内容工厂后台</h1>
        <form action={logout}>
          <button className="text-sm text-neutral-500 hover:underline">退出</button>
        </form>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
          <h2 className="mb-2 font-medium">Token 消耗</h2>
          <p className="mb-2 text-sm text-neutral-700">
            共 {totalCalls} 次调用 · prompt {totalPrompt} · completion {totalCompletion}
          </p>
          <ul className="space-y-1 text-xs text-neutral-500">
            {usage.map((u) => (
              <li key={u.model}>
                {u.model}:{u.calls} 次 · {u.prompt_tokens}/{u.completion_tokens} tokens
                {u.images > 0 && ` · ${u.images} 张图`}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
          <h2 className="mb-2 font-medium">费用</h2>
          <p className="mb-2 text-sm text-green-700">
            文本 ¥{textCost.toFixed(3)} + 图片 ¥{imageCost.toFixed(2)} = <b>¥{(textCost + imageCost).toFixed(2)}</b>
          </p>
          <ul className="space-y-1 text-xs text-neutral-500">
            {Object.entries(costByModel).map(([m, c]) => (
              <li key={m}>
                {m}:¥{c.toFixed(3)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <form action={importTopics} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200 md:col-span-1">
          <h2 className="mb-2 font-medium">批量导入主题(每行一个)</h2>
          <textarea name="topics" rows={4} className="mb-2 w-full rounded border border-neutral-300 p-2 text-sm" />
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">导入</button>
        </form>

        <form action={genTopicsAction} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
          <h2 className="mb-2 font-medium">AI 生成主题</h2>
          <input type="number" name="n" defaultValue={1} min={1} max={10} className="mb-2 w-full rounded border border-neutral-300 p-2 text-sm" />
          <input
            type="text"
            name="hint"
            placeholder="限定(选填):如 初音未来 / EVA+婚纱"
            className="mb-2 w-full rounded border border-neutral-300 p-2 text-sm"
          />
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">生成</button>
        </form>

        <form action={runAction} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
          <h2 className="mb-2 font-medium">跑流水线</h2>
          <p className="mb-2 text-xs text-neutral-500">处理队列中最多 RUN_MAX_POSTS 条,含失败重试</p>
          <button className="rounded bg-green-700 px-3 py-1.5 text-sm text-white">运行</button>
        </form>
      </div>

      <table className="w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
        <thead>
          <tr className="text-left text-xs text-neutral-500">
            <th className="px-2 py-2">ID</th>
            <th className="px-2 py-2">状态</th>
            <th className="px-2 py-2">尝试</th>
            <th className="px-2 py-2">Slug / 主题</th>
            <th className="px-2 py-2">错误</th>
            <th className="px-2 py-2">创建时间</th>
            <th className="px-2 py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <Row key={p.id} p={p} />
          ))}
        </tbody>
      </table>

      <h2 className="mb-3 mt-10 font-medium">
        标签热度
        <span className="ml-3 text-sm font-normal text-neutral-500">按文章数统计(中文标签;旧数据未分类)</span>
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {([
          ['char', '人物'],
          ['style', '穿搭'],
          ['other', '未分类'],
        ] as const).map(([kind, label]) => (
          <div key={kind} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
            <h3 className="mb-2 text-sm font-medium text-neutral-600">{label}</h3>
            <div className="flex flex-wrap gap-2">
              {tagsTop
                .filter((t) => t.kind === kind)
                .map((t) => (
                  <span key={t.tag} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700">
                    {t.tag} <b className="text-neutral-900">{t.c}</b>
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-10 font-medium">LLM 调用日志(按主题聚合)</h2>
      <div className="space-y-2">
        {[...groups.entries()].map(([key, g]) => {
          const pt = g.logs.reduce((s, l) => s + (l.prompt_tokens ?? 0), 0);
          const ct = g.logs.reduce((s, l) => s + (l.completion_tokens ?? 0), 0);
          const cost = g.logs.reduce((s, l) => s + (logCost(l) ?? 0), 0);
          const errs = g.logs.filter((l) => l.error).length;
          return (
            <details key={key} className="rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
              <summary className="cursor-pointer select-none px-4 py-2 text-sm">
                {key === 'none' ? '未关联(选题生成 / 早期日志)' : `#${key} ${(g.topic ?? '').slice(0, 40)}`}
                <span className="ml-3 text-xs text-neutral-500">
                  {g.logs.length} 次 · {pt}/{ct} tokens · ¥{cost.toFixed(3)}
                </span>
                {errs > 0 && <span className="ml-2 text-xs text-red-600">{errs} 个错误</span>}
              </summary>
              <table className="w-full border-t border-neutral-200">
                <thead>
                  <tr className="text-left text-xs text-neutral-500">
                    <th className="px-2 py-2">ID</th>
                    <th className="px-2 py-2">时间</th>
                    <th className="px-2 py-2">步骤</th>
                    <th className="px-2 py-2">模型</th>
                    <th className="px-2 py-2">耗时</th>
                    <th className="px-2 py-2">tokens(p/c)</th>
                    <th className="px-2 py-2">费用¥</th>
                    <th className="px-2 py-2">结果 / 错误</th>
                  </tr>
                </thead>
                <tbody>
                  {g.logs.map((l) => (
                    <tr key={l.id} className="border-t border-neutral-200 text-sm">
                      <td className="px-2 py-1.5">{l.id}</td>
                      <td className="px-2 py-1.5 text-neutral-500">{l.ts}</td>
                      <td className="px-2 py-1.5">{l.step}</td>
                      <td className="px-2 py-1.5">{l.model}</td>
                      <td className="px-2 py-1.5">{l.duration_ms != null ? `${(l.duration_ms / 1000).toFixed(1)}s` : '-'}</td>
                      <td className="px-2 py-1.5">
                        {l.prompt_tokens ?? '-'} / {l.completion_tokens ?? '-'}
                      </td>
                      <td className="px-2 py-1.5">{logCost(l)?.toFixed(4) ?? '-'}</td>
                      <td
                        className={`max-w-md truncate px-2 py-1.5 ${l.error ? 'text-red-600' : 'text-neutral-600'}`}
                        title={l.error ?? l.result ?? ''}
                      >
                        {l.error ?? l.result?.slice(0, 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          );
        })}
      </div>
    </div>
  );
}
