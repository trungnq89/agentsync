'use client';
import { Toaster as Sonner } from 'sonner';

/** Sonner toaster wired to design tokens (follows the app's light/dark tokens, not the OS). */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      style={
        {
          '--normal-bg': 'var(--surface)',
          '--normal-text': 'var(--foreground)',
          '--normal-border': 'var(--border)',
          '--success-bg': 'var(--success-soft)',
          '--success-text': 'var(--success-foreground)',
          '--success-border': 'var(--success)',
          '--error-bg': 'var(--danger-soft)',
          '--error-text': 'var(--danger-foreground)',
          '--error-border': 'var(--danger)',
        } as React.CSSProperties
      }
    />
  );
}
