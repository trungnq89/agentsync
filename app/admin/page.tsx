import { getTranslations } from 'next-intl/server';
import { getDb } from '@/db';
import { ActionForm } from '@/components/ui/action-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listAllUsers } from '@/server/org';
import { getStaleBusinessDays } from '@/server/settings';
import { getAdminActor } from '../_lib/actor';
import { createUserAction, staleDaysAction } from '../_actions/admin';
import { AdminTabs } from './_components/admin-tabs';
import { CheckField, LevelField, ManagerField, type Person } from './_components/fields';
import { UserActions, type AdminUser } from './_components/user-actions';

export async function generateMetadata() {
  const t = await getTranslations('admin');
  return { title: `${t('title')} · AgentSync` };
}
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const actor = await getAdminActor();
  const [t, tLevel] = await Promise.all([getTranslations('admin'), getTranslations('level')]);
  const db = getDb();
  const [users, staleDays] = await Promise.all([listAllUsers(db, actor), getStaleBusinessDays(db)]);
  const people: Person[] = users.map((u) => ({ id: u.id, displayName: u.displayName, disabled: !!u.disabledAt }));
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.displayName ?? '—';
  const rows = users.map((u) => ({
    user: {
      id: u.id,
      username: u.username,
      email: u.email,
      displayName: u.displayName,
      level: u.level,
      managerId: u.managerId,
      isAdmin: u.isAdmin,
      disabled: !!u.disabledAt,
    } satisfies AdminUser,
    manager: u.managerId ? nameOf(u.managerId) : '—',
  }));
  const status = (u: AdminUser) => (
    <span className="flex flex-wrap gap-1">
      <Badge tone={u.disabled ? 'neutral' : 'success'}>{u.disabled ? t('disabled') : t('active')}</Badge>
      {u.isAdmin && <Badge tone="info">{t('adminBadge')}</Badge>}
    </span>
  );
  return (
    <main className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
      <AdminTabs active="users" />

      <Card>
        <CardHeader>
          <CardTitle>{t('staleTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={staleDaysAction} className="flex flex-wrap items-end gap-2" testId="stale-form">
            <FormField name="days" label={t('staleDays')} hint={t('staleHint')} className="w-full max-w-xs">
              <Input type="number" min={1} max={30} defaultValue={staleDays} required />
            </FormField>
            <Button type="submit">{t('save')}</Button>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('createTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createUserAction} className="grid gap-4 sm:grid-cols-2" testId="create-user">
            <FormField name="username" label={t('username')}>
              <Input autoComplete="off" required />
            </FormField>
            <FormField name="displayName" label={t('displayName')}>
              <Input required />
            </FormField>
            <FormField name="email" label={t('email')}>
              <Input type="email" autoComplete="off" />
            </FormField>
            <FormField name="password" label={t('password')}>
              <Input type="password" autoComplete="new-password" required />
            </FormField>
            <LevelField defaultValue="member" />
            <ManagerField people={people} value={null} />
            <CheckField name="isAdmin" label={t('isAdmin')} />
            <div className="sm:col-span-2">
              <Button type="submit">{t('create')}</Button>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="font-medium">{t('usersTitle', { count: users.length })}</h2>
        <Card className="hidden md:block">
          <Table data-testid="user-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('colUser')}</TableHead>
                <TableHead>{t('colLevel')}</TableHead>
                <TableHead>{t('colManager')}</TableHead>
                <TableHead>{t('colStatus')}</TableHead>
                <TableHead>{t('colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ user: u, manager }) => (
                <TableRow key={u.id} data-testid={`user-${u.username}`}>
                  <TableCell className="max-w-[16rem]">
                    <div className="break-words font-medium">{u.displayName}</div>
                    <div className="break-all text-xs text-muted-foreground">{u.username}</div>
                  </TableCell>
                  <TableCell>{tLevel(u.level)}</TableCell>
                  <TableCell className="max-w-[12rem] break-words">{manager}</TableCell>
                  <TableCell>{status(u)}</TableCell>
                  <TableCell>
                    <UserActions user={u} people={people} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <ul className="space-y-3 md:hidden" data-testid="user-list">
          {rows.map(({ user: u, manager }) => (
            <li key={u.id}>
              <Card className="space-y-3 p-4" data-testid={`user-card-${u.username}`}>
                <div className="min-w-0">
                  <div className="break-words font-medium">{u.displayName}</div>
                  <div className="break-all text-xs text-muted-foreground">{u.username}</div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span>{tLevel(u.level)}</span>
                  <span className="break-words text-muted-foreground">
                    {t('managerLabel', { name: manager })}
                  </span>
                  {status(u)}
                </div>
                <UserActions user={u} people={people} />
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
