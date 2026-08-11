import { listComments } from '@/lib/db';
import { addCommentAction } from '@/app/[lang]/actions';
import type { Lang } from '@/lib/config';
import { t } from '@/lib/i18n';
import SubmitButton from './SubmitButton';

/**
 * Per-card 留言 section for the post detail page. Server Component: reads
 * approved comments directly from the DB and renders a progressive-enhancement
 * <form action> for submission (no client JS required to post).
 */
export default function Comments({ postId, lang }: { postId: number; lang: Lang }) {
  const comments = listComments(postId);

  return (
    <section id="comments" className="mt-12">
      <h2 className="mb-4 text-lg font-bold">
        {t('comments.title', lang)}
        {comments.length > 0 && <span className="ml-1 text-sm font-normal text-neutral-400">{comments.length}</span>}
      </h2>

      <ul className="mb-6 space-y-3">
        {comments.length === 0 ? (
          <li className="rounded-xl bg-white p-4 text-sm text-neutral-400 shadow-sm ring-1 ring-neutral-200">
            {t('comments.empty', lang)}
          </li>
        ) : (
          comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-neutral-900">{c.author.trim() || t('ui.anon', lang)}</span>
                <time className="text-xs text-neutral-400">{c.created_at}</time>
              </div>
              {/* User-submitted text: rendered as plain text so React escapes it (no dangerouslySetInnerHTML). */}
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700">{c.body}</p>
            </li>
          ))
        )}
      </ul>

      <form action={addCommentAction} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="lang" value={lang} />
        <label className="mb-1 block text-xs text-neutral-500">{t('ui.nickname', lang)}</label>
        <input
          type="text"
          name="author"
          maxLength={50}
          placeholder={t('ui.anon', lang)}
          className="mb-3 w-full max-w-xs rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <label className="mb-1 block text-xs text-neutral-500">{t('comments.body', lang)}</label>
        <textarea
          name="body"
          required
          maxLength={1000}
          rows={3}
          placeholder={t('comments.placeholder', lang)}
          className="mb-3 w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <SubmitButton label={t('comments.submit', lang)} pendingLabel={t('comments.submitting', lang)} />
      </form>
    </section>
  );
}
