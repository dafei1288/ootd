import Link from 'next/link';
import { cookies } from 'next/headers';
import { listAll, usageByModel, logCost, listLogsWithTopic, tagStats, getSetting, listSearchTerms, listAllComments, commentStats, listAllWishes, countWishes, type Post, type LogWithTopic, type SearchTerm, type CommentWithPost } from '@/lib/db';
import { TEXT_PRICES, IMAGE_PRICES } from '@/lib/config';
import { login, logout, importTopics, genTopicsAction, runAction, retryAction, deleteAction, saveSettings, clearLogsAction, seedFromSearchAction, dismissSearchAction, hideCommentAction, approveCommentAction, deleteCommentAction, executeWishesAction, deleteWishAction } from './actions';
import ConfirmForm from '@/components/ConfirmForm';
import { geoForIps, isPrivateIp, type IpGeo } from '@/lib/geo';

export const dynamic = 'force-dynamic';

const STATUS_COLOR: Record<string, string> = {
  published: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-neutral-200 text-neutral-700',
};

const COMMENT_STATUS_COLOR: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  hidden: 'bg-neutral-200 text-neutral-600',
};

function labelFor(g: IpGeo | undefined): string {
  if (!g) return '—';
  return [g.country, g.region].filter(Boolean).join(' ') || '—';
}

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

