'use client';

import type { ReactNode } from 'react';

/**
 * Wraps a server action in a <form> that asks for confirmation first.
 * Server actions can be passed from a Server Component as a prop.
 */
export default function ConfirmForm({
  action,
  confirm,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  confirm: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
