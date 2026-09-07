'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { Book3D } from './Book3D';
import { revealUp, stagger, inView } from '@/lib/motion';
import type { BookSummary } from '@/lib/books';

/**
 * الرفّ ثلاثي الأبعاد
 * ---------------------------------------------------------------
 * على الشاشات العريضة: رفّ خشبي مائل قليلاً بمنظور حقيقي.
 * على الجوال: تمرير أفقي انسيابي ببطاقة ونصف ظاهرة — أفضل بكثير من
 * ضغط ثمانية كتب في شبكة ضيّقة.
 */
export function Shelf({ books }: { books: BookSummary[] }) {
  return (
    <section className="relative px-6 py-28">
      <motion.header className="mx-auto mb-20 max-w-2xl text-center" {...inView} variants={revealUp}>
        <h2 className="font-display text-3xl text-gold-300 sm:text-4xl">الأعمال الكاملة</h2>
        <hr className="rule-gold mx-auto mt-6 w-40" />
      </motion.header>

      <motion.div
        className="scene-3d mx-auto max-w-6xl"
        variants={stagger(0, 0.09)}
        {...inView}
      >
        {/* الرفّ: تمرير أفقي على الجوال، شبكة على الشاشات الأكبر */}
        <ul
          className="
            flex snap-x snap-mandatory gap-7 overflow-x-auto pb-4
            [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
            sm:grid sm:grid-cols-3 sm:gap-x-9 sm:gap-y-24 sm:overflow-visible
            lg:grid-cols-4
          "
          style={{ transform: 'rotateX(6deg)', transformStyle: 'preserve-3d' }}
        >
          {books.map((book) => (
            <motion.li
              key={book.slug}
              variants={revealUp}
              className="w-[58vw] flex-none snap-center sm:w-auto"
            >
              <Link
                href={`/book/${book.slug}`}
                className="block rounded-sm focus-visible:outline-offset-8"
                aria-label={`${book.title} — ${book.pageCount} صفحة`}
              >
                <Book3D book={book} />

                <div className="mt-7 text-center">
                  <h3 className="font-display text-lg leading-snug text-ivory">{book.title}</h3>
                  <p className="mt-2 font-ui text-[0.65rem] tracking-[0.15em] text-ivory-dim">
                    {book.pageCount} صفحة · {book.readingMinutes} دقيقة
                  </p>
                </div>
              </Link>
            </motion.li>
          ))}
        </ul>

        {/* لوح الرفّ وظلّه */}
        <div
          aria-hidden
          className="mx-auto mt-4 hidden h-px max-w-6xl sm:block"
          style={{
            backgroundImage:
              'linear-gradient(90deg, transparent, rgba(201,162,39,0.35) 20%, rgba(201,162,39,0.35) 80%, transparent)',
          }}
        />
      </motion.div>

      <p className="mt-10 text-center font-ui text-[0.65rem] tracking-[0.2em] text-ivory-dim sm:hidden">
        اسحب لاستعراض الكتب
      </p>
    </section>
  );
}
