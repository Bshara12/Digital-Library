'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react';
import type { BookSummary } from '@/lib/books';

/**
 * خط زمني للأعمال
 * ---------------------------------------------------------------
 * خط ذهبي يُرسم من الأعلى للأسفل بالتزامن مع تمرير الزائر، وكل كتاب
 * نقطة ماسية تتوهّج عند وصول التمرير إليها.
 *
 * الخط على اليمين احتراماً لاتجاه القراءة العربية.
 */
export function AuthorTimeline({ books }: { books: BookSummary[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 80%', 'end 60%'],
  });

  const height = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <ol ref={ref} className="relative mt-10 space-y-10 pe-8">
      {/* مسار الخط */}
      <div aria-hidden className="absolute end-[3px] top-2 h-full w-px bg-ink-700" />
      <motion.div
        aria-hidden
        className="absolute end-[3px] top-2 w-px bg-gold-500"
        style={{ height: reduceMotion ? '100%' : height }}
      />

      {books.map((book, i) => (
        <motion.li
          key={book.slug}
          className="relative"
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* النقطة الماسية */}
          <span
            aria-hidden
            className="absolute -end-[3px] top-2.5 block h-2 w-2 rotate-45 bg-gold-500"
            style={{ boxShadow: '0 0 14px rgba(201,162,39,0.7)' }}
          />

          <Link href={`/book/${book.slug}`} className="group block">
            <div className="flex items-baseline gap-3">
              <span className="font-latin text-xs text-ivory-dim">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="font-display text-xl text-ivory transition-colors group-hover:text-gold-300">
                {book.title}
              </h3>
            </div>
            {book.subtitle && (
              <p className="mt-2 ms-8 font-body text-sm leading-relaxed text-ivory-dim">
                {book.subtitle}
              </p>
            )}
            <p className="mt-2 ms-8 font-ui text-[0.62rem] tracking-[0.15em] text-ivory-dim">
              {book.pageCount} صفحة · {book.chapterCount} فصل · {book.tags.join('، ')}
            </p>
          </Link>
        </motion.li>
      ))}
    </ol>
  );
}
