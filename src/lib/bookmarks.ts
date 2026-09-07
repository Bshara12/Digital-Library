/**
 * العلامات المرجعية
 * ---------------------------------------------------------------
 * كموضع القراءة تماماً: تعيش في متصفّح الزائر وحده — لا خادم، لا
 * حساب، لا تتبّع. وكل عملية محاطة بـ try/catch لأن بعض المتصفّحات
 * ترمي استثناءً عند منع التخزين (تصفّح خاص، إعدادات صارمة).
 */

const KEY = 'esam-bookmarks';

export interface Bookmark {
  page: number;
  /** عنوان الفصل الذي تقع فيه الصفحة، أو «صفحة ن» إن لم يوجد فهرس */
  label: string;
  /** مقتطف من بداية الصفحة يذكّر القارئ بما وقف عنده */
  excerpt?: string;
  /** طابع زمني — يرتّب قائمة «رفّي» بالأحدث */
  at: number;
}

type Store = Record<string, Bookmark[]>;

function read(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* التخزين ممنوع — العلامات تبقى لهذه الجلسة فقط */
  }
}

const byPage = (a: Bookmark, b: Bookmark) => a.page - b.page;

/** علامات كتاب واحد مرتّبة بترتيب الصفحات */
export function getBookmarks(slug: string): Bookmark[] {
  return [...(read()[slug] ?? [])].sort(byPage);
}

export function isBookmarked(slug: string, page: number): boolean {
  return (read()[slug] ?? []).some((mark) => mark.page === page);
}

/**
 * إضافة علامة أو إزالتها إن كانت الصفحة معلَّمة أصلاً.
 * تُرجع الحالة الجديدة: `true` أضيفت، `false` أُزيلت.
 */
export function toggleBookmark(
  slug: string,
  page: number,
  label: string,
  excerpt?: string
): boolean {
  const store = read();
  const marks = store[slug] ?? [];
  const existing = marks.findIndex((mark) => mark.page === page);

  if (existing !== -1) {
    marks.splice(existing, 1);
    if (marks.length) store[slug] = marks;
    else delete store[slug];
    write(store);
    return false;
  }

  store[slug] = [...marks, { page, label, excerpt, at: Date.now() }].sort(byPage);
  write(store);
  return true;
}

export function removeBookmark(slug: string, page: number): void {
  const store = read();
  const marks = (store[slug] ?? []).filter((mark) => mark.page !== page);
  if (marks.length) store[slug] = marks;
  else delete store[slug];
  write(store);
}

/** كل العلامات في المكتبة، الأحدث أولاً — تُغذّي صفحة «رفّي» */
export function getAllBookmarks(): Array<{ slug: string } & Bookmark> {
  return Object.entries(read())
    .flatMap(([slug, marks]) => marks.map((mark) => ({ slug, ...mark })))
    .sort((a, b) => b.at - a.at);
}

export function clearBookmarks(slug: string): void {
  const store = read();
  delete store[slug];
  write(store);
}
