import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return { title: `${t('notFoundTitle')} · AgentSync` };
}

export default async function NotFound() {
  const t = await getTranslations('common');
  return (
    <main>
      <EmptyState
        icon={<SearchX className="h-8 w-8" aria-hidden />}
        title={t('notFoundTitle')}
        action={<Button asChild variant="outline"><Link href="/">{t('backHome')}</Link></Button>}
      />
    </main>
  );
}
