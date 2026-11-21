import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { Header } from '@/components/shell/header';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { isTheme, THEME_COOKIE, themeInitScript } from '@/ui/theme';
import { getOptionalActor } from './_lib/actor';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentSync',
  description: 'AgentSync',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, locale, jar] = await Promise.all([getOptionalActor().catch(() => null), getLocale(), cookies()]);
  const cookieTheme = jar.get(THEME_COOKIE)?.value;
  // DB wins when signed in; otherwise the cookie; otherwise follow the system.
  const userTheme = user && isTheme(user.theme) ? user.theme : undefined;
  const theme = userTheme ?? (isTheme(cookieTheme) ? cookieTheme : 'system');
  return (
    <html lang={locale} className={`h-full antialiased${theme === 'dark' ? ' dark' : ''}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <NextIntlClientProvider>
          <TooltipProvider>
            <Header user={user} theme={theme} />
            <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
          </TooltipProvider>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
