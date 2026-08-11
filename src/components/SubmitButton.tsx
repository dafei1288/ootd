'use client';

import { useFormStatus } from 'react-dom';

/**
 * Submit button that reflects the pending state of its parent <form action>.
 * Must be rendered as a descendant of the form (useFormStatus reads context).
 */
export default function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white transition disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
