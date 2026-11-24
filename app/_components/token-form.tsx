'use client';
import { useRef } from 'react';
import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ActionForm } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, inputClass } from '@/components/ui/input';
import { DEFAULT_TOKEN_DAYS, TOKEN_LIFETIMES } from '@/server/auth/token-options';
import { createTokenAction } from '../_actions/settings';

const codeBox = 'overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-surface-muted p-2 text-xs';

export function TokenForm({ mcpUrl, canChooseScope }: { mcpUrl: string; canChooseScope: boolean }) {
  const t = useTranslations('settings');
  const tokenRef = useRef<HTMLElement>(null);

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      toast.success(t('tokenCopied'));
    } catch {
      // Clipboard unavailable (insecure context, denied permission): select the text so Ctrl+C works.
      const el = tokenRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      toast.error(t('copyFailed'));
    }
  }

  return (
    <ActionForm
      action={createTokenAction}
      className="space-y-3"
      testId="token-form"
      render={(s) =>
        s.token ? (
          <Card className="mt-3 space-y-3 p-4" data-testid="new-token">
            <p className="text-sm font-medium">{t('newTokenTitle')}</p>
            <div className="flex flex-wrap items-start gap-2">
              <code ref={tokenRef} data-testid="token-plaintext" className={`${codeBox} min-w-0 flex-1 text-sm`}>
                {s.token}
              </code>
              <Button type="button" variant="outline" size="sm" data-testid="copy-token" onClick={() => copy(s.token!)}>
                <Copy className="h-4 w-4" aria-hidden />
                {t('copyToken')}
              </Button>
            </div>
            <p className="text-sm">{t('claudeCode')}</p>
            <pre className={codeBox}>{`claude mcp add --transport http agentsync ${mcpUrl} --header "Authorization: Bearer ${s.token}"`}</pre>
            <p className="text-sm">{t('orJson')}</p>
            <pre className={codeBox}>{JSON.stringify(
              { mcpServers: { agentsync: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${s.token}` } } } },
              null,
              2,
            )}</pre>
          </Card>
        ) : null
      }
    >
      <div className="flex flex-wrap items-end gap-2">
        <FormField name="label" label={t('tokenLabel')} className="min-w-0 flex-1">
          <Input placeholder={t('tokenLabelPlaceholder')} required />
        </FormField>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <FormField name="days" label={t('tokenLifetime')} hint={t('lifetimeHint')} className="min-w-0 flex-1 basis-48">
          <select defaultValue={DEFAULT_TOKEN_DAYS} className={inputClass}>
            {TOKEN_LIFETIMES.map((d) => (
              <option key={d} value={d}>{t('lifetimeOption', { days: d })}</option>
            ))}
          </select>
        </FormField>
        {canChooseScope && (
          <FormField name="scope" label={t('tokenScope')} hint={t('scopeHint')} className="min-w-0 flex-1 basis-48">
            <select defaultValue="member" className={inputClass}>
              <option value="member">{t('scopeMemberOption')}</option>
              <option value="manager">{t('scopeManagerOption')}</option>
            </select>
          </FormField>
        )}
      </div>
      <Button type="submit">{t('createToken')}</Button>
    </ActionForm>
  );
}
