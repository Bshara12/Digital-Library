'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { readingScales, type ReadingTheme } from '@/lib/design-tokens';
import { THEME_LABELS, type ReaderSettings } from '@/lib/reader-settings';
import type { BookMeta } from '@/lib/books';
import type { Bookmark } from '@/lib/bookmarks';
import { DownloadBook } from '@/components/DownloadBook';

/**
 * واجهة القارئ: الشريط العلوي واللوح الجانبي.
 * تتلاشى كلّها بعد سكون ثوانٍ ليبقى النصّ وحده أمام القارئ.
 */

interface Props {
  book: BookMeta;
  settings: ReaderSettings;
  onSettings: (patch: Partial<ReaderSettings>) => void;
  currentPage: number;
  visible: boolean;
  panelOpen: boolean;
  onPanel: (open: boolean) => void;
  onGoToPage: (page: number) => void;
  bookmarks: Bookmark[];
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onRemoveBookmark: (page: number) => void;
  /** عبارة البحث المظلَّلة في المتن — فارغة إن لم يأتِ القارئ من بحث */
  highlight: string;
  onClearHighlight: () => void;
}

export function ReaderChrome({
  book,
  settings,
  onSettings,
  currentPage,
  visible,
  panelOpen,
  onPanel,
  onGoToPage,
  bookmarks,
  isBookmarked,
  onToggleBookmark,
  onRemoveBookmark,
  highlight,
  onClearHighlight,
}: Props) {
  const progress = (currentPage / book.pageCount) * 100;
  const minutesLeft = Math.max(
    1,
    Math.round(book.readingMinutes * (1 - currentPage / book.pageCount))
  );

  return (
    <>
      {/* شريط التقدّم — يبقى ظاهراً دائماً، وهو الأنحف والأقلّ إزعاجاً */}
      <div className="fixed inset-x-0 top-0 z-40 h-[2px] bg-ink-800/60">
        <div
          className="h-full transition-[width] duration-300"
          style={{ width: `${progress}%`, backgroundImage: 'var(--grad-gold-surface)' }}
        />
      </div>

      {/* الشريط العلوي */}
      <AnimatePresence>
        {visible && (
          <motion.header
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-4 border-b border-ink-800 bg-ink-950/92 px-5 py-3 backdrop-blur-md"
          >
            <Link
              href={`/book/${book.slug}`}
              className="font-ui text-[0.7rem] tracking-[0.15em] text-ivory-dim transition-colors hover:text-gold-300"
            >
              ← {book.title}
            </Link>

            <div className="flex items-center gap-4">
              <span className="hidden font-ui text-[0.68rem] text-ivory-dim sm:inline">
                صفحة {currentPage} من {book.pageCount} · بقي {minutesLeft} دقيقة
              </span>

              {/* العلامة المرجعية — الأيقونة نفسها معبّرة، فلا حاجة لنصّ */}
              <button
                onClick={onToggleBookmark}
                aria-pressed={isBookmarked}
                title={isBookmarked ? 'إزالة العلامة (B)' : 'علّم هذه الصفحة (B)'}
                aria-label={isBookmarked ? 'إزالة العلامة من هذه الصفحة' : 'علّم هذه الصفحة'}
                className={`rounded-full border px-3 py-1.5 font-ui text-[0.8rem] leading-none transition-colors ${
                  isBookmarked
                    ? 'border-gold-700 text-gold-300'
                    : 'border-ink-700 text-ivory-dim hover:border-gold-700 hover:text-gold-300'
                }`}
              >
                {isBookmarked ? '❖' : '◇'}
              </button>

              {/* تبديل الوضع */}
              <button
                onClick={() => onSettings({ mode: settings.mode === 'book' ? 'text' : 'book' })}
                className="rounded-full border border-ink-700 px-3.5 py-1.5 font-ui text-[0.68rem] text-ivory-dim transition-colors hover:border-gold-700 hover:text-gold-300"
              >
                {settings.mode === 'book' ? 'وضع القراءة' : 'وضع الكتاب'}
              </button>

              <button
                onClick={() => onPanel(!panelOpen)}
                aria-expanded={panelOpen}
                className="rounded-full border border-ink-700 px-3.5 py-1.5 font-ui text-[0.68rem] text-ivory-dim transition-colors hover:border-gold-700 hover:text-gold-300"
              >
                الفهرس والإعدادات
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* شريط نتيجة البحث — يبقى ما بقي التظليل، ويُخفى بنقرة */}
      <AnimatePresence>
        {highlight && visible && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 top-[3.25rem] z-20 flex items-center justify-center gap-4 border-b border-ink-800 bg-ink-900/92 px-5 py-2 backdrop-blur-md"
          >
            <span className="font-ui text-[0.68rem] text-ivory-dim">
              تظليل «{highlight}» في المتن
            </span>
            <button
              onClick={onClearHighlight}
              className="font-ui text-[0.68rem] text-gold-300 transition-colors hover:text-gold-500"
            >
              إخفاء
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* اللوح الجانبي */}
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onPanel(false)}
            />
            <motion.aside
              className="fixed inset-y-0 end-0 z-50 flex w-[min(24rem,88vw)] flex-col border-s border-ink-700 bg-ink-900"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center justify-between border-b border-ink-800 px-6 py-4">
                <h2 className="font-display text-lg text-gold-300">الفهرس والإعدادات</h2>
                <button
                  onClick={() => onPanel(false)}
                  aria-label="إغلاق"
                  className="font-ui text-xl text-ivory-dim hover:text-gold-300"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6">
                {/* الإعدادات */}
                <section>
                  <h3 className="font-ui text-[0.65rem] tracking-[0.25em] text-ivory-dim">السمة</h3>
                  <div className="mt-3 flex gap-2">
                    {(Object.keys(THEME_LABELS) as ReadingTheme[]).map((theme) => (
                      <button
                        key={theme}
                        onClick={() => onSettings({ theme })}
                        className={`flex-1 rounded-sm border px-3 py-2 font-body text-xs transition-colors ${
                          settings.theme === theme
                            ? 'border-gold-700 text-gold-300'
                            : 'border-ink-700 text-ivory-dim hover:text-ivory'
                        }`}
                      >
                        {THEME_LABELS[theme]}
                      </button>
                    ))}
                  </div>
                </section>

                <Stepper
                  label="حجم الخط"
                  value={settings.fontSize}
                  max={readingScales.fontSize.length - 1}
                  onChange={(fontSize) => onSettings({ fontSize })}
                />
                <Stepper
                  label="تباعد الأسطر"
                  value={settings.lineHeight}
                  max={readingScales.lineHeight.length - 1}
                  onChange={(lineHeight) => onSettings({ lineHeight })}
                />
                {settings.mode === 'text' && (
                  <Stepper
                    label="عرض العمود"
                    value={settings.measure}
                    max={readingScales.measure.length - 1}
                    onChange={(measure) => onSettings({ measure })}
                  />
                )}

                <section className="mt-7">
                  <h3 className="font-ui text-[0.65rem] tracking-[0.25em] text-ivory-dim">الخط</h3>
                  <div className="mt-3 flex gap-2">
                    {[
                      { alt: false, label: 'نسخ' },
                      { alt: true, label: 'حديث' },
                    ].map((option) => (
                      <button
                        key={option.label}
                        onClick={() => onSettings({ altFont: option.alt })}
                        className={`flex-1 rounded-sm border px-3 py-2 text-xs transition-colors ${
                          settings.altFont === option.alt
                            ? 'border-gold-700 text-gold-300'
                            : 'border-ink-700 text-ivory-dim hover:text-ivory'
                        }`}
                        style={{
                          fontFamily: option.alt ? 'var(--font-body-alt)' : 'var(--font-body)',
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </section>

                {/* التنزيل */}
                {book.pdf && (
                  <section className="mt-7">
                    <h3 className="font-ui text-[0.65rem] tracking-[0.25em] text-ivory-dim">
                      نسخة للاحتفاظ
                    </h3>
                    <div className="mt-3">
                      <DownloadBook pdf={book.pdf} title={book.title} compact />
                    </div>
                  </section>
                )}

                {/* العلامات المرجعية */}
                <section className="mt-9">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-ui text-[0.65rem] tracking-[0.25em] text-ivory-dim">
                      العلامات المرجعية
                    </h3>
                    <button
                      onClick={onToggleBookmark}
                      className="font-ui text-[0.65rem] text-gold-300 transition-colors hover:text-gold-500"
                    >
                      {isBookmarked ? 'إزالة علامة هذه الصفحة' : 'علّم هذه الصفحة'}
                    </button>
                  </div>

                  {bookmarks.length === 0 ? (
                    <p className="mt-3 font-body text-xs leading-relaxed text-ivory-dim">
                      لا علامات في هذا الكتاب بعد. علّم أي صفحة بمفتاح <kbd>B</kbd> أو بالزرّ
                      أعلى الشاشة، وتجدها كلّها في «رفّي».
                    </p>
                  ) : (
                    <ul className="mt-3">
                      {bookmarks.map((mark) => (
                        <li
                          key={mark.page}
                          className="flex items-start gap-2 border-b border-ink-800 py-3"
                        >
                          <button
                            onClick={() => {
                              onGoToPage(mark.page);
                              onPanel(false);
                            }}
                            className="flex-1 text-start transition-colors hover:text-gold-300"
                          >
                            <span className="flex items-baseline gap-3">
                              <span className="flex-1 font-body text-sm leading-relaxed text-ivory/85">
                                {mark.label}
                              </span>
                              <span className="font-latin text-xs text-ivory-dim">{mark.page}</span>
                            </span>
                            {mark.excerpt && (
                              <span className="mt-1 block font-body text-[0.72rem] leading-relaxed text-ivory-dim">
                                {mark.excerpt}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => onRemoveBookmark(mark.page)}
                            aria-label={`إزالة علامة صفحة ${mark.page}`}
                            className="font-ui text-base leading-none text-ivory-dim transition-colors hover:text-copper"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* الفهرس */}
                {book.chapters.length > 0 && (
                  <section className="mt-9">
                    <h3 className="font-ui text-[0.65rem] tracking-[0.25em] text-ivory-dim">
                      الفهرس
                    </h3>
                    <ol className="mt-3">
                      {book.chapters.map((chapter, i) => {
                        const active =
                          currentPage >= chapter.anchorPage &&
                          (i === book.chapters.length - 1 ||
                            currentPage < book.chapters[i + 1].anchorPage);
                        return (
                          <li key={`${chapter.page}-${i}`}>
                            <button
                              onClick={() => {
                                onGoToPage(chapter.anchorPage);
                                onPanel(false);
                              }}
                              className={`flex w-full items-baseline gap-3 border-b border-ink-800 py-3 text-start transition-colors ${
                                active ? 'text-gold-300' : 'text-ivory/80 hover:text-gold-300'
                              }`}
                            >
                              <span className="flex-1 font-body text-sm leading-relaxed">
                                {chapter.title}
                              </span>
                              <span className="font-latin text-xs text-ivory-dim">
                                {chapter.page}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/** مبدّل مستويات (حجم الخط، التباعد، العرض) */
function Stepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <section className="mt-7">
      <h3 className="font-ui text-[0.65rem] tracking-[0.25em] text-ivory-dim">{label}</h3>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          aria-label={`تصغير ${label}`}
          className="h-9 w-9 rounded-sm border border-ink-700 font-ui text-ivory-dim transition-colors hover:border-gold-700 hover:text-gold-300 disabled:opacity-35"
        >
          −
        </button>
        <div className="flex flex-1 gap-1">
          {Array.from({ length: max + 1 }, (_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= value ? 'bg-gold-500' : 'bg-ink-700'}`}
            />
          ))}
        </div>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value === max}
          aria-label={`تكبير ${label}`}
          className="h-9 w-9 rounded-sm border border-ink-700 font-ui text-ivory-dim transition-colors hover:border-gold-700 hover:text-gold-300 disabled:opacity-35"
        >
          +
        </button>
      </div>
    </section>
  );
}
