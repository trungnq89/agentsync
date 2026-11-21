'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { FormState } from '../../app/_lib/action';
import { ActionForm } from './action-form';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';
import { Button } from './button';

/**
 * AlertDialog wrapping a server-action form, for dangerous actions and actions needing a note.
 * `trigger` is the visible opener (a button); `fields` (e.g. a note FormField) render inside the form.
 * The dialog closes after a successful result and shows errors inline otherwise.
 */
export function ConfirmAction({
  title,
  description,
  confirmLabel,
  tone,
  action,
  fields,
  trigger,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  tone: 'destructive' | 'primary';
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  fields?: React.ReactNode;
  trigger: React.ReactNode;
}) {
  const t = useTranslations('common');
  const [open, setOpen] = React.useState(false);

  const wrapped = async (prev: FormState, form: FormData) => {
    const res = await action(prev, form);
    if (!res.error && !res.fieldErrors) {
      setOpen(false);
      // The dialog (and its ActionForm) unmounts on close, so the form's own toast would never fire.
      if (res.ok) toast.success(res.ok);
    }
    return res;
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <ActionForm action={wrapped} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {fields}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <Button type="submit" variant={tone === 'destructive' ? 'destructive' : 'primary'}>
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </ActionForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}
