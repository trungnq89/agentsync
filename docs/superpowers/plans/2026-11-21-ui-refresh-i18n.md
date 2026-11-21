# UI Refresh, i18n, Dark Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm mới toàn bộ giao diện AgentSync theo hướng A (gọn, sắc nét, indigo), thêm đa ngôn ngữ vi/en trọn vẹn (web, lỗi server, MCP, skill, tài liệu) và dark mode có nút chuyển.

**Architecture:**
- **Design tokens:** biến CSS trong `app/globals.css`, gồm `:root` cho chế độ sáng và `.dark` cho chế độ tối, map vào Tailwind v4.
- **Component:** kiểu shadcn đặt trong `components/ui/*`, dựa trên Radix. Mọi trang chỉ dùng các component này cùng token.
- **i18n:** dùng next-intl, không có tiền tố ngôn ngữ trên URL. Ngôn ngữ chọn theo thứ tự: user → cookie → Accept-Language → `DEFAULT_LOCALE`.
- **Server không giữ chuỗi hiển thị.** `src/server` chỉ ném `DomainError(code, key, params)`. Web và MCP tự dịch bằng `createTranslator` của next-intl.

**Tech Stack:**
- Đang có: Next 16, React 19, Tailwind v4, Drizzle, Vitest, Playwright.
- Thêm: `next-intl`, các gói `@radix-ui/*` mà component cần, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `@fontsource-variable/inter`.

**Spec:** `docs/superpowers/specs/2026-11-21-ui-refresh-i18n-design.md` (đọc trước mọi task). Nền tảng: spec giai đoạn 1 `docs/superpowers/specs/2026-11-21-agentsync-design.md`.

## Global Constraints

- **Next 16:** đọc hướng dẫn liên quan trong `node_modules/next/dist/docs/` trước khi viết code (theo AGENTS.md). Phải kiểm tra next-intl và Radix chạy được với Next 16 và React 19.
- **Ngôn ngữ:** chỉ `en` và `vi`. Tiếng Anh là ngôn ngữ gốc của file dịch. File dịch nằm ở `messages/en.json` và `messages/vi.json`.
- **Namespace:** `common`, `nav`, `auth`, `home`, `person`, `task`, `settings`, `admin`, `status`, `health`, `level`, `mode`, `attention`, `verdict`, `sendMode`, `action`, `errors`, `mcp`, `theme`.
- **Thứ tự chọn ngôn ngữ trên web:** `users.locale` → cookie `locale` → `Accept-Language` → `DEFAULT_LOCALE`.
- **Thứ tự chọn ngôn ngữ trên MCP:** `users.locale` → `DEFAULT_LOCALE`.
- **`DEFAULT_LOCALE`:** mặc định `en`. Giá trị không hợp lệ thì dùng `en` và ghi `console.warn` một lần.
- **Theme:** `system | light | dark`, lưu ở `users.theme` (mặc định `system`) và cookie `theme`. Sau khi đăng nhập, giá trị trong DB thắng và cookie được ghi đè theo DB. Ngôn ngữ áp dụng cùng quy tắc.
- **Mô tả tool MCP và tham số:** tiếng Anh cố định trong `src/mcp/tools.ts`, không đưa vào file dịch. Nội dung tool trả về thì dịch theo ngôn ngữ của chủ token.
- **Không có chuỗi tiếng Việt hay tiếng Anh hiển thị cho người dùng** trong `app/`, `components/`, `src/server/`. Ngoại lệ: mô tả tool MCP, log, và dữ liệu test.
- **Màu:** component chỉ dùng token (`bg-primary`, `text-muted-foreground`, `border-border`…). Không dùng màu palette của Tailwind như `red-600` hay `neutral-*`, không dùng mã hex trong `className`.
- **Giá trị token:** viết dạng hex trong `globals.css` để test tương phản đọc được.
- **Tương phản WCAG AA (≥ 4.5:1)** cho các cặp: foreground/background, muted-foreground/background, primary-foreground/primary, và `{success,warning,danger,info}-foreground` trên nền nhạt tương ứng. Phải đạt ở cả chế độ sáng và tối.
- **Màu nhấn:** indigo-600 `#4f46e5` ở chế độ sáng, indigo-400 `#818cf8` ở chế độ tối.
- **Font:** Inter qua `@fontsource-variable/inter`, đóng gói vào build. Không gọi mạng lúc build hay lúc chạy.
- **Giữ nguyên toàn bộ ràng buộc giai đoạn 1:** phân quyền quản lý trực tiếp, việc riêng tư, self-host, container chạy bằng user không phải root.
- **Test:** mọi test hiện có phải pass. Playwright webServer chạy với `DEFAULT_LOCALE=vi`, nên các selector tiếng Việt hiện có vẫn dùng được. Test tiếng Anh thì chủ động chuyển sang `en`.
- **Commit:** trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Làm trên nhánh `feat/ui-refresh`.

