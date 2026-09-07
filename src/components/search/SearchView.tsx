'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Marked } from './Marked';
import { luxe } from '@/lib/motion';
import {
  MIN_QUERY,
  highlightRanges,
  loadBookIndex,
  makeSnippet,
  matchesBookTitle,
  parseQuery,
  searchIndex,
  splitByRanges,
  type BookResults,
  type Hit,
  type LoadedIndex,
} from '@/lib/search';
import type { BookSummary } from '@/lib/books';

/**
 * البحث الشامل
 * ---------------------------------------------------------------
 * يبحث في متن الكتب كلّها لا في عناوينها فقط. الفهارس تُنزَّل عند
 * أوّل حرف يُكتب — لا تُثقَل الصفحة قبل أن يطلب الزائر بحثاً فعلياً —
 * وتظهر النتائج تباعاً مع وصول كل كتاب بدل انتظار آخرها.
 */

/** مهلة تهدئة الكتابة: أقصر من أن تُحسّ، وأطول من أن نبحث عند كل حرف */
const DEBOUNCE_MS = 180;

/** عدد النتائج المعروضة لكل كتاب قبل «عرض المزيد» */
const PER_BOOK = 4;
const PER_BOOK_MORE = 20;

const KIND_LABEL: Record<0 | 1 | 2, string> = { 0: 'فقرة', 1: 'فصل', 2: 'عنوان' };

