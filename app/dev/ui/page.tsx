import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Inbox } from 'lucide-react';
import { ActionForm } from '@/components/ui/action-form';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Tone } from '@/ui/tone';
import { demoAction, noopAction } from './actions';

const TONES: Tone[] = ['neutral', 'primary', 'success', 'warning', 'danger', 'info'];

export default async function UiKitPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const t = await getTranslations('dev');

  return (
    <main className="space-y-6">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="break-words text-sm text-muted-foreground">{t('longText')}</p>

      <section className="flex flex-wrap items-center gap-2">
        <Button>{t('submit')}</Button>
        <Button variant="secondary">{t('submit')}</Button>
        <Button variant="outline">{t('submit')}</Button>
        <Button variant="ghost">{t('submit')}</Button>
        <Button variant="destructive">{t('destructive')}</Button>
        <Button size="sm">{t('submit')}</Button>
        <Button loading data-testid="loading-button">{t('buttonLoading')}</Button>
      </section>

      <section className="flex flex-wrap gap-2">
        {TONES.map((tone) => (
          <Badge key={tone} tone={tone}>{tone}</Badge>
        ))}
      </section>

      <Card>
        <CardHeader><CardTitle>{t('title')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FormField name="static" label={t('nameLabel')} hint={t('nameHint')} error={t('nameError')}>
            <Input data-testid="static-input" />
          </FormField>
          <ActionForm action={demoAction} testId="demo-form" className="space-y-4">
            <FormField name="name" label={t('nameLabel')} hint={t('nameHint')}>
              <Input />
            </FormField>
            <FormField name="note" label={t('nameLabel')}>
              <Textarea />
            </FormField>
            <FormField name="choice" label={t('choose')}>
              <Select name="choice">
                <SelectTrigger><SelectValue placeholder={t('choose')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">{t('optionA')}</SelectItem>
                  <SelectItem value="b">{t('optionB')}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <div className="flex items-center gap-2">
              <FormField name="agree" label={t('agree')}>
                <Checkbox />
              </FormField>
            </div>
            <Button type="submit">{t('submit')}</Button>
          </ActionForm>
        </CardContent>
      </Card>

      <section className="flex flex-wrap items-center gap-3">
        <ConfirmAction
          trigger={<Button variant="destructive">{t('openDialog')}</Button>}
          title={t('dialogTitle')}
          description={t('dialogDescription')}
          confirmLabel={t('dialogConfirm')}
          tone="destructive"
          action={noopAction}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline">{t('menu')}</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>{t('optionA')}</DropdownMenuItem>
            <DropdownMenuItem>{t('optionB')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild><Button variant="ghost">{t('tooltip')}</Button></TooltipTrigger>
          <TooltipContent>{t('tooltip')}</TooltipContent>
        </Tooltip>
        <Avatar name={t('avatarName')} />
      </section>

      <Separator />
      <div className="space-y-2">
        <Progress value={60} aria-label={t('progress')} />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <EmptyState icon={<Inbox className="h-6 w-6" aria-hidden />} title={t('emptyTitle')} description={t('emptyHint')} />
    </main>
  );
}