## Review Focus

1. **Còn chuỗi chưa dịch hoặc sót khóa.** Người dùng tiếng Anh không bao giờ được thấy tiếng Việt, và ngược lại. Test ở Task 2 (hai file dịch cùng tập khóa) và Task 9 (quét toàn repo tìm chuỗi tiếng Việt cứng).
2. **Theme `system` trên máy để tối:** trang không được nháy sáng lúc tải. HTML ban đầu phải có script đặt class trước khi hiển thị. Test ở Task 5, dùng Playwright `colorScheme: 'dark'`.
3. **Cookie hoặc `DEFAULT_LOCALE` mang giá trị lạ** (`fr`, rỗng, `EN-us`): không crash, chuẩn hóa hoặc quay về `en`. Test ở Task 2.
4. **Chuỗi dài làm vỡ bố cục ở 375px.** Tiếng Anh dài hơn tiếng Việt ở một số nút, tên người có thể dài. Không được cuộn ngang ở cả hai ngôn ngữ. Test ở Task 6–8.
5. **Agent của người chưa chọn ngôn ngữ** nhận nội dung theo `DEFAULT_LOCALE`, không mặc định tiếng Anh. Test ở Task 3.

---

## Cấu trúc file

```
messages/en.json, messages/vi.json        file dịch (nguồn chân lý cho chuỗi)
src/i18n/config.ts                         LOCALES, Locale, defaultLocale(), isLocale()
src/i18n/resolve.ts                        resolveLocale(), parseAcceptLanguage() (thuần)
src/i18n/request.ts                        next-intl getRequestConfig (đọc user/cookie/header)
src/i18n/translator.ts                     serverTranslator(locale) cho code ngoài React (MCP, lỗi)
src/server/errors.ts                       DomainError(code, key, params?)
src/server/preferences.ts                  setMyLocale, setMyTheme
src/ui/theme.ts                            THEMES, Theme, isTheme(), themeInitScript
src/ui/tone.ts                             toneForStatus/Health/AttentionKind → Tone
components/ui/*                            component kiểu shadcn
components/shell/*                         Header, LanguageSwitcher, ThemeSwitcher, UserMenu, MobileNav
lib/utils.ts                               cn()
app/_lib/format.ts                         formatRelative, formatDate theo locale (thay relative-time.ts)
```
`src/server/labels.ts` bị xóa ở Task 3.

---

### Task 1: Nền móng thiết kế (token, font, phụ thuộc, tiện ích)

**Files:**
- Modify: `package.json`, `app/globals.css`, `app/layout.tsx` (chỉ import font và đổi class body sang token)
- Create: `lib/utils.ts`, `components.json` (cấu hình shadcn: alias `@/components`, `@/lib`), `src/ui/tone.ts`
- Test: `tests/server/tokens.test.ts`, `tests/server/tone.test.ts`

**Interfaces:**
- Produces:
  - `cn(...inputs: ClassValue[]): string`
  - `type Tone = 'neutral'|'primary'|'success'|'warning'|'danger'|'info'`
  - `toneForStatus(s: TaskStatus): Tone`, với ánh xạ:
    - pending_confirmation, awaiting_review → info
    - changes_requested → warning
    - in_progress → primary
    - paused → neutral
    - done, closed → success
    - cancelled → neutral
  - `toneForHealth(h)`: on_track → success, at_risk → warning, blocked → danger
  - `toneForAttention(kind)`: blocked → danger; overdue, stale, changes_requested → warning; pending_confirmation, awaiting_review, question_for_me → info; paused_or_cancelled → neutral
  - Biến CSS (cả `:root` lẫn `.dark`): `--background --foreground --surface --surface-muted --muted-foreground --border --input --ring --primary --primary-foreground` và `--{success,warning,danger,info}` cùng `--{...}-soft` (nền nhạt) và `--{...}-foreground` (chữ trên nền nhạt). Tất cả map vào `@theme inline` thành `--color-*`.
  - Tailwind v4 dùng `@custom-variant dark (&:where(.dark, .dark *));`. Xóa khối `@media (prefers-color-scheme)`.

