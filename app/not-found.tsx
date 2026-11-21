import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="space-y-3">
      <h1 className="text-xl font-semibold">Không tìm thấy trang này hoặc bạn không có quyền xem.</h1>
      <Link href="/" className="text-sm underline">← Về trang chủ</Link>
    </main>
  );
}
