'use client';
import { toast } from 'sonner';
import type { FormState } from '../../../_lib/action';

type FormAction = (prev: FormState, form: FormData) => Promise<FormState>;

/**
 * For cards that remount from their saved values after a save: the remount would unmount the form
 * before its own success toast fires, so the toast is raised here and `ok` is stripped from the state.
 */
export function withToast(action: FormAction): FormAction {
  return async (prev, form) => {
    const res = await action(prev, form);
    if (res.ok) {
      toast.success(res.ok);
      return { ...res, ok: undefined };
    }
    return res;
  };
}