function CommentRow({ c, geoMap }: { c: CommentWithPost; geoMap: Map<string, IpGeo> }) {
  const postHref = c.slug ? `/page/${c.slug}#comments` : null;
  const geoLabel = !c.ip ? '' : isPrivateIp(c.ip) ? '本地' : labelFor(geoMap.get(c.ip));
  return (
    <tr className="border-b text-sm last:border-0">
      <td className="max-w-sm px-3 py-2 align-top">
        {/* User-submitted text rendered as plain text (React escapes). */}
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-neutral-800" title={c.body}>
          {c.body}
        </p>
      </td>
      <td className="px-3 py-2 align-top text-neutral-600">{c.author.trim() || '匿名'}</td>
      <td className="px-3 py-2 align-top">
        <div className="font-mono text-xs text-neutral-500" title={c.ip}>
          {c.ip || '-'}
        </div>
        {geoLabel && <div className="text-xs text-neutral-400">{geoLabel}</div>}
      </td>
      <td className="px-3 py-2 align-top text-neutral-500">
        {postHref ? (
          <Link href={postHref} className="hover:underline" title={c.topic ?? ''}>
            {(c.topic ?? `#${c.post_id}`).slice(0, 24)}
          </Link>
        ) : (
          <span className="text-neutral-400" title="卡片已被删除">
            已删除 #{c.post_id}
          </span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <span className={`rounded px-1.5 py-0.5 text-xs ${COMMENT_STATUS_COLOR[c.status] ?? 'bg-blue-100 text-blue-800'}`}>
          {c.status === 'approved' ? '已显示' : '已隐藏'}
        </span>
      </td>
      <td className="px-3 py-2 align-top text-neutral-500">{c.created_at}</td>
      <td className="px-3 py-2 align-top">
        <div className="flex gap-2">
          {c.status === 'approved' ? (
            <form action={hideCommentAction}>
              <input type="hidden" name="id" value={c.id} />
              <button className="text-neutral-500 hover:underline">隐藏</button>
            </form>
          ) : (
            <form action={approveCommentAction}>
              <input type="hidden" name="id" value={c.id} />
              <button className="text-blue-600 hover:underline">显示</button>
            </form>
          )}
          <ConfirmForm action={deleteCommentAction} confirm="确定删除这条留言？此操作不可恢复。">
            <input type="hidden" name="id" value={c.id} />
            <button className="text-red-600 hover:underline">删除</button>
          </ConfirmForm>
        </div>
      </td>
    </tr>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ cstatus?: string }> }) {
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
  const currentSiteName = getSetting('site_name') ?? '';
  const searches = listSearchTerms(60);

  const { cstatus } = await searchParams;
  const commentStatusFilter = cstatus === 'approved' || cstatus === 'hidden' ? cstatus : undefined;
  const comments = listAllComments(200, commentStatusFilter);
  const cStats = commentStats();
  const geoMap = await geoForIps(comments.map((c) => c.ip));

  const wishes = listAllWishes(200);
  const wStats = countWishes();
  const wishGeoMap = await geoForIps(wishes.map((w) => w.ip));

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
        <form action={saveSettings} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
          <h2 className="mb-2 font-medium">网站设置</h2>
          <label className="mb-1 block text-xs text-neutral-500">网站名称（页头 / 页脚 / 标题）</label>
          <input
            type="text"
            name="site_name"
            defaultValue={currentSiteName}
            placeholder="Anime OOTD"
            className="mb-2 w-full rounded border border-neutral-300 p-2 text-sm"
          />
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">保存</button>
        </form>
        <ConfirmForm
          action={clearLogsAction}
          confirm="确定清空全部 LLM 调用日志？此操作不可恢复。"
          className="flex flex-col justify-between rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200"
        >
          <div>
            <h2 className="mb-2 font-medium">日志维护</h2>
            <p className="text-xs text-neutral-500">批量移除全部 LLM 调用日志（费用统计将一并清零）。</p>
          </div>
          <button className="mt-3 w-fit rounded bg-red-600 px-3 py-1.5 text-sm text-white">清空 LLM 日志</button>
        </ConfirmForm>
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
        留言管理
        <span className="ml-3 text-sm font-normal text-neutral-500">
          共 {cStats.total} 条 · 已显示 {cStats.approved} · 已隐藏 {cStats.hidden}
        </span>
      </h2>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {(['all', 'approved', 'hidden'] as const).map((s) => {
          const active = (cstatus ?? 'all') === s;
          const label = s === 'all' ? '全部' : s === 'approved' ? '已显示' : '已隐藏';
          return (
            <Link
              key={s}
              href={s === 'all' ? '/admin_config' : `/admin_config?cstatus=${s}`}
              className={`rounded-full px-3 py-1 ${active ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
            >
              {label}
            </Link>
          );
        })}
      </div>
      {comments.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-neutral-400 shadow-sm ring-1 ring-neutral-200">暂无留言。</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-xs text-neutral-500">
                <th className="px-3 py-2">留言</th>
                <th className="px-3 py-2">昵称</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">所属卡片</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">时间</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {comments.map((c) => (
                <CommentRow key={c.id} c={c} geoMap={geoMap} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 mt-10 font-medium">
        许愿池
        <span className="ml-3 text-sm font-normal text-neutral-500">
          共 {wStats.total} · 待处理 {wStats.pending} · 已完成 {wStats.done}
        </span>
      </h2>
      {wishes.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-neutral-400 shadow-sm ring-1 ring-neutral-200">暂无许愿。</p>
      ) : (
        <form action={executeWishesAction}>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs text-neutral-500">
                  <th className="px-3 py-2"></th>
                  <th className="px-3 py-2">许愿内容</th>
                  <th className="px-3 py-2">昵称</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">生成结果</th>
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {wishes.map((w) => {
                  const ipLabel = !w.ip ? '' : isPrivateIp(w.ip) ? '本地' : labelFor(wishGeoMap.get(w.ip));
                  const ready = w.status === 'done' && w.post_status === 'published' && w.slug;
                  return (
                    <tr key={w.id} className="border-b text-sm last:border-0">
                      <td className="px-3 py-2 align-top">
                        {w.status === 'pending' && <input type="checkbox" name="ids" value={w.id} className="mt-1" />}
                      </td>
                      <td className="max-w-xs px-3 py-2 align-top text-neutral-800">{w.content}</td>
                      <td className="px-3 py-2 align-top text-neutral-600">{w.nickname.trim() || '匿名'}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-mono text-xs text-neutral-500">{w.ip || '-'}</div>
                        {ipLabel && <div className="text-xs text-neutral-400">{ipLabel}</div>}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            w.status === 'done' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {w.status === 'done' ? '已完成' : '待处理'}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {w.status === 'done' ? (
                          ready ? (
                            <Link href={`/page/${w.slug}`} className="text-xs text-blue-600 hover:underline">
                              查看
                            </Link>
                          ) : (
                            <span className="text-xs text-neutral-400">生成中</span>
                          )
                        ) : (
                          <span className="text-xs text-neutral-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-neutral-500">
                        {w.status === 'done' ? w.completed_at : w.created_at}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {/* formAction overrides the form's batch action for this single row */}
                        <button type="submit" formAction={deleteWishAction} name="deleteId" value={w.id} className="text-red-600 hover:underline">
                          删除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="submit" className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">
            执行选中
          </button>
        </form>
      )}

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

      <h2 className="mb-3 mt-10 font-medium">
        用户搜索词
        <span className="ml-3 text-sm font-normal text-neutral-500">按搜索次数统计；红色为站内无匹配，建议据此新增内容</span>
      </h2>
      {searches.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-neutral-400 shadow-sm ring-1 ring-neutral-200">暂无搜索记录。</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-xs text-neutral-500">
                <th className="px-3 py-2">搜索词</th>
                <th className="px-3 py-2">语言</th>
                <th className="px-3 py-2">次数</th>
                <th className="px-3 py-2">命中</th>
                <th className="px-3 py-2">最近</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {searches.map((s) => {
                const noMatch = s.found === 0;
                return (
                  <tr key={`${s.lang}:${s.term}`} className="border-b text-sm last:border-0">
                    <td className="px-3 py-2 font-medium">
                      {s.term}
                      {noMatch && (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">无匹配 · 建议新增</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-neutral-500">{s.lang}</td>
                    <td className="px-3 py-2">{s.hits}</td>
                    <td className="px-3 py-2">{s.found}</td>
                    <td className="px-3 py-2 text-neutral-500">{s.last_at}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <form action={seedFromSearchAction}>
                          <input type="hidden" name="term" value={s.term} />
                          <button className="text-blue-600 hover:underline">用此词生成</button>
                        </form>
                        <form action={dismissSearchAction}>
                          <input type="hidden" name="term" value={s.term} />
                          <input type="hidden" name="lang" value={s.lang} />
                          <button className="text-neutral-400 hover:underline">忽略</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
