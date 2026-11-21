'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { useFormErrors } from './action-form';
import { Label } from './label';

type FieldContextValue = { id: string; name: string; invalid: boolean; describedBy?: string };
const FieldContext = React.createContext<FieldContextValue | null>(null);

/** Wiring (id, name, aria-invalid, aria-describedby) of the enclosing FormField, if any. */
export const useFieldContext = () => React.useContext(FieldContext);

/**
 * Label + control + hint + error. Wires `id`, `aria-invalid` and `aria-describedby` into the control:
 * our Input/Textarea/Select/Checkbox read them from context, native children get them by cloning.
 * `error` falls back to the enclosing ActionForm's `fieldErrors[name]`.
 */
export function FormField({
  name,
  label,
  hint,
  error,
  className,
  children,
}: {
  name: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const reactId = React.useId();
  const fieldErrors = useFormErrors();
  const message = error ?? fieldErrors[name];
  const id = `${reactId}-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = message ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  const value: FieldContextValue = { id, name, invalid: !!message, describedBy };

  const control =
    React.isValidElement<Record<string, unknown>>(children) && typeof children.type === 'string'
      ? React.cloneElement(children, {
          id,
          name,
          'aria-invalid': message ? true : undefined,
          'aria-describedby': describedBy,
        })
      : children;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <FieldContext.Provider value={value}>{control}</FieldContext.Provider>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {message && (
        <p id={errorId} aria-live="polite" className="text-xs text-danger-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