- [ ] **Step 1:** Tạo nhánh `git checkout -b feat/ui-refresh`. Cài phụ thuộc theo Tech Stack bằng `pnpm add`.
- [ ] **Step 2: Viết test thất bại**

```ts
// tests/server/tokens.test.ts — đọc app/globals.css, tách khối :root và .dark, lấy hex theo tên biến
it.each(['light','dark'])('%s: AA contrast for required pairs', (mode) => {
  const v = tokens(mode);
  for (const [fg, bg] of [['foreground','background'],['muted-foreground','background'],['foreground','surface'],
    ['primary-foreground','primary'],['success-foreground','success-soft'],['warning-foreground','warning-soft'],
    ['danger-foreground','danger-soft'],['info-foreground','info-soft']])
    expect(contrast(v[fg], v[bg])).toBeGreaterThanOrEqual(4.5);
});
it('primary is indigo per spec', () => {
  expect(tokens('light').primary.toLowerCase()).toBe('#4f46e5');
  expect(tokens('dark').primary.toLowerCase()).toBe('#818cf8');
});
// tests/server/tone.test.ts — kiểm tra từng dòng ánh xạ ở trên bằng it.each
```

`contrast` dùng công thức relative luminance của WCAG 2.x, viết trong file test.

- [ ] **Step 3:** Chạy `pnpm vitest run tests/server/tokens.test.ts tests/server/tone.test.ts`. Kỳ vọng: FAIL.
- [ ] **Step 4:** Viết token trong `globals.css` theo tinh thần mockup A: nền trung tính slate, viền mảnh. Thêm `cn`, `tone.ts`, và import `@fontsource-variable/inter` trong layout. `--font-sans` bắt đầu bằng `'Inter Variable'`, theo sau là font hệ thống.
- [ ] **Step 5:** Chạy lại cùng lệnh để thấy PASS. Sau đó chạy `pnpm typecheck` và toàn bộ `pnpm vitest run`.
- [ ] **Step 6:** Commit `feat(ui): design tokens, font, tone mapping`.

---

### Task 2: Hạ tầng i18n và lưu lựa chọn ngôn ngữ / giao diện

**Files:**
- Create: `src/i18n/config.ts`, `src/i18n/resolve.ts`, `src/i18n/request.ts`, `src/i18n/translator.ts`, `src/ui/theme.ts`, `src/server/preferences.ts`, `messages/en.json`, `messages/vi.json`
- Modify: `src/db/schema.ts` (thêm `users.locale` text nullable có CHECK nằm trong ('en','vi'); `users.theme` text not null default 'system' có CHECK nằm trong system/light/dark; sinh migration), `next.config.ts` (bọc bằng plugin next-intl trỏ tới `src/i18n/request.ts`), `.env.example`, `docker-compose.prod.yml` (runtime env `DEFAULT_LOCALE: ${DEFAULT_LOCALE:-en}`), `playwright.config.ts` (webServer env `DEFAULT_LOCALE=vi`)
- Test: `tests/server/i18n.test.ts`, `tests/server/preferences.test.ts`

**Interfaces:**
- Produces:
  - `LOCALES = ['en','vi'] as const`, `type Locale`
  - `isLocale(x: unknown): x is Locale`
  - `defaultLocale(): Locale`: đọc `process.env.DEFAULT_LOCALE`, giá trị không hợp lệ thì trả `en` và cảnh báo một lần
  - `parseAcceptLanguage(h: string | null): Locale | null`: chọn ngôn ngữ đầu tiên hỗ trợ theo trọng số q, `vi-VN` → `vi`
  - `resolveLocale(i: { user?: string | null; cookie?: string | null; acceptLanguage?: string | null }): Locale`
  - `serverTranslator(locale: Locale, namespace?: string)`: bọc `createTranslator` của next-intl với messages đã import
  - `THEMES = ['system','light','dark'] as const`, `type Theme`, `isTheme()`
  - `themeInitScript: string`: script inline. Đọc cookie `theme`. Nếu là `dark`, hoặc là `system` (hay không có) mà `matchMedia('(prefers-color-scheme: dark)')` khớp, thì thêm class `dark` vào `documentElement`.
  - `setMyLocale(db, actor, locale: string): Promise<void>` và `setMyTheme(db, actor, theme: string): Promise<void>`: giá trị không hợp lệ ném VALIDATION với key `errors.invalidPreference`
  - `messages/*.json`: tạo đủ mọi namespace trong Global Constraints, kèm khóa đầu tiên cho `theme` (`system`, `light`, `dark`, `label`) và `common` (`save`, `cancel`, `confirm`, `close`, `copy`, `copied`, `loading`, `language`, `english`, `vietnamese`). Các task sau bổ sung khóa.

