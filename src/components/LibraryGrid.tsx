'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Book3D } from './Book3D';
import { luxe } from '@/lib/motion';
import { normalizeForSearch } from '@/lib/arabic';
import type { BookSummary } from '@/lib/books';

type Sort = 'order' | 'longest' | 'alpha';

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'order', label: 'الترتيب' },
  { id: 'longest', label: 'الأطول' },
  { id: 'alpha', label: 'أبجدي' },
];

/**
 * شبكة المكتبة مع البحث والفرز والتصفية.
 * الفرز والتصفية يحرّكان البطاقات إلى مواضعها الجديدة بانسيابية
 * (layout animation) بدل إعادة رسم مفاجئة.
 */
export function LibraryGrid({ books, tags }: { books: BookSummary[]; tags: string[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('order');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = normalizeForSearch(query);
    let list = books.filter((book) => {
      if (activeTag && !book.tags.includes(activeTag)) return false;
      if (!q) return true;
      const haystack = normalizeForSearch(`${book.title} ${book.subtitle ?? ''} ${book.tags.join(' ')}`);
      return haystack.includes(q);
    });

    list = [...list];
    if (sort === 'longest') list.sort((a, b) => b.pageCount - a.pageCount);
    else if (sort === 'alpha') list.sort((a, b) => a.title.localeCompare(b.title, 'ar'));
    else list.sort((a, b) => a.order - b.order);

    return list;
  }, [books, query, sort, activeTag]);

  return (
    <>
      {/* أدوات التحكّم */}
      <div className="mt-12 flex flex-col gap-6">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث في عناوين الكتب…"
          className="w-full rounded-sm border border-ink-700 bg-ink-900 px-5 py-3.5 font-body text-sm text-ivory placeholder:text-ivory-dim/70 focus:border-gold-700 focus:outline-none"
        />

        {/* هذا الحقل للعناوين — البحث في المتن صفحةٌ قائمة بذاتها */}
        <Link
          href={query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : '/search'}
          className="-mt-3 font-ui text-[0.68rem] tracking-[0.15em] text-ivory-dim transition-colors hover:text-gold-300"
        >
          {query.trim() ? `ابحث عن «${query.trim()}» في متن الكتب ←` : 'ابحث في متن الكتب كاملة ←'}
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            {SORTS.map((option) => (
              <button
                key={option.id}
                onClick={() => setSort(option.id)}
                className={`rounded-full px-4 py-1.5 font-ui text-[0.7rem] transition-colors ${
                  sort === option.id
                    ? 'bg-gold-500/15 text-gold-300'
                    : 'text-ivory-dim hover:text-ivory'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTag(null)}
              className={`rounded-full border px-4 py-1.5 font-ui text-[0.7rem] transition-colors ${
                activeTag === null
                  ? 'border-gold-700 text-gold-300'
                  : 'border-ink-700 text-ivory-dim hover:text-ivory'
              }`}
            >
              الكل
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                className={`rounded-full border px-4 py-1.5 font-ui text-[0.7rem] transition-colors ${
                  activeTag === tag
                    ? 'border-gold-700 text-gold-300'
                    : 'border-ink-700 text-ivory-dim hover:text-ivory'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-8 font-ui text-[0.7rem] tracking-[0.2em] text-ivory-dim">
        {visible.length} من {books.length} كتاب
      </p>

      <motion.ul
        layout
        className="scene-3d mt-10 grid grid-cols-2 gap-x-8 gap-y-24 sm:grid-cols-3 lg:grid-cols-4"
      >
        <AnimatePresence mode="popLayout">
          {visible.map((book) => (
            <motion.li
              key={book.slug}
              layout
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={luxe}
            >
              <Link href={`/book/${book.slug}`} className="block rounded-sm focus-visible:outline-offset-8">
                <Book3D book={book} />
                <div className="mt-7 text-center">
                  <h3 className="font-display text-base leading-snug text-ivory">{book.title}</h3>
                  <p className="mt-2 font-ui text-[0.62rem] tracking-[0.15em] text-ivory-dim">
                    {book.pageCount} صفحة · {book.readingMinutes} دقيقة
                  </p>
                </div>
              </Link>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>

      {visible.length === 0 && (
        <p className="mt-20 text-center font-body text-ivory-dim">
          لا نتائج مطابقة. جرّب كلمة أخرى.
        </p>
      )}
    </>
  );
}
