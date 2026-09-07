'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TextMode } from './TextMode';
import { BookMode } from './BookMode';
import { ReaderChrome } from './ReaderChrome';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type ReaderSettings,
} from '@/lib/reader-settings';
import { getProgress, setProgress } from '@/lib/reading-progress';
import {
  getBookmarks,
  removeBookmark,
  toggleBookmark,
  type Bookmark,
} from '@/lib/bookmarks';
import type { BookMeta, BookPage } from '@/lib/books';

/**
 * القارئ — الغلاف الجامع
 * ---------------------------------------------------------------
 * يملك الحالة المشتركة بين الوضعين (الصفحة الحالية، الإعدادات،
 * العلامات، ظهور الواجهة) ويحفظ موضع القراءة في متصفّح الزائر.
 */

/** مهلة اختفاء الواجهة عند السكون */
const IDLE_MS = 3000;

interface Props {
  book: BookMeta;
  pages: BookPage[];
}

export function Reader({ book, pages }: Props) {
  const searchParams = useSearchParams();

  /*
   * الإعدادات وموضع القراءة والعلامات تعيش في المتصفّح، فلا يعرفها
   * التقديم على الخادم. نبدأ بالقيم الافتراضية ثم نُطبّق المحفوظ بعد
   * التركيب حتى لا يختلف ناتج الخادم عن المتصفّح.
   */
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [currentPage, setCurrentPage] = useState(1);
  const [startPage, setStartPage] = useState(1);
  const [ready, setReady] = useState(false);

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  /** عبارة البحث التي جاء منها الزائر — تُظلَّل في المتن حتى يُخفيها */
  const [highlight, setHighlight] = useState('');

  const [chromeVisible, setChromeVisible] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // التهيئة: الإعدادات المحفوظة + الصفحة المطلوبة أو آخر موضع + العلامات
  useEffect(() => {
    setSettings(loadSettings());
    setBookmarks(getBookmarks(book.slug));
    setHighlight(searchParams.get('q') ?? '');

    const requested = Number(searchParams.get('p'));
    const saved = getProgress(book.slug)?.page ?? 1;
    const page = Number.isFinite(requested) && requested >= 1 ? requested : saved;
    const clamped = Math.min(Math.max(page, 1), book.pageCount);

    setStartPage(clamped);
    setCurrentPage(clamped);
    setReady(true);
    // نتعمّد قراءة الرابط مرّة واحدة عند الفتح — تغييره لاحقاً لا يعيد التهيئة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.slug, book.pageCount]);

  // حفظ الموضع (بعد التهيئة فقط، وإلا كتبنا الصفحة ١ فوق موضع حقيقي)
  useEffect(() => {
    if (!ready) return;
    setProgress(book.slug, currentPage);
  }, [ready, book.slug, currentPage]);

  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  /*
   * إظهار الواجهة عند أي حركة، وإخفاؤها بعد سكون — فيبقى النصّ وحده.
   * لا نُخفيها ما دام اللوح الجانبي مفتوحاً.
   */
  const wake = useCallback(() => {
    setChromeVisible(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (panelOpen) return;
    idleTimer.current = setTimeout(() => setChromeVisible(false), IDLE_MS);
  }, [panelOpen]);

  useEffect(() => {
    wake();
    const events: Array<keyof WindowEventMap> = ['pointermove', 'pointerdown', 'keydown', 'scroll'];
    events.forEach((event) => window.addEventListener(event, wake, { passive: true }));
    return () => {
      events.forEach((event) => window.removeEventListener(event, wake));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [wake]);

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.min(Math.max(page, 1), book.pageCount);
      setStartPage(clamped);
      setCurrentPage(clamped);
    },
    [book.pageCount]
  );

  /* ---------------- العلامات المرجعية ---------------- */

  /** عنوان العلامة: الفصل الذي تقع فيه الصفحة، وإلا رقمها */
  const labelForPage = useCallback(
    (page: number) => {
      let label = '';
      for (const chapter of book.chapters) {
        if (chapter.anchorPage <= page) label = chapter.title;
        else break;
      }
      return label || `صفحة ${page}`;
    },
    [book.chapters]
  );

  /** أوّل فقرة في الصفحة — تذكّر القارئ بما وقف عنده */
  const excerptForPage = useCallback(
    (page: number) => {
      const block = pages.find((p) => p.n === page)?.blocks.find((b) => b.t === 'p');
      if (!block) return undefined;
      return block.x.length > 110 ? `${block.x.slice(0, 110).trimEnd()}…` : block.x;
    },
    [pages]
  );

  const onToggleBookmark = useCallback(() => {
    toggleBookmark(book.slug, currentPage, labelForPage(currentPage), excerptForPage(currentPage));
    setBookmarks(getBookmarks(book.slug));
  }, [book.slug, currentPage, labelForPage, excerptForPage]);

  const onRemoveBookmark = useCallback(
    (page: number) => {
      removeBookmark(book.slug, page);
      setBookmarks(getBookmarks(book.slug));
    },
    [book.slug]
  );

  const bookmarkedPages = useMemo(() => bookmarks.map((mark) => mark.page), [bookmarks]);
  const isBookmarked = bookmarkedPages.includes(currentPage);

  // اختصارات: F ملء الشاشة، B علامة مرجعية على الصفحة الحالية
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea/i.test(target.tagName)) return;

      const key = event.key.toLowerCase();
      if (key === 'f') {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      } else if (key === 'b') {
        onToggleBookmark();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggleBookmark]);

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <ReaderChrome
        book={book}
        settings={settings}
        onSettings={updateSettings}
        currentPage={currentPage}
        visible={chromeVisible}
        panelOpen={panelOpen}
        onPanel={setPanelOpen}
        onGoToPage={goToPage}
        bookmarks={bookmarks}
        isBookmarked={isBookmarked}
        onToggleBookmark={onToggleBookmark}
        onRemoveBookmark={onRemoveBookmark}
        highlight={highlight}
        onClearHighlight={() => setHighlight('')}
      />

      {settings.mode === 'book' ? (
        <BookMode
          pages={pages}
          settings={settings}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          highlight={highlight}
          bookmarked={isBookmarked}
        />
      ) : (
        <TextMode
          pages={pages}
          settings={settings}
          initialPage={startPage}
          onPageChange={setCurrentPage}
          highlight={highlight}
          bookmarks={bookmarkedPages}
        />
      )}
    </div>
  );
}
