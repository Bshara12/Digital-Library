'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { readingScales } from '@/lib/design-tokens';
import { THEME_COLORS, type ReaderSettings } from '@/lib/reader-settings';
import { highlightText } from '@/lib/search';
import { Marked } from '@/components/search/Marked';
import type { BookPage } from '@/lib/books';

/**
 * وضع القراءة النصّية
 * ---------------------------------------------------------------
 * النصّ المستخرج مُعاد التدفّق في عمود مريح. هذا الوضع ممكن أصلاً
 * لأن الكتب نصّية لا صوراً ممسوحة، وهو الأهم عملياً: أغلب القرّاء
 * على الهاتف، وقراءة صفحة A4 هناك تجربة مؤلمة.
 *
 * التمرير متّصل عبر الكتاب كلّه، والصفحات علامات ضمنه — فنُبلغ الأب
 * بالصفحة التي يقرأها الزائر فعلاً ليحفظ موضعه.
 */

interface Props {
  pages: BookPage[];
  settings: ReaderSettings;
  /** الصفحة المطلوب القفز إليها عند الفتح */
  initialPage: number;
  onPageChange: (page: number) => void;
  /** عبارة البحث القادمة من صفحة البحث — تُظلَّل في المتن */
  highlight?: string;
  /** الصفحات المعلَّمة، لتظهر علامتها بين الصفحات */
  bookmarks?: number[];
}

export function TextMode({
  pages,
  settings,
  initialPage,
  onPageChange,
  highlight,
  bookmarks = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const colors = THEME_COLORS[settings.theme];
  const marked = useMemo(() => new Set(bookmarks), [bookmarks]);

  // القفز إلى صفحة البداية بعد أول رسم
  useEffect(() => {
    if (initialPage <= 1) return;
    const target = containerRef.current?.querySelector(`[data-page="${initialPage}"]`);
    target?.scrollIntoView({ block: 'start' });
  }, [initialPage]);

  /*
   * تتبّع الصفحة الظاهرة. نستعمل IntersectionObserver بشريط ضيّق قرب
   * أعلى الشاشة: الصفحة «الحالية» هي التي يقع مطلعها في ذلك الشريط،
   * وهو أدقّ من حساب مواضع كل الصفحات عند كل حدث تمرير.
   */
  useEffect(() => {
    const marks = containerRef.current?.querySelectorAll('[data-page]');
    if (!marks?.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (page) onPageChange(page);
        }
      },
      { rootMargin: '-12% 0px -84% 0px', threshold: 0 }
    );

    marks.forEach((mark) => observer.observe(mark));
    return () => observer.disconnect();
  }, [onPageChange, pages]);

  /** نصّ الكتلة، مظلَّلاً إن جاء القارئ من بحث */
  const render = useCallback(
    (text: string) =>
      highlight ? <Marked parts={highlightText(text, highlight)} tone="reader" /> : text,
    [highlight]
  );

  return (
    <div
      ref={containerRef}
      className="no-select min-h-screen px-5 pb-40 pt-28 transition-colors duration-500"
      style={{ backgroundColor: colors.bg, color: colors.fg }}
    >
      <article
        className="mx-auto"
        style={{
          maxWidth: `${readingScales.measure[settings.measure]}ch`,
          fontFamily: settings.altFont ? 'var(--font-body-alt)' : 'var(--font-body)',
          fontSize: `${readingScales.fontSize[settings.fontSize]}px`,
          lineHeight: readingScales.lineHeight[settings.lineHeight],
        }}
      >
        {pages.map((page) => (
          <section key={page.n} data-page={page.n}>
            {/* علامة الصفحة — رقم خافت بين خطّين */}
            {page.n > 1 && (
              <div
                aria-label={`صفحة ${page.n}`}
                className="my-12 flex items-center gap-4 opacity-40"
              >
                <span className="h-px flex-1" style={{ backgroundColor: colors.dim }} />
                {marked.has(page.n) && (
                  <span
                    aria-label="صفحة معلَّمة"
                    className="font-latin text-xs"
                    style={{ color: 'var(--color-gold-500)', opacity: 1 }}
                  >
                    ❖
                  </span>
                )}
                <span className="font-latin text-xs" style={{ color: colors.dim }}>
                  {page.n}
                </span>
                <span className="h-px flex-1" style={{ backgroundColor: colors.dim }} />
              </div>
            )}

            {page.blocks.map((block, i) => {
              if (block.t === 'h')
                return (
                  <h2
                    key={i}
                    className="mb-6 mt-14 font-display leading-snug"
                    style={{ fontSize: '1.5em', color: 'var(--color-gold-500)' }}
                  >
                    {render(block.x)}
                  </h2>
                );
              // عنوان فرعي: بارز في المتن، وخارج الفهرس
              if (block.t === 's')
                return (
                  <h3
                    key={i}
                    className="mb-3 mt-9 font-semibold leading-snug"
                    style={{ fontSize: '1.08em' }}
                  >
                    {render(block.x)}
                  </h3>
                );
              return (
                <p key={i} className="mb-[1.1em] text-justify">
                  {render(block.x)}
                </p>
              );
            })}
          </section>
        ))}
      </article>

      {/* علامة مائية خافتة تُثبت الملكية دون إزعاج القارئ */}
      <p
        className="mt-24 text-center font-ui text-[0.65rem] tracking-[0.2em]"
        style={{ color: colors.dim, opacity: 0.6 }}
      >
        عصام السالم — جميع الحقوق محفوظة
      </p>
    </div>
  );
}