- [ ] **Step 1: Viết test thất bại**

```ts
it('resolveLocale order', () => {
  expect(resolveLocale({ user: 'vi', cookie: 'en', acceptLanguage: 'en' })).toBe('vi');
  expect(resolveLocale({ cookie: 'en', acceptLanguage: 'vi' })).toBe('en');
  expect(resolveLocale({ acceptLanguage: 'fr;q=1, vi-VN;q=0.8' })).toBe('vi');
  process.env.DEFAULT_LOCALE = 'vi'; expect(resolveLocale({})).toBe('vi');
  process.env.DEFAULT_LOCALE = 'fr'; expect(resolveLocale({ cookie: 'xx' })).toBe('en');
});
it('message catalogs have identical key sets', () => { expect(flatKeys(vi)).toEqual(flatKeys(en)); });
it('catalogs contain every required namespace', () => { for (const ns of NAMESPACES) expect(en).toHaveProperty(ns); });
it('serverTranslator translates', () => { expect(serverTranslator('vi','theme')('dark')).not.toBe(serverTranslator('en','theme')('dark')); });
// preferences.test.ts
it('setMyLocale/setMyTheme persist and reject invalid', async () => { /* 'vi' lưu được; 'fr' -> VALIDATION */ });
```

- [ ] **Step 2:** Chạy `pnpm vitest run tests/server/i18n.test.ts tests/server/preferences.test.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt.
  - `request.ts` đọc user qua `getOptionalActor()`, đọc cookie và header qua `next/headers`, rồi gọi `resolveLocale` và nạp `messages/${locale}.json`.
  - Sinh migration bằng `pnpm drizzle-kit generate`.
- [ ] **Step 4:** Chạy lại cùng lệnh, kỳ vọng PASS. Sau đó chạy toàn bộ vitest, `pnpm typecheck`, và `pnpm build` để chắc plugin next-intl hoạt động với Next 16.
- [ ] **Step 5:** Commit `feat(i18n): locale resolution, catalogs, user preferences`.

---

### Task 3: Server và MCP không còn chuỗi cứng (lỗi theo khóa, nhãn theo file dịch)

**Files:**
- Modify:
  - `src/server/errors.ts`
  - mọi file `src/server/**` đang ném DomainError (khoảng 65 chỗ)
  - `src/mcp/format.ts`, `src/mcp/tools.ts`, `app/api/mcp/route.ts`
  - `app/_lib/action.ts`
  - các test đang so khớp message tiếng Việt
- Delete: `src/server/labels.ts` (gỡ hết chỗ đang import; các component web tạm dùng `useTranslations` / `getTranslations`, giao diện được làm lại ở Task 6–8)
- Create: `app/_lib/format.ts` (thay `app/_lib/relative-time.ts`; đổi tên test tương ứng)
- Test: `tests/server/errors-i18n.test.ts`, cập nhật `tests/server/mcp-tools.test.ts` và `tests/server/relative-time.test.ts` (thành `format.test.ts`)

**Interfaces:**
- Produces:
  - `class DomainError { code: DomainErrorCode; key: string; params?: Record<string, string|number> }`, khởi tạo bằng `new DomainError(code, key, params?)`.
    - `key` là khóa trong namespace `errors`, viết camelCase, ví dụ `notFoundTask`.
    - `message` = `key` (để ghi log).
  - `translateError(e: DomainError, locale: Locale): string`
  - `run()` trong `app/_lib/action.ts` dịch theo ngôn ngữ của request (`getLocale()` của next-intl). Có `FormState.fieldErrors?: Record<string,string>` để Task 4 dùng. Lỗi VALIDATION có `params.field` thì đặt vào `fieldErrors[field]`.
  - MCP: `ToolCtx` thêm `locale: Locale`. Route tính `locale = isLocale(user.locale) ? user.locale : defaultLocale()`. Mọi hàm `format*` nhận `t` (từ `serverTranslator(locale)`) làm tham số đầu.
  - Mọi mô tả tool và `.describe()` viết lại bằng **tiếng Anh**.
  - Tool trả lỗi `isError` bằng `translateError`. Gợi ý `list_my_tasks` khi NOT_FOUND trở thành khóa `errors.notFoundHint`.
  - `formatRelative(date: Date, now: Date, locale: Locale): string` dùng `Intl.RelativeTimeFormat`, giữ ngưỡng như cũ: dưới 1 phút là "now"; tính theo ngày lịch giờ VN. `formatDate(iso: string, locale: Locale): string` dùng `Intl.DateTimeFormat` ở dạng ngắn.
  - Các namespace nhãn (`status`, `health`, `level`, `mode`, `attention`, `verdict`, `sendMode`, `action`) chuyển từ `labels.ts` sang file dịch. Bản `vi` giữ đúng chữ của giai đoạn 1, bản `en` dịch tương ứng.

- [ ] **Step 1: Viết test thất bại**

```ts
it('every DomainError key used in src/server exists in both catalogs', () => {
  // quét src/server/**/*.ts tìm new DomainError('CODE', 'key' ...), mọi `errors.<key>` phải có trong en và vi
});
it('no Vietnamese diacritics remain in src/server or src/mcp (except tests)', () => {
  // regex [À-ỹ] trên nội dung file; tools.ts cũng phải sạch
});
it('translateError vi vs en', () => { /* NOT_FOUND task: vi chứa "Không tìm thấy", en chứa "not found" */ });
// mcp-tools.test.ts
it('MCP replies in user locale; null locale uses DEFAULT_LOCALE', async () => {
  // user.locale='en' -> list_my_tasks hiện trạng thái tiếng Anh ("Pending confirmation")
  // user.locale=null, DEFAULT_LOCALE='vi' -> "Chờ xác nhận"
});
```

- [ ] **Step 2:** Chạy `pnpm vitest run tests/server/errors-i18n.test.ts tests/server/mcp-tools.test.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt.
  - Chuyển từng message hiện có thành khóa. Văn bản tiếng Việt giữ nguyên trong `vi.json`, viết bản tiếng Anh tương đương trong `en.json`.
  - Cập nhật các test cũ: đổi phần so khớp message sang so khớp `key`, hoặc sang chuỗi đã dịch tiếng Việt.
