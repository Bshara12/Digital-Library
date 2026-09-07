/**
 * موضع القراءة المحفوظ
 * ---------------------------------------------------------------
 * يُحفظ في متصفّح الزائر وحده — لا خادم، لا حساب، لا تتبّع.
 * كل عملية محاطة بـ try/catch لأن بعض المتصفّحات ترمي استثناءً عند
 * منع تخزين المواقع (تصفّح خاص، إعدادات صارمة).
 */

const KEY = 'esam-reading-progress';

export interface Progress {
  page: number;
  /** طابع زمني — يرتّب «رفّي» بالأحدث */
  at: number;
}

type Store = Record<string, Progress>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

export function getProgress(slug: string): Progress | null {
  return read()[slug] ?? null;
}

export function setProgress(slug: string, page: number): void {
  try {
    const store = read();
    store[slug] = { page, at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* التخزين ممنوع — القراءة تستمر بلا حفظ */
  }
}

/** إزالة كتاب من «رفّي» — القارئ وحده يقرّر ما يبقى فيه */
export function removeProgress(slug: string): void {
  try {
    const store = read();
    delete store[slug];
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* التخزين ممنوع — لا شيء محفوظاً أصلاً */
  }
}

/** كل الكتب المبدوءة، الأحدث أولاً */
export function getAllProgress(): Array<{ slug: string } & Progress> {
  return Object.entries(read())
    .map(([slug, p]) => ({ slug, ...p }))
    .sort((a, b) => b.at - a.at);
}
