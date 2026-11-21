import { expect, test } from '@playwright/test';

// Playwright runs with locale vi-VN, so strings below are the Vietnamese catalog values (messages/vi.json, "dev").
test.describe('ui kit', () => {
  test('loading button is busy and disabled', async ({ page }) => {
    await page.goto('/dev/ui');
    const b = page.getByTestId('loading-button');
    await expect(b).toHaveAttribute('aria-busy', 'true');
    await expect(b).toBeDisabled();
  });

  test('FormField wires aria-invalid and aria-describedby to the error', async ({ page }) => {
    await page.goto('/dev/ui');
    const input = page.getByTestId('static-input');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    const ids = (await input.getAttribute('aria-describedby'))!.split(' ');
    const texts = await Promise.all(ids.map((id) => page.locator(`[id="${id}"]`).textContent()));
    expect(texts).toContain('Cần nhập tên');
  });

  test('alert dialog opens, Esc closes, focus returns to opener', async ({ page }) => {
    await page.goto('/dev/ui');
    const opener = page.getByRole('button', { name: 'Mở hộp thoại' });
    await opener.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('submitting the sample form shows a toast; empty shows field error', async ({ page }) => {
    await page.goto('/dev/ui');
    const form = page.getByTestId('demo-form');
    await form.getByRole('button', { name: 'Gửi' }).click();
    await expect(form.getByText('Cần nhập tên')).toBeVisible();
    await expect(form.getByLabel('Tên').first()).toHaveAttribute('aria-invalid', 'true');
    await form.getByLabel('Tên').first().fill('Ada');
    await form.getByRole('button', { name: 'Gửi' }).click();
    await expect(page.locator('[data-sonner-toast]')).toContainText('Đã lưu');
  });

  for (const locale of ['vi-VN', 'en-US']) {
    test(`no horizontal scroll at 375px (${locale})`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, locale });
      const page = await ctx.newPage();
      await page.goto('/dev/ui');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await ctx.close();
    });
  }

  test('theme=system with dark OS preference gets html.dark', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark', locale: 'vi-VN' });
    await ctx.addCookies([{ name: 'theme', value: 'system', url: 'http://localhost:3100' }]);
    const page = await ctx.newPage();
    await page.goto('/dev/ui');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await ctx.close();
  });
});
