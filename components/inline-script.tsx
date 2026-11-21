'use client';
/** Inline script that runs on the server-rendered HTML but is inert (and warning-free) when React re-renders it on the client. */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
