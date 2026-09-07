'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { BookCover } from './BookCover';
import { luxe } from '@/lib/motion';
import { getAllProgress, removeProgress } from '@/lib/reading-progress';
import { getAllBookmarks, removeBookmark, type Bookmark } from '@/lib/bookmarks';
import type { BookSummary } from '@/lib/books';

/**
 * رفّي
 * ---------------------------------------------------------------
 * ما بدأه الزائر وما علّمه — مجموعان في مكان واحد. كل هذا محفوظ في
 * متصفّحه وحده، فلا يمكن معرفته وقت البناء: نعرض هيكلاً ساكناً ثم
 * نملؤه بعد التركيب، تفادياً لاختلاف ناتج الخادم عن المتصفّح.
 */

interface Started {
  book: BookSummary;
  page: number;
  at: number;
}

interface MarkGroup {
  book: BookSummary;
  marks: Bookmark[];
  latest: number;
}

export function MyShelf({ books }: { books: BookSummary[] }) {
  const [mounted, setMounted] = useState(false);
  const [started, setStarted] = useState<Started[]>([]);
  const [groups, setGroups] = useState<MarkGroup[]>([]);

  const bySlug = useMemo(() => new Map(books.map((book) => [book.slug, book])), [books]);

  /** قراءة كل ما في متصفّح الزائر — تُستدعى بعد كل حذف أيضاً */
  const refresh = useCallback(() => {
    setStarted(
      getAllProgress()
        .map((entry) => {
          const book = bySlug.get(entry.slug);
          return book ? { book, page: entry.page, at: entry.at } : null;
        })
        .filter((entry): entry is Started => entry !== null)
    );

    const collected = new Map<string, MarkGroup>();
    for (const mark of getAllBookmarks()) {
      const book = bySlug.get(mark.slug);
      if (!book) continue;
      const group = collected.get(mark.slug);
      if (group) {
        group.marks.push(mark);
        group.latest = Math.max(group.latest, mark.at);
      } else {
        collected.set(mark.slug, { book, marks: [mark], latest: mark.at });
      }
    }
    setGroups(
      [...collected.values()]
        .map((group) => ({ ...group, marks: group.marks.sort((a, b) => a.page - b.page) }))
        .sort((a, b) => b.latest - a.latest)
    );
  }, [bySlug]);

  useEffect(() => {
    setMounted(true);
    refresh();
  }, [refresh]);

  if (!mounted) {
    return <div className="mt-16 h-40 animate-pulse rounded-sm bg-ink-900" />;
  }

  if (started.length === 0 && groups.length === 0) {
    return (
      <div className="mt-20 text-center">
        <p className="font-body text-lg leading-relaxed text-ivory/75">
          رفّك فارغ بعد.
        </p>
        <p className="mx-auto mt-3 max-w-md font-body text-sm leading-loose text-ivory-dim">
          ما إن تبدأ كتاباً حتى يظهر هنا عند الصفحة التي وقفت عندها، وكل صفحة تعلّمها
          تُحفظ معه. كل ذلك في متصفّحك وحده — بلا حساب ولا تتبّع.
        </p>
        <Link
          href="/library"
          className="mt-9 inline-block rounded-sm px-8 py-3 font-body text-sm text-ink-950 transition-transform duration-200 hover:scale-[1.03]"
          style={{ backgroundImage: 'var(--grad-gold-surface)' }}
        >
          تصفّح المكتبة
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* أكمل القراءة */}
      {started.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-2xl text-gold-300">أكمل القراءة</h2>
          <hr className="rule-gold mt-5" />

          <ul className="mt-9 space-y-5">
            <AnimatePresence mode="popLayout">
              {started.map((entry) => {
                const percent = Math.min(
                  100,
                  Math.round((entry.page / entry.book.pageCount) * 100)
                );
                return (
                  <motion.li
                    key={entry.book.slug}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={luxe}
                    className="flex items-center gap-5 rounded-sm border border-ink-800 p-4 transition-colors hover:border-ink-600 sm:gap-7 sm:p-5"
                  >
                    <Link
                      href={`/book/${entry.book.slug}`}
                      className="w-16 flex-none sm:w-20"
                      aria-label={entry.book.title}
                    >
                      <BookCover book={entry.book} />
                    </Link>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/book/${entry.book.slug}`}
                        className="font-display text-lg leading-snug text-ivory transition-colors hover:text-gold-300"
                      >
                        {entry.book.title}
                      </Link>

                      <p className="mt-1.5 font-ui text-[0.65rem] tracking-[0.15em] text-ivory-dim">
                        صفحة {entry.page} من {entry.book.pageCount} · {percent}٪
                      </p>

                      <div className="mt-3 h-[3px] w-full max-w-sm bg-ink-800">
                        <div
                          className="h-full"
                          style={{
                            width: `${percent}%`,
                            backgroundImage: 'var(--grad-gold-surface)',
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex flex-none flex-col items-end gap-2">
                      <Link
                        href={`/read/${entry.book.slug}?p=${entry.page}`}
                        className="rounded-sm border border-gold-700 px-4 py-2 font-body text-xs text-gold-300 transition-colors hover:bg-gold-500/10"
                      >
                        تابع
                      </Link>
                      <button
                        onClick={() => {
                          removeProgress(entry.book.slug);
                          refresh();
                        }}
                        className="font-ui text-[0.62rem] text-ivory-dim transition-colors hover:text-copper"
                      >
                        إزالة من الرفّ
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </section>
      )}

      {/* العلامات المرجعية */}
      {groups.length > 0 && (
        <section className="mt-20">
          <h2 className="font-display text-2xl text-gold-300">العلامات المرجعية</h2>
          <hr className="rule-gold mt-5" />

          <div className="mt-9 space-y-12">
            <AnimatePresence mode="popLayout">
              {groups.map((group) => (
                <motion.section
                  key={group.book.slug}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={luxe}
                >
                  <header className="flex items-baseline justify-between gap-4 border-b border-ink-800 pb-3">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="h-5 w-[3px] rounded-full"
                        style={{ backgroundColor: group.book.accent }}
                      />
                      <Link
                        href={`/book/${group.book.slug}`}
                        className="font-display text-lg text-gold-300 transition-colors hover:text-gold-500"
                      >
                        {group.book.title}
                      </Link>
                    </div>
                    <span className="font-ui text-[0.62rem] tracking-[0.15em] text-ivory-dim">
                      {group.marks.length} علامة
                    </span>
                  </header>

                  <ul>
                    {group.marks.map((mark) => (
                      <li
                        key={mark.page}
                        className="flex items-start gap-3 border-b border-ink-800 py-4"
                      >
                        <Link
                          href={`/read/${group.book.slug}?p=${mark.page}`}
                          className="group min-w-0 flex-1"
                        >
                          <span className="flex items-baseline gap-3">
                            <span className="flex-1 font-body text-sm text-ivory/90 transition-colors group-hover:text-gold-300">
                              {mark.label}
                            </span>
                            <span className="font-latin text-xs text-ivory-dim">
                              صفحة {mark.page}
                            </span>
                          </span>
                          {mark.excerpt && (
                            <span className="mt-1.5 block font-body text-[0.78rem] leading-relaxed text-ivory-dim">
                              {mark.excerpt}
                            </span>
                          )}
                        </Link>
                        <button
                          onClick={() => {
                            removeBookmark(group.book.slug, mark.page);
                            refresh();
                          }}
                          aria-label={`إزالة علامة صفحة ${mark.page}`}
                          className="font-ui text-base leading-none text-ivory-dim transition-colors hover:text-copper"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </motion.section>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      <p className="mt-16 font-ui text-[0.65rem] leading-loose tracking-[0.15em] text-ivory-dim">
        كل ما في هذه الصفحة محفوظ في متصفّحك وحده — لا حساب ولا خادم ولا تتبّع. مسح
        بيانات الموقع من المتصفّح يمسحه.
      </p>
    </>
  );
}
