'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ActionForm } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import type { FormState } from '../../_lib/action';
import { resetPasswordAction, setUserDisabledAction, updateUserAction } from '../../_actions/admin';
import { CheckField, LevelField, ManagerField, type Person } from './fields';

export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  level: string;
  managerId: string | null;
  isAdmin: boolean;
  disabled: boolean;
};

export function UserActions({ user, people }: { user: AdminUser; people: Person[] }) {
  const t = useTranslations('admin');
  const [open, setOpen] = React.useState(false);

  // The dialog unmounts on close, so its forms' own toasts would never fire: close and toast here.
  const closing = (action: (p: FormState, f: FormData) => Promise<FormState>) => async (p: FormState, f: FormData) => {
    const res = await action(p, f);
    if (!res.error && !res.fieldErrors) {
      setOpen(false);
      if (res.ok) toast.success(res.ok);
    }
    return res;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">{t('edit')}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="break-words">{t('editTitle', { username: user.username })}</DialogTitle>
            <DialogDescription className="sr-only">{user.displayName}</DialogDescription>
          </DialogHeader>
          <ActionForm action={closing(updateUserAction)} className="grid gap-4">
            <input type="hidden" name="userId" value={user.id} />
            <FormField name="displayName" label={t('displayName')}>
              <Input defaultValue={user.displayName} required />
            </FormField>
            <LevelField defaultValue={user.level} />
            <ManagerField people={people} value={user.managerId} excludeId={user.id} />
            <CheckField name="isAdmin" label={t('isAdmin')} defaultChecked={user.isAdmin} />
            <Button type="submit">{t('save')}</Button>
          </ActionForm>
          <Separator />
          <ActionForm action={closing(resetPasswordAction)} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="userId" value={user.id} />
            <FormField name="password" label={t('resetPassword')} className="min-w-0 flex-1">
              <Input type="password" autoComplete="new-password" required />
            </FormField>
            <Button type="submit" variant="outline">{t('reset')}</Button>
          </ActionForm>
        </DialogContent>
      </Dialog>
      {user.disabled ? (
        <ActionForm action={setUserDisabledAction}>
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="disabled" value="false" />
          <Button type="submit" variant="outline" size="sm">{t('enable')}</Button>
        </ActionForm>
      ) : (
        <ConfirmAction
          title={t('disableTitle', { username: user.username })}
          description={t('disableDesc')}
          confirmLabel={t('disable')}
          tone="destructive"
          action={setUserDisabledAction}
          trigger={<Button variant="destructive" size="sm">{t('disable')}</Button>}
          fields={
            <>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="disabled" value="true" />
            </>
          }
        />
      )}
    </div>
  );
}
