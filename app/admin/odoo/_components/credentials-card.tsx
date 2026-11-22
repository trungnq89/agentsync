'use client';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type Cred = { email: string; password: string };

const csvCell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Temporary passwords, shown once. The CSV is built here from state; nothing is sent to the server. */
export function CredentialsCard({ credentials }: { credentials: Cred[] }) {
  const t = useTranslations('odoo');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credentials.map((c) => `${c.email}\t${c.password}`).join('\n'));
      toast.success(t('copied'));
    } catch {
      // clipboard unavailable: the passwords stay selectable on screen
    }
  };
  const download = () => {
    const csv = ['email,password', ...credentials.map((c) => `${csvCell(c.email)},${csvCell(c.password)}`)].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'odoo-temporary-passwords.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Card data-testid="odoo-credentials">
      <CardHeader>
        <CardTitle>{t('credentialsTitle')}</CardTitle>
        <CardDescription>{t('credentialsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {credentials.map((c) => (
            <li key={c.email} data-testid="credential-row" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border border-border p-2 text-sm">
              <span className="min-w-0 break-all font-medium">{c.email}</span>
              <code data-testid="credential-password" className="break-all select-all">{c.password}</code>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {t('copy')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={download}>
            {t('downloadCsv')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
