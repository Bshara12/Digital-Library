import type { ReadingTheme, ReadingMode } from './design-tokens';

/**
 * تفضيلات القراءة
 * ---------------------------------------------------------------
 * محفوظة في متصفّح الزائر. الوضع الافتراضي يتبدّل حسب الجهاز:
 * «الكتاب» على الحاسوب و«القراءة» على الجوال — لأن عرض صفحة A4
 * على شاشة ٦ إنش تجربة مؤلمة مهما بلغت فخامتها.
 */

const KEY = 'esam-reader-settings';

export interface ReaderSettings {
  mode: ReadingMode;
  theme: ReadingTheme;
  /** فهارس داخل readingScales في design-tokens */
  fontSize: number;
  lineHeight: number;
  measure: number;
  /** الخط الحديث بديلاً عن النسخ */
  altFont: boolean;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  mode: 'text',
  theme: 'night',
  fontSize: 1,
  lineHeight: 1,
  measure: 1,
  altFont: false,
};

/** الوضع الافتراضي حسب الجهاز — يُستدعى في المتصفّح فقط */
export function defaultModeForDevice(): ReadingMode {
  if (typeof window === 'undefined') return 'text';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.innerWidth < 1024;
  return coarse || narrow ? 'text' : 'book';
}

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, mode: defaultModeForDevice() };
    // ندمج مع الافتراضي حتى لا تكسر إضافةُ خيارٍ جديد الإعداداتِ المحفوظة
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ReaderSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS, mode: defaultModeForDevice() };
  }
}

export function saveSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* التخزين ممنوع — الإعدادات تبقى لهذه الجلسة فقط */
  }
}

/** ألوان كل سمة قراءة */
export const THEME_COLORS: Record<ReadingTheme, { bg: string; fg: string; dim: string }> = {
  night: { bg: '#0A0A0C', fg: '#EDE7DA', dim: '#9A9287' },
  day: { bg: '#F5EFE2', fg: '#211E18', dim: '#6B6355' },
  sepia: { bg: '#EFE3CC', fg: '#2A2318', dim: '#6E6047' },
};

export const THEME_LABELS: Record<ReadingTheme, string> = {
  night: 'ليلي',
  day: 'نهاري',
  sepia: 'سيبيا',
};
