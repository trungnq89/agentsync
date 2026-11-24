'use client';
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useFormErrors } from '@/components/ui/action-form';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TIME_OPTIONS } from '../_lib/timezones';

/** Send-time dropdown in 15 minute steps. `label` may carry an "(company default)" suffix. */
export function TimeField({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <FormField name="time" label={label}>
      <Select defaultValue={value}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIME_OPTIONS.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

/** Time zone input with a native searchable suggestion list; the server validates the IANA name. */
export function TimezoneField({ label, value, zones, hint }: { label: React.ReactNode; value: string; zones: string[]; hint?: string }) {
  const listId = useId();
  return (
    <FormField name="timezone" label={label} hint={hint}>
      <Input list={listId} defaultValue={value} autoComplete="off" spellCheck={false} />
      <datalist id={listId}>
        {zones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
    </FormField>
  );
}

/** Weekday checkboxes (1 = Monday ... 7 = Sunday) submitted as repeated `days` values. */
export function DaysField({ label, value }: { label: React.ReactNode; value: number[] }) {
  const t = useTranslations('slack');
  const baseId = useId();
  const error = useFormErrors().days;
  return (
    <fieldset className="min-w-0 space-y-1.5" aria-invalid={error ? true : undefined}>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2" data-testid="digest-days">
        {([1, 2, 3, 4, 5, 6, 7] as const).map((d) => (
          <div key={d} className="flex items-center gap-2">
            <Checkbox id={`${baseId}-${d}`} name="days" value={String(d)} defaultChecked={value.includes(d)} />
            <Label htmlFor={`${baseId}-${d}`}>{t(`day${d}`)}</Label>
          </div>
        ))}
      </div>
      {error && (
        <p aria-live="polite" role="alert" className="text-xs text-danger-foreground">
          {error}
        </p>
      )}
    </fieldset>
  );
}
