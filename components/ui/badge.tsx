import * as React from 'react';
import { cva } from 'class-variance-authority';
import type { Tone } from '@/ui/tone';
import { cn } from '@/lib/utils';

// Tinted tones: *-foreground text on *-soft background (contrast-tested pairs). Primary is a solid fill.
const badgeVariants = cva('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', {
  variants: {
    tone: {
      neutral: 'bg-surface-muted text-muted-foreground',
      primary: 'bg-primary text-primary-foreground',
      success: 'bg-success-soft text-success-foreground',
      warning: 'bg-warning-soft text-warning-foreground',
      danger: 'bg-danger-soft text-danger-foreground',
      info: 'bg-info-soft text-info-foreground',
    } satisfies Record<Tone, string>,
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
