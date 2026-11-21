'use client';
import { useActionState, type ReactNode } from 'react';
import type { FormState } from '../_lib/action';

export const input =
  'w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700';
export const button =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300';
export const buttonQuiet =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800';
export const card = 'rounded-lg border border-neutral-200 p-4 dark:border-neutral-800';

/** Form bound to a server action; shows its error/ok message and any extra result via `render`. */
export function ActionForm({
  action,
  children,
  className,
  render,
  testId,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  render?: (state: FormState) => ReactNode;
  testId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className} data-testid={testId} aria-busy={pending}>
      {children}
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="mt-2 text-sm text-green-700 dark:text-green-400">
          {state.ok}
        </p>
      )}
      {render?.(state)}
    </form>
  );
}
