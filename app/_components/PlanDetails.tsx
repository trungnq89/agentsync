'use client';
import { useState } from 'react';

/** The plan disclosure opens once on mount (when steps are waiting) and then follows the user, never snapping shut on revalidation. */
export function PlanDetails({ initialOpen, children }: { initialOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details className="group" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      {children}
    </details>
  );
}
