'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { useFieldContext } from './form-field';

export const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-danger';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  const f = useFieldContext();
  return (
    <input
      ref={ref}
      className={cn(inputClass, className)}
      {...props}
      id={f?.id ?? props.id}
      name={f?.name ?? props.name}
      aria-invalid={f?.invalid || props['aria-invalid'] || undefined}
      aria-describedby={f?.describedBy ?? props['aria-describedby']}
    />
  );
});
