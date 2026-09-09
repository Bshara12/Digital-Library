import type { Metadata } from 'next';

/**
 * لوحة الإدارة
 * ---------------------------------------------------------------
 * `noindex` صريح: هذه الصفحات ليست جزءاً من الموقع العامّ، ووجودها
 * في نتائج البحث دعوة لمحاولات الدخول. لا نعتمد على خفاء الرابط
 * وحده — الحماية الفعلية في التحقّق من الجلسة على الخادم.
 */
export const metadata: Metadata = {
  title: 'الإدارة',
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-ink-950">{children}</div>;
}
