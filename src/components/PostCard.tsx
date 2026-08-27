import Link from 'next/link';
import { parseMulti, type Lang } from '@/lib/config';
import { siteUrl } from '@/lib/site';
import type { Post } from '@/lib/db';
import { t as ui } from '@/lib/i18n';
import LikeButton from './LikeButton';
import ShareButton from './ShareButton';

export default async function PostCard({
  post,
  lang,
  prefix,
  tags,
  liked,
  commentCount = 0,
}: {
  post: Post;
  lang: Lang;
  prefix: string;
  tags: string[];
  liked: boolean;
  commentCount?: number;
}) {
  const t = parseMulti(post.title_json);
  const title = t?.[lang] ?? t?.en ?? '';
  const href = `${prefix}/page/${post.slug}`;
  const shareUrl = `${await siteUrl()}${href}`;
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 transition hover:shadow-md">
      <Link href={href}>
        {post.image_path && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/${post.image_path}`} alt={title} className="aspect-square w-full object-cover" />
        )}
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Link href={href}>
          <h2 className="line-clamp-2 text-sm font-medium group-hover:underline">{title}</h2>
        </Link>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.slice(0, 3).map((tag) => (
              <Link
                key={tag}
                href={`${prefix}/tag/${encodeURIComponent(tag)}`}
                className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-200"
              >
                {tag}
              </Link>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <LikeButton id={post.id} count={post.likes} liked={liked} ariaLabel={ui('like.aria', lang)} />
          <ShareButton
            url={shareUrl}
            title={title}
            label={ui('share.label', lang)}
            copiedText={ui('share.copied', lang)}
            failedText={ui('share.failed', lang)}
          />
          <Link
            href={`${href}#comments`}
            className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 transition hover:bg-neutral-200"
          >
            💬 {commentCount}
          </Link>
        </div>
      </div>
    </div>
  );
}
