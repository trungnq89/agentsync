'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';

/** Collapsible remainder of the activity list; the items are rendered by the server and passed as children. */
export function ActivityMore({
  children, showMore, showLess,
}: {
  children: React.ReactNode;
  showMore: string;
  showLess: string;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <>
      <ul id={id} hidden={!open} className="mt-2 space-y-2">{children}</ul>
      <Button variant="ghost" size="sm" className="mt-2" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {open ? showLess : showMore}
      </Button>
    </>
  );
}