- [ ] **Step 4:** Chạy toàn bộ `pnpm vitest run`, `pnpm typecheck` và `pnpm playwright test`. Kỳ vọng: tất cả PASS. Playwright chạy với `DEFAULT_LOCALE=vi`, nên chữ giữ nguyên như trước.
- [ ] **Step 5:** Commit `refactor(i18n): error keys, translated labels, localized MCP output`.

---

### Task 4: Bộ component UI và form chuẩn

**Files:**
- Create:
  - `components/ui/`: `button.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx` (Radix), `checkbox.tsx`, `label.tsx`, `form-field.tsx`, `card.tsx`, `badge.tsx`, `avatar.tsx`, `separator.tsx`, `skeleton.tsx`, `empty-state.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`, `toaster.tsx` (sonner), `progress.tsx`
  - `components/ui/action-form.tsx`, thay cho `ActionForm` trong `app/_components/ui.tsx`
  - `app/dev/ui/page.tsx`: trang trưng bày component, chỉ bật khi `NODE_ENV !== 'production'`, production gọi `notFound()`
- Test: `tests/e2e/ui-kit.spec.ts`

**Interfaces:**
- Produces:
  - `Button` với `variant: 'primary'|'secondary'|'outline'|'ghost'|'destructive'`, `size: 'sm'|'md'|'icon'` và `loading?: boolean`. Khi loading: `disabled`, có spinner, `aria-busy`.
  - `Badge` với `tone: Tone` (từ Task 1).
  - `FormField({ name, label, hint?, error?, children })` tự nối `id`, `aria-invalid` và `aria-describedby` vào phần tử con.
  - `ActionForm({ action, children, className?, testId?, successToast?: string, render? })`:
    - lỗi chung hiện ở đầu form, `role="alert"`;
    - `fieldErrors` được truyền xuống FormField qua context;
    - nút submit trong form tự hiện loading qua `useFormStatus`;
    - khi `state.ok` thì gọi `toast.success(successToast ?? state.ok)`.
  - `ConfirmAction({ title, description, confirmLabel, tone: 'destructive'|'primary', action, fields? })`: AlertDialog bọc một form server action, dùng cho thao tác nguy hiểm và cho các thao tác cần ghi chú.
  - Mọi chữ trong component lấy từ `useTranslations('common')`. Component không chứa chuỗi cứng.

- [ ] **Step 1: Viết e2e thất bại** trên `/dev/ui`. Assertion:
  - Button `loading` có `aria-busy="true"` và bị disabled.
  - FormField khi có error: input có `aria-invalid="true"`, `aria-describedby` trỏ tới phần tử chứa lỗi.
  - AlertDialog mở được, Esc đóng, focus quay về nút mở.
  - Toast hiện sau khi submit form mẫu.
  - Ở 375px không cuộn ngang.
  - Với `colorScheme: 'dark'` và cookie `theme=system`, `<html>` có class `dark`.
