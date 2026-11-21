'use client';
import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '@/lib/utils';

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => Array.from(w)[0]?.toLocaleUpperCase() ?? '')
    .join('');

/** Circular avatar; shows the image when given, else the name's initials. */
export function Avatar({ name, src, className }: { name: string; src?: string; className?: string }) {
  return (
    <AvatarPrimitive.Root
      className={cn('relative inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-muted', className)}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name} className="h-full w-full object-cover" />}
      <AvatarPrimitive.Fallback
        aria-label={name}
        className="flex h-full w-full items-center justify-center text-xs font-bold text-foreground"
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
