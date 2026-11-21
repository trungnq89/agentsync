'use client';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('common');
  return (
    <main>
      <EmptyState
        icon={<TriangleAlert className="h-8 w-8" aria-hidden />}
        title={t('errorTitle')}
        description={t('errorDesc')}
        action={<Button type="button" onClick={reset}>{t('retry')}</Button>}
      />
    </main>
  );
}