- [ ] **Step 2:** Chạy `pnpm playwright test tests/e2e/ui-kit.spec.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt theo mẫu shadcn, dùng token của Task 1. Chưa sửa các trang thật.
- [ ] **Step 4:** Chạy lại cùng lệnh, kỳ vọng PASS. Sau đó chạy `pnpm typecheck`, `pnpm lint`, và `pnpm build`, trong đó `/dev/ui` ở production phải trả 404.
- [ ] **Step 5:** Commit `feat(ui): component kit and standard form`.

---

### Task 5: Khung ứng dụng (header, chuyển ngôn ngữ, chuyển giao diện, chống nháy)

**Files:**
- Modify: `app/layout.tsx`, `app/_actions/auth.ts` (sau khi đăng nhập thì ghi cookie `locale` và `theme` theo DB)
- Create:
  - `components/shell/header.tsx`, `language-switcher.tsx`, `theme-switcher.tsx`, `user-menu.tsx`, `mobile-nav.tsx`
  - `app/_actions/preferences.ts` (`setLocaleAction`, `setThemeAction`)
- Test: `tests/e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `setMyLocale`, `setMyTheme`, `themeInitScript`, `resolveLocale` (Task 2); Button, DropdownMenu, Toaster (Task 4).
- Produces:
  - `setLocaleAction(locale)` và `setThemeAction(theme)`: người chưa đăng nhập chỉ ghi cookie, người đã đăng nhập ghi cả DB lẫn cookie, rồi `revalidatePath('/', 'layout')`. Cookie có `path=/`, `sameSite=lax`, sống 1 năm, cờ `secure` theo `cookieSecure()` sẵn có.
  - Layout:
    - `<html lang={locale}>`; thêm class `dark` khi theme của user hoặc cookie là `dark`;
    - `<head>` chèn `<script dangerouslySetInnerHTML={{__html: themeInitScript}} />`;
    - bọc `NextIntlClientProvider`, có `<Toaster />`.
  - Header:
    - logo, nav (Trang chủ, Cài đặt, Quản trị chỉ admin thấy), LanguageSwitcher, ThemeSwitcher, UserMenu (tên, Đăng xuất);
    - dưới 640px, nav thu vào MobileNav (Sheet hoặc DropdownMenu);
    - trang login vẫn có LanguageSwitcher và ThemeSwitcher dù chưa đăng nhập.
  - `data-testid`: `lang-switch`, `theme-switch`, `user-menu`, `mobile-nav-toggle`.

- [ ] **Step 1: Viết e2e thất bại**
  - Đổi sang English thì nav hiện "Home" và giữ nguyên sau reload. Đăng xuất rồi đăng nhập trên context mới vẫn là English (lấy từ DB).
  - Chọn Dark thì `<html>` có class `dark` và giữ sau reload.
  - Với `colorScheme: 'dark'` và theme `system`: HTML trả về ban đầu (`(await page.request.get('/login')).text()`) có chứa script init, và `html.dark` có ngay khi `domcontentloaded`.
  - Ở 375px với cả `vi` và `en`: header không cuộn ngang, menu mobile mở được.
  - Trang login đổi ngôn ngữ được khi chưa đăng nhập.
