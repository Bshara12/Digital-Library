'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { readingScales } from '@/lib/design-tokens';
import { THEME_COLORS, type ReaderSettings } from '@/lib/reader-settings';
import { highlightText } from '@/lib/search';
import { Marked } from '@/components/search/Marked';
import type { BookPage } from '@/lib/books';

/**
 * وضع الكتاب — التقليب ثلاثي الأبعاد
 * ---------------------------------------------------------------
 * الورقة تدور حول محورها الرأسي، وأثناء الدوران يتحرّك ظلّها فيوهم
 * بانعكاس الضوء على ورق حقيقي. المحور على اليمين والتقليب من اليمين
 * لليسار — كالكتاب العربي تماماً.
 *
 * السحب الجزئي: يمكن الإمساك بحافة الورقة وسحبها ثم تركها؛ إن تجاوزت
 * المنتصف أكملت وإلا ارتدّت. هذه التفصيلة تحديداً هي ما يجعل الإحساس
 * «حقيقياً» لا «متحرّكاً».
 */

interface Props {
  pages: BookPage[];
  settings: ReaderSettings;
  currentPage: number;
  onPageChange: (page: number) => void;
  /** عبارة البحث القادمة من صفحة البحث — تُظلَّل في المتن */
  highlight?: string;
  /** هل الصفحة المعروضة معلَّمة؟ يظهر شريط العلامة عند حافّتها */
  bookmarked?: boolean;
}

/** اتجاه التقليب: 1 للأمام (صفحة تالية)، -1 للخلف */
type Direction = 1 | -1;

export function BookMode({
  pages,
  settings,
  currentPage,
  onPageChange,
  highlight,
  bookmarked = false,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [direction, setDirection] = useState<Direction>(1);
  const colors = THEME_COLORS[settings.theme];

  const total = pages.length;
  const page = pages.find((p) => p.n === currentPage) ?? pages[0];

  /** نصّ الكتلة، مظلَّلاً إن جاء القارئ من بحث */
  const render = (text: string) =>
    highlight ? <Marked parts={highlightText(text, highlight)} tone="reader" /> : text;

  const turn = useCallback(
    (dir: Direction) => {
      const next = currentPage + dir;
      if (next < 1 || next > total) return;
      setDirection(dir);
      onPageChange(next);
    },
    [currentPage, total, onPageChange]
  );

  // الأسهم: في RTL السهم الأيسر يعني «للأمام»
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') turn(1);
      else if (event.key === 'ArrowRight') turn(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn]);

  return (
    <div
      className="no-select flex min-h-screen items-center justify-center px-4 py-24 transition-colors duration-500"
      style={{ backgroundColor: THEME_COLORS.night.bg }}
    >
      <div
        className="relative w-full max-w-3xl"
        style={{ perspective: '2400px' }}
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={page.n}
            custom={direction}
            className="preserve-3d origin-right"
            style={{ transformStyle: 'preserve-3d' }}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { rotateY: direction === 1 ? -105 : 105, opacity: 0.4 }
            }
            animate={reduceMotion ? { opacity: 1 } : { rotateY: 0, opacity: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { rotateY: direction === 1 ? 105 : -105, opacity: 0.2 }
            }
            transition={{ duration: reduceMotion ? 0.2 : 0.75, ease: [0.65, 0, 0.35, 1] }}
            drag={reduceMotion ? false : 'x'}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.16}
            onDragEnd={(_, info) => {
              // سحب لليسار = الصفحة التالية في الكتاب العربي
              if (info.offset.x < -80) turn(1);
              else if (info.offset.x > 80) turn(-1);
            }}
          >
            <article
              className="relative aspect-[1/1.35] overflow-hidden rounded-sm px-[9%] py-[8%] shadow-[0_50px_90px_-30px_rgba(0,0,0,0.9)] sm:aspect-[1/1.25]"
              style={{ backgroundColor: colors.bg, color: colors.fg }}
            >
              {/* شريط العلامة المرجعية — يتدلّى من أعلى الورقة */}
              {bookmarked && (
                <span
                  aria-label="صفحة معلَّمة"
                  className="absolute top-0 left-[12%] h-[8%] w-[2.2%] rounded-b-[1px]"
                  style={{ backgroundImage: 'var(--grad-gold-surface)' }}
                />
              )}

              {/* ظلّ التجليد عند الحافة اليمنى */}
              <div
                aria-hidden
                className="absolute inset-y-0 right-0 w-[7%]"
                style={{
                  backgroundImage:
                    'linear-gradient(to left, rgba(0,0,0,0.22), rgba(0,0,0,0.04) 55%, transparent)',
                }}
              />
              {/* حواف داكنة خفيفة تعطي انحناء الورقة */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  boxShadow: 'inset 0 0 90px rgba(0,0,0,0.10)',
                }}
              />

              <div
                className="relative h-full overflow-y-auto pe-2 [scrollbar-width:thin]"
                style={{
                  fontFamily: settings.altFont ? 'var(--font-body-alt)' : 'var(--font-body)',
                  fontSize: `${readingScales.fontSize[settings.fontSize]}px`,
                  lineHeight: readingScales.lineHeight[settings.lineHeight],
                }}
              >
                {page.blocks.map((block, i) => {
                  if (block.t === 'h')
                    return (
                      <h2
                        key={i}
                        className="mb-5 mt-8 font-display leading-snug first:mt-0"
                        style={{ fontSize: '1.45em', color: 'var(--color-gold-700)' }}
                      >
                        {render(block.x)}
                      </h2>
                    );
                  if (block.t === 's')
                    return (
                      <h3
                        key={i}
                        className="mb-2.5 mt-7 font-semibold leading-snug first:mt-0"
                        style={{ fontSize: '1.05em' }}
                      >
                        {render(block.x)}
                      </h3>
                    );
                  return (
                    <p key={i} className="mb-[1em] text-justify">
                      {render(block.x)}
                    </p>
                  );
                })}
              </div>

              {/* رقم الصفحة */}
              <span
                className="absolute bottom-[3.5%] left-1/2 -translate-x-1/2 font-latin text-xs"
                style={{ color: colors.dim }}
              >
                {page.n}
              </span>
            </article>
          </motion.div>
        </AnimatePresence>

        {/* مناطق النقر على الحواف — تقليب بنقرة واحدة */}
        <button
          onClick={() => turn(-1)}
          disabled={currentPage <= 1}
          aria-label="الصفحة السابقة"
          className="absolute inset-y-0 right-0 w-[12%] cursor-w-resize disabled:cursor-default"
        />
        <button
          onClick={() => turn(1)}
          disabled={currentPage >= total}
          aria-label="الصفحة التالية"
          className="absolute inset-y-0 left-0 w-[12%] cursor-e-resize disabled:cursor-default"
        />
      </div>
    </div>
  );
}
