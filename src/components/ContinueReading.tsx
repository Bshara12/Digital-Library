'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProgress } from '@/lib/reading-progress';

/**
 * زر بدء/متابعة القراءة
 * ---------------------------------------------------------------
 * الموضع المحفوظ يعيش في متصفّح الزائر، فلا يمكن معرفته وقت البناء.
 * لذا نعرض «ابدأ القراءة» أولاً ثم نبدّله بعد التركيب إن وُجد تقدّم —
 * وهذا يتجنّب اختلاف الناتج بين الخادم والمتصفّح.
 */
export function ContinueReading({ slug, pageCount }: { slug: string; pageCount: number }) {
  const [page, setPage] = useState<number | null>(null);

  useEffect(() => {
    const saved = getProgress(slug);
    // الصفحة الأولى ليست «تقدّماً» يستحق الذكر
    if (saved && saved.page > 1) setPage(saved.page);
  }, [slug]);

  const percent = page ? Math.round((page / pageCount) * 100) : 0;

  return (
    <Link
      href={page ? `/read/${slug}?p=${page}` : `/read/${slug}`}
      className="group relative overflow-hidden rounded-sm px-9 py-3.5 font-body text-sm text-ink-950 transition-transform duration-200 hover:scale-[1.03]"
      style={{ backgroundImage: 'var(--grad-gold-surface)' }}
    >
      {page ? `تابع من صفحة ${page}` : 'ابدأ القراءة'}
      {page && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[3px] bg-ink-950/35"
          style={{ width: `${percent}%` }}
        />
      )}
    </Link>
  );
}