- [ ] **Step 2:** Chạy `pnpm playwright test tests/e2e/shell.spec.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt.
- [ ] **Step 4:** Chạy lại cùng lệnh, kỳ vọng PASS, rồi chạy toàn bộ `pnpm playwright test` để các spec cũ vẫn pass. Nếu selector cũ hỏng vì nav đổi cấu trúc thì chuyển sang `data-testid`.
- [ ] **Step 5:** Commit `feat(ui): app shell with language and theme switching`.

---

### Task 6: Trang đăng nhập, trang chủ, trang một người

**Files:**
- Modify: `app/(auth)/login/page.tsx`, `app/page.tsx`, `app/people/[id]/page.tsx`, `app/_components/AttentionList.tsx`, `TierSection.tsx`, `PersonCard.tsx`, `Timeline.tsx`
- Test: cập nhật `tests/e2e/home.spec.ts`

**Interfaces:**
- Consumes: Card, Badge (tone), Avatar, EmptyState, `toneForHealth`/`toneForAttention` (Task 1); `formatRelative`/`formatDate` (Task 3).
- Yêu cầu theo spec §8:
  - **Login:** thẻ căn giữa có logo.
  - **Mục chú ý:** danh sách có icon lucide theo loại và Badge màu theo tone.
  - **PersonCard:** badge "kẹt" và "chờ review" nằm trong khung flex, không định vị tuyệt đối.
  - **Timeline:** màu thanh lấy theo tone (token), giữ nhãn chữ trạng thái. Trên mobile, vạch "hôm nay" chỉ đi qua vùng thanh, không cắt qua chữ. Đây là minor đã hoãn từ giai đoạn 1.
  - **Trạng thái rỗng:** dùng EmptyState.

- [ ] **Step 1: Viết e2e thất bại**, thêm vào `home.spec.ts`:
  - Ở English, trang chủ hiện "Needs your attention" và nhãn tầng "Manager"; badge `blocked` có class token `danger`.
  - Ở 375px với cả `vi` lẫn `en`, có một người tên dài 40 ký tự, không cuộn ngang.
  - Timeline ở English hiện nhãn trạng thái tiếng Anh.
- [ ] **Step 2:** Chạy `pnpm playwright test tests/e2e/home.spec.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt.
- [ ] **Step 4:** Chạy lại cùng lệnh, kỳ vọng PASS. Sau đó chạy toàn bộ playwright và `pnpm lint`.
- [ ] **Step 5:** Commit `feat(ui): login, home, person pages`.

---

### Task 7: Trang chi tiết việc

**Files:**
- Modify: `app/tasks/[id]/page.tsx`, `TaskHeader.tsx`, `QuestionBox.tsx`, `SolutionCard.tsx`, `PlanSummary.tsx`, `ActivityFeed.tsx`, `app/_actions/task.ts`
- Test: cập nhật `tests/e2e/task-detail.spec.ts`

**Interfaces:**
- Consumes: Card, Badge, Progress, Button, `ConfirmAction`, ActionForm (Task 4).
- Yêu cầu theo spec §8:
  - **Header:** Card có Badge trạng thái, Progress và các nút.
  - **Xác nhận:** nút primary, có toast.
  - **"Yêu cầu sửa" và "Cần sửa":** mở `ConfirmAction` có Textarea ghi chú bắt buộc. Bỏ `<details>`.
  - **Các khối còn lại:** mỗi khối một Card.
  - **"Xem thêm":** đổi thành "Thu gọn" khi đã mở. Chuyển thành client component nhỏ.
  - **Ghi chú rỗng:** lỗi hiện dưới Textarea qua `fieldErrors`. Dùng `params.field: 'note'` trong lỗi VALIDATION tương ứng ở `src/server`.

- [ ] **Step 1: Viết e2e thất bại**
  - "Request changes" bằng English: mở dialog, gửi ghi chú rỗng thì thấy lỗi tiếng Anh dưới ô, nhập ghi chú rồi gửi thì trạng thái chuyển sang "Changes requested" và có toast.
  - Bấm "Xem thêm" thì nút đổi thành "Thu gọn".
  - Không cuộn ngang ở 375px.
  - Các e2e hiện có vẫn pass. Selector chuyển sang `data-testid` nếu cần.
