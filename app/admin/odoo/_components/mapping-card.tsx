'use client';
import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { ActionForm, useFormErrors } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { saveMappingAction } from '../../../_actions/odoo';
import { LEVELS } from '../../_components/fields';
import { withToast } from './with-toast';

const saved = withToast(saveMappingAction);

type Row = { id: number; pattern: string; level: string };

export function MappingCard({ enabled, mappings }: { enabled: boolean; mappings: { pattern: string; level: string }[] }) {
  const t = useTranslations('odoo');
  const tLevel = useTranslations('level');
  const enabledId = useId();
  const nextId = useRef(mappings.length);
  const [rows, setRows] = useState<Row[]>(mappings.map((m, i) => ({ id: i, ...m })));
  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const c = [...rs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const payload = JSON.stringify(rows.map(({ pattern, level }) => ({ pattern, level })));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('mappingTitle')}</CardTitle>
        <CardDescription>{t('mappingDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={saved} className="space-y-4" testId="odoo-mapping-form">
          <div className="flex items-center gap-2">
            <Checkbox id={enabledId} name="titleMappingEnabled" defaultChecked={enabled} />
            <Label htmlFor={enabledId}>{t('mappingEnabled')}</Label>
          </div>
          <input type="hidden" name="titleMappings" value={payload} />
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('mappingRows')}</p>
            <>
              <ul className="space-y-2">
                {rows.map((r, i) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2" data-testid="mapping-row">
                    <Input
                      className="min-w-0 flex-1 basis-40"
                      aria-label={t('mappingPattern')}
                      placeholder={t('mappingPattern')}
                      value={r.pattern}
                      onChange={(e) => patch(r.id, { pattern: e.target.value })}
                    />
                    <div className="w-36">
                      <Select value={r.level} onValueChange={(v) => patch(r.id, { level: v })}>
                        <SelectTrigger aria-label={t('mappingLevel')}>
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
                    </div>
                    <Button type="button" variant="outline" size="icon" aria-label={t('mappingUp')} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button type="button" variant="outline" size="icon" aria-label={t('mappingDown')} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button type="button" variant="outline" size="icon" aria-label={t('mappingRemove')} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setRows((rs) => [...rs, { id: nextId.current++, pattern: '', level: 'member' }])}>
                <Plus className="h-4 w-4" aria-hidden />
                {t('mappingAdd')}
              </Button>
            </>
            <MappingError />
          </div>
          <Button type="submit">{t('saveMapping')}</Button>
        </ActionForm>
      </CardContent>
    </Card>
  );
}

function MappingError() {
  const message = useFormErrors().titleMappings;
  return message ? (
    <p role="alert" className="text-xs text-danger-foreground">
      {message}
    </p>
  ) : null;
}
