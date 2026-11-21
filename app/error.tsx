'use client';
import { button } from './_components/ui';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="space-y-3">
      <h1 className="text-xl font-semibold">Đã xảy ra lỗi. Vui lòng thử lại.</h1>
      <button type="button" onClick={reset} className={button}>Thử lại</button>
    </main>
  );
}