- [ ] **Step 2:** Chạy `pnpm playwright test tests/e2e/task-detail.spec.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt.
- [ ] **Step 4:** Chạy lại cùng lệnh, kỳ vọng PASS. Sau đó chạy toàn bộ playwright và vitest.
- [ ] **Step 5:** Commit `feat(ui): task detail page`.

---

### Task 8: Cài đặt, Quản trị, 404, trang lỗi

**Files:**
- Modify: `app/settings/page.tsx`, `app/_components/token-form.tsx`, `app/admin/page.tsx`, `app/_actions/admin.ts`, `app/_actions/settings.ts`, `app/not-found.tsx`, `app/error.tsx`
- Delete: `app/_components/ui.tsx` (mọi nơi đã chuyển sang `components/ui`)
- Test: cập nhật `tests/e2e/auth-admin.spec.ts`

**Interfaces:**
- Consumes: mọi component ở Task 4; `setLocaleAction`/`setThemeAction` (Task 5).
- Yêu cầu theo spec §8:
  - **Cài đặt:** các Card ngôn ngữ (Select), giao diện (Select), chế độ gửi, đổi mật khẩu, token.
    - Token mới hiện một lần, có nút copy với `data-testid="copy-token"` và toast.
    - Thu hồi token qua `ConfirmAction` tone destructive.
  - **Quản trị:**
    - Desktop (từ `md` trở lên) dùng Table, mobile dùng thẻ.
    - Sửa người dùng trong Dialog. Vô hiệu hóa qua `ConfirmAction` destructive.
    - Ô ngưỡng "lâu không cập nhật" dùng FormField.
    - Lỗi theo từng trường (mật khẩu ngắn, tên trống, tên đăng nhập trùng) hiện dưới đúng ô nhờ `params.field` trong các lỗi VALIDATION liên quan ở `src/server/org.ts` và `account.ts`.
  - **404 và lỗi:** EmptyState, đã dịch.

- [ ] **Step 1: Viết e2e thất bại**
  - Tạo user với mật khẩu ngắn thì lỗi hiện dưới ô mật khẩu (`aria-invalid="true"`) và có chữ tiếng Việt.
  - Đổi ngôn ngữ trong Cài đặt sang English thì trang hiện "Settings".
  - Thu hồi token phải qua dialog xác nhận.
  - Không cuộn ngang ở 375px trên trang admin.
  - Các e2e hiện có vẫn pass.
- [ ] **Step 2:** Chạy `pnpm playwright test tests/e2e/auth-admin.spec.ts`. Kỳ vọng: FAIL.
- [ ] **Step 3:** Cài đặt.
- [ ] **Step 4:** Chạy lại cùng lệnh, kỳ vọng PASS. Sau đó chạy toàn bộ playwright, vitest, typecheck và lint.
- [ ] **Step 5:** Commit `feat(ui): settings, admin, error pages`.

---

### Task 9: Skill, tài liệu song ngữ, kiểm tra chuỗi cứng toàn repo

**Files:**
- Modify: `plugins/agentsync/skills/*/SKILL.md` (viết lại bằng tiếng Anh, thêm quy tắc "Always reply to the member in the language they use"), `plugins/agentsync/codex/README.md` (tiếng Anh), `README.md` (tiếng Anh), `docs/install-agent.md` (tiếng Anh), `.env.example`
- Create: `README.vi.md`, `docs/install-agent.vi.md`
- Test: `tests/server/no-hardcoded-strings.test.ts`, chạy lại `tests/server/plugin-files.test.ts`

**Interfaces:**
- Yêu cầu:
  - **README:** tiếng Anh, có mục "Language & theme" mô tả `DEFAULT_LOCALE` và các lựa chọn theme.
  - **Liên kết qua lại:** dòng đầu của README là "Tiếng Việt: README.vi.md", và ngược lại.
  - **Tên tool và field trong skill giữ nguyên.** Quy tắc review-gate và các quy tắc an toàn giữ nguyên nghĩa.

- [ ] **Step 1: Viết test thất bại**

```ts
it('no user-visible hardcoded strings in app/, components/, src/server, src/mcp', () => {
  // quét .ts/.tsx, bỏ qua tests/, messages/, file chỉ có comment
  // lỗi nếu có ký tự tiếng Việt [À-ỹ] ở bất kỳ đâu
  // lỗi nếu JSX text node (>Chữ<) chứa chữ cái mà không đi qua t(...)
  //   (heuristic regex />\s*[A-Za-zÀ-ỹ][^<{]*</ trong .tsx, kèm allowlist ngắn có lý do: "AgentSync")
});
it('SKILL.md bodies are English', () => { /* không có ký tự [À-ỹ] trong plugins/agentsync/skills */ });
it('README cross-links', () => { /* README.md dòng 1 nhắc README.vi.md, và ngược lại */ });
```

- [ ] **Step 2:** Chạy `pnpm vitest run tests/server/no-hardcoded-strings.test.ts`. Kỳ vọng: FAIL, liệt kê các file vi phạm.
- [ ] **Step 3:** Sửa mọi vi phạm còn lại (chuyển vào file dịch) và viết tài liệu.
- [ ] **Step 4:** Chạy toàn bộ vitest, playwright, typecheck và lint, kỳ vọng tất cả PASS. Sau đó build Docker và chạy smoke:

```bash
docker compose -p agentsync-uicheck -f docker-compose.prod.yml up -d --build
```

Chạy với `POSTGRES_PASSWORD` tạm, `DEFAULT_LOCALE=vi`, `COOKIE_SECURE=false`. Seed admin, tạo token qua UI hoặc script, chạy `pnpm smoke:mcp` để thấy `SMOKE OK`, rồi `down -v`.
- [ ] **Step 5:** Commit `docs(i18n): English skills and docs, Vietnamese translations, string guard`.
