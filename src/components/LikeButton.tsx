'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { likeAction } from '@/app/[lang]/actions';

export default function LikeButton({ id, count, liked, ariaLabel }: { id: number; count: number; liked: boolean; ariaLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (liked || pending) return;
    startTransition(async () => {
      await likeAction(id);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={liked || pending}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs transition ${
        liked
          ? 'bg-rose-100 text-rose-600'
          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
      } ${pending ? 'opacity-60' : ''}`}
    >
      {liked ? '♥' : '♡'} {count}
    </button>
  );
}
