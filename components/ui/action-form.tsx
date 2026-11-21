'use client';
import * as React from 'react';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';
import type { FormState } from '../../app/_lib/action';

const FormErrorsContext = React.createContext<Record<string, string>>({});

/** Per-field errors of the enclosing ActionForm (empty outside one). */
export const useFormErrors = () => React.useContext(FormErrorsContext);

/**
 * Form bound to a server action. General errors render at the top (role="alert"), `fieldErrors` flow to
 * FormField via context, submit buttons show loading through useFormStatus, and `state.ok` raises a toast.
 */
export function ActionForm({
  action,
  children,
  className,
  testId,
  successToast,
  render,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  testId?: string;
  successToast?: string;
  render?: (state: FormState) => React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  const formRef = React.useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) toast.success(successToast ?? state.ok);
    // Each submission yields a new state object, so depend on it rather than on the message.
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // After a failed submit with field errors, move focus to the first invalid field.
  useEffect(() => {
    if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className={className} data-testid={testId}>
      {state.error && (
        <p role="alert" className="mb-3 rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger-foreground">
          {state.error}
        </p>
      )}
      <FormErrorsContext.Provider value={state.fieldErrors ?? {}}>{children}</FormErrorsContext.Provider>
      {render?.(state)}
    </form>
  );
}