export function SearchView({ books }: { books: BookSummary[] }) {
  const searchParams = useSearchParams();
  const initial = searchParams.get('q') ?? '';

  const [input, setInput] = useState(initial);
  const [query, setQuery] = useState(initial);
  const [indexes, setIndexes] = useState<LoadedIndex[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [scope, setScope] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* تنزيل الفهارس — مرّة واحدة، وكل كتاب يعرض نتائجه فور وصوله */
  const beginLoading = useCallback(() => {
    if (started.current) return;
    started.current = true;
    for (const book of books) {
      loadBookIndex(book.slug)
        .then((index) => alive.current && setIndexes((previous) => [...previous, index]))
        .catch(() => alive.current && setFailed((previous) => [...previous, book.slug]));
    }
  }, [books]);

  // تهدئة الكتابة
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (input.trim().length >= MIN_QUERY) beginLoading();
  }, [input, beginLoading]);

  /*
   * الرابط يحمل البحث ليكون قابلاً للمشاركة والرجوع إليه.
   * نستعمل history مباشرة لا router.replace — الأخير يُعيد تقديم
   * الصفحة عند كل حرف بلا داعٍ.
   */
  useEffect(() => {
    const url = query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : '/search';
    window.history.replaceState(null, '', url);
  }, [query]);

  // «/» تركّز حقل البحث — عادة قرّاء الويب
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea/i.test(target.tagName)) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const parsed = useMemo(() => parseQuery(query), [query]);
  const active = parsed.phrase.length >= MIN_QUERY;

  /** الكتب التي يطابقها البحث في عنوانها أو نبذتها أو وسومها */
  const titleMatches = useMemo(() => {
    if (!active) return [];
    return books.filter((book) =>
      matchesBookTitle(`${book.title} ${book.subtitle ?? ''} ${book.tags.join(' ')}`, parsed)
    );
  }, [active, books, parsed]);

  const run = useCallback(
    (relaxed: boolean) =>
      indexes
        .filter((index) => !scope || index.slug === scope)
        .map((index) =>
          searchIndex(
            index,
            parsed,
            expanded.has(index.slug) ? PER_BOOK_MORE : PER_BOOK,
            relaxed
          )
        )
        .filter((group) => group.total > 0)
        .sort((a, b) => (b.hits[0]?.score ?? 0) - (a.hits[0]?.score ?? 0)),
    [indexes, parsed, scope, expanded]
  );

  /*
   * المطابقة الصارمة تطلب اجتماع كل كلمات البحث في فقرة واحدة. حين لا
   * تعطي شيئاً في المكتبة كلّها نخفّف الشرط ونصرّح بذلك — أنفع للقارئ
   * من صفحة فارغة.
   */
  const { groups, relaxed } = useMemo(() => {
    if (!active) return { groups: [] as BookResults[], relaxed: false };
    const strict = run(false);
    if (strict.length || parsed.tokens.length < 2) return { groups: strict, relaxed: false };
    return { groups: run(true), relaxed: true };
  }, [active, run, parsed.tokens.length]);

  const totalHits = groups.reduce((sum, group) => sum + group.total, 0);
  const loading = active && indexes.length + failed.length < books.length;
  const progress = Math.round(((indexes.length + failed.length) / books.length) * 100);

  return (
    <>
      {/* حقل البحث */}
      <div className="mt-12">
        <div className="relative">
          <input
            ref={inputRef}
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onFocus={beginLoading}
            autoFocus
            placeholder="ابحث في متن الكتب كلّها…"
            aria-label="البحث في متن الكتب"
            className="w-full rounded-sm border border-ink-700 bg-ink-900 px-5 py-4 font-body text-base text-ivory placeholder:text-ivory-dim/70 focus:border-gold-700 focus:outline-none"
          />
          {input && (
            <button
              onClick={() => {
                setInput('');
                inputRef.current?.focus();
              }}
              aria-label="مسح البحث"
              className="absolute inset-y-0 left-4 font-ui text-xl text-ivory-dim transition-colors hover:text-gold-300"
            >
              ×
            </button>
          )}
        </div>

        {/* شريط تقدّم تنزيل الفهارس */}
        <div className="mt-2 h-px bg-ink-800">
          {loading && (
            <div
              className="h-full transition-[width] duration-500"
              style={{ width: `${progress}%`, backgroundImage: 'var(--grad-gold-surface)' }}
            />
          )}
        </div>

        {/* حصر البحث بكتاب واحد */}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => setScope(null)}
            className={`rounded-full border px-4 py-1.5 font-ui text-[0.7rem] transition-colors ${
              scope === null
                ? 'border-gold-700 text-gold-300'
                : 'border-ink-700 text-ivory-dim hover:text-ivory'
            }`}
          >
            كل الكتب
          </button>
          {books.map((book) => (
            <button
              key={book.slug}
              onClick={() => setScope(book.slug === scope ? null : book.slug)}
              className={`rounded-full border px-4 py-1.5 font-ui text-[0.7rem] transition-colors ${
                scope === book.slug
                  ? 'border-gold-700 text-gold-300'
                  : 'border-ink-700 text-ivory-dim hover:text-ivory'
              }`}
            >
              {book.title}
            </button>
          ))}
        </div>
      </div>

      {/* سطر الحالة */}
      <p className="mt-8 font-ui text-[0.7rem] tracking-[0.18em] text-ivory-dim" aria-live="polite">
        {!active
          ? 'اكتب كلمة أو عبارة — يشمل البحث نصّ الكتب كاملاً، لا العناوين وحدها.'
          : loading
            ? `يجهّز الفهرس… ${indexes.length} من ${books.length} كتاب`
            : totalHits
              ? `${totalHits} نتيجة في ${groups.length} كتاب`
              : 'لا نتائج مطابقة.'}
      </p>

      {relaxed && totalHits > 0 && (
        <p className="mt-2 font-body text-xs leading-relaxed text-ivory-dim">
          لا فقرة تجمع كلمات بحثك كلّها — هذه أقرب ما وُجد.
        </p>
      )}

      {failed.length > 0 && (
        <p className="mt-2 font-ui text-[0.7rem] text-copper">
          تعذّر تحميل فهرس {failed.length} كتاب — أعد المحاولة بعد قليل.
        </p>
      )}

      {/* الكتب المطابقة بعنوانها */}
      {active && titleMatches.length > 0 && (
        <section className="mt-10">
          <h2 className="font-ui text-[0.65rem] tracking-[0.25em] text-ivory-dim">كتب مطابقة</h2>
          <ul className="mt-4 flex flex-wrap gap-3">
            {titleMatches.map((book) => (
              <li key={book.slug}>
                <Link
                  href={`/book/${book.slug}`}
                  className="flex items-center gap-3 rounded-sm border border-ink-700 px-4 py-2.5 transition-colors hover:border-gold-700"
                >
                  <span
                    aria-hidden
                    className="h-7 w-[3px] rounded-full"
                    style={{ backgroundColor: book.accent }}
                  />
                  <span className="font-body text-sm text-ivory">{book.title}</span>
                  <span className="font-ui text-[0.62rem] text-ivory-dim">
                    {book.pageCount} صفحة
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* النتائج داخل المتن */}
      <div className="mt-12 space-y-14">
        <AnimatePresence mode="popLayout">
          {groups.map((group) => (
            <motion.section
              key={group.index.slug}
              layout
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={luxe}
            >
              <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink-800 pb-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="h-5 w-[3px] rounded-full"
                    style={{ backgroundColor: group.index.accent }}
                  />
                  <Link
                    href={`/book/${group.index.slug}`}
                    className="font-display text-xl text-gold-300 transition-colors hover:text-gold-500"
                  >
                    {group.index.title}
                  </Link>
                </div>
                <span className="font-ui text-[0.65rem] tracking-[0.15em] text-ivory-dim">
                  {group.total} نتيجة
                </span>
              </header>

              <ul>
                {group.hits.map((hit) => (
                  <HitRow key={`${hit.page}-${hit.text.slice(0, 24)}`} hit={hit} raw={query} />
                ))}
              </ul>

              {group.total > group.hits.length && (
                <button
                  onClick={() =>
                    setExpanded((previous) => new Set(previous).add(group.index.slug))
                  }
                  className="mt-4 font-ui text-[0.7rem] tracking-[0.15em] text-ivory-dim transition-colors hover:text-gold-300"
                >
                  عرض المزيد من «{group.index.title}» ←
                </button>
              )}
            </motion.section>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

/** نتيجة واحدة: موضعها في الكتاب، ومقتطف مظلَّل يقود إلى القراءة */
function HitRow({ hit, raw }: { hit: Hit; raw: string }) {
  const parsed = useMemo(() => parseQuery(raw), [raw]);
  const snippet = useMemo(
    () => makeSnippet(hit.text, highlightRanges(hit.text, parsed)),
    [hit.text, parsed]
  );

  return (
    <li>
      <Link
        href={`/read/${hit.slug}?p=${hit.page}&q=${encodeURIComponent(raw.trim())}`}
        className="group block border-b border-ink-800 py-5 transition-colors hover:border-gold-700"
      >
        <div className="flex items-baseline gap-3">
          <span className="font-ui text-[0.6rem] tracking-[0.18em] text-copper">
            {KIND_LABEL[hit.kind]}
          </span>
          <span className="font-latin text-xs text-ivory-dim">صفحة {hit.page}</span>
        </div>

        <p
          className={`mt-2 leading-[1.95] text-ivory/85 transition-colors group-hover:text-ivory ${
            hit.kind === 1 ? 'font-display text-lg' : 'font-body text-[0.97rem]'
          }`}
        >
          {snippet.before && <span className="text-ivory-dim">… </span>}
          <Marked parts={splitByRanges(snippet.text, snippet.ranges)} />
          {snippet.after && <span className="text-ivory-dim"> …</span>}
        </p>
      </Link>
    </li>
  );
}
