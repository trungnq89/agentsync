import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Layers } from 'lucide-react';
import { ActionForm } from '@/components/ui/action-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { getOptionalActor } from '../../_lib/actor';
import { loginAction } from '../../_actions/auth';

export async function generateMetadata() {
  const t = await getTranslations('auth');
  return { title: `${t('title')} · AgentSync` };
}

export default async function LoginPage() {
  if (await getOptionalActor()) redirect('/');
  const t = await getTranslations('auth');
  return (
    <main className="mx-auto w-full max-w-sm py-10 sm:py-16">
      <Card>
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <span
              role="img"
              aria-label={t('logo')}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"
            >
              <Layers className="h-6 w-6" aria-hidden />
            </span>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">AgentSync</h1>
              <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>
          <ActionForm action={loginAction} className="space-y-4">
            <FormField name="username" label={t('username')}>
              <Input autoComplete="username" required />
            </FormField>
            <FormField name="password" label={t('password')}>
              <Input type="password" autoComplete="current-password" required />
            </FormField>
            <Button type="submit" className="w-full">
              {t('submit')}
            </Button>
          </ActionForm>
        </CardContent>
      </Card>
    </main>
  );
}
