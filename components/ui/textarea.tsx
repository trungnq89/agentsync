'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { useFieldContext } from './form-field';
import { inputClass } from './input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    const f = useFieldContext();
    return (
      <textarea
        ref={ref}
        id={f?.id}
        name={f?.name}
        aria-invalid={f?.invalid || undefined}
        aria-describedby={f?.describedBy}
        className={cn(inputClass, 'h-auto min-h-20 py-2', className)}
        {...props}
      />
    );
  },
);
