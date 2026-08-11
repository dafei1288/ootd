'use client';

import { useState } from 'react';

export default function ShareButton({
  url,
  title,
  label,
  copiedText,
  failedText,
}: {
  url: string;
  title?: string;
  label: string;
  copiedText: string;
  failedText: string;
}) {
  const [hint, setHint] = useState('');

  async function share() {
    const data = { title: title ?? document.title, url };
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share(data);
        return;
      }
    } catch {
      /* user cancelled — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url);
      setHint(copiedText);
    } catch {
      setHint(failedText);
    }
    setTimeout(() => setHint(''), 2000);
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-200"
      aria-label={label}
    >
      ↗ {label}
      {hint && <span className="ml-1 text-neutral-500">{hint}</span>}
    </button>
  );
}
