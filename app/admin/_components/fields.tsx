'use client';
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type Person = { id: string; displayName: string; disabled: boolean };
export const LEVELS = ['director', 'manager', 'leader', 'member'] as const;
/** Radix Select items cannot have an empty value, so "no manager" travels as this sentinel. */
export const NO_MANAGER = 'none';

export function LevelField({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations('admin');
  const tLevel = useTranslations('level');
  return (
    <FormField name="level" label={t('level')}>
      <Select defaultValue={defaultValue}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LEVELS.map((l) => (
            <SelectItem key={l} value={l}>
              {tLevel(l)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

/** A disabled manager stays selectable only when they are the current value. */
export function ManagerField({ people, value, excludeId }: { people: Person[]; value: string | null; excludeId?: string }) {
  const t = useTranslations('admin');
  return (
    <FormField name="managerId" label={t('manager')}>
      <Select defaultValue={value ?? NO_MANAGER}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_MANAGER}>{t('noManager')}</SelectItem>
          {people
            .filter((p) => p.id !== excludeId && (!p.disabled || p.id === value))
            .map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.displayName}
                {p.disabled ? ` ${t('disabledSuffix')}` : ''}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

export function CheckField({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 self-end pb-2">
      <Checkbox id={id} name={name} defaultChecked={defaultChecked} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
