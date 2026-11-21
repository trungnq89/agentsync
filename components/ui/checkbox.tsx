'use client';
import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFieldContext } from './form-field';

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  const f = useFieldContext();
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer h-4 w-4 shrink-0 rounded-sm border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
      id={f?.id ?? props.id}
      name={f?.name ?? props.name}
      aria-invalid={f?.invalid || props['aria-invalid'] || undefined}
      aria-describedby={f?.describedBy ?? props['aria-describedby']}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check className="h-3 w-3" aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
