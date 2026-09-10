/**
 * أنواع نواة الاستخراج
 * ---------------------------------------------------------------
 * النواة مكتوبة بـ JavaScript خالص (`core.mjs`) لأن `scripts/` يشغّلها
 * بـ Node مباشرة بلا خطوة بناء. هذا الملف يمنحها أنواعاً كاملة عند
 * استيرادها من داخل تطبيق Next.
 *
 * الأنواع المُصدَّرة هنا هي مصدر الحقيقة لشكل بيانات الكتاب —
 * و`src/lib/books.ts` يعيد تصديرها لطبقة القراءة.
 */

import type { Block, BookMeta, BookPage, Chapter } from '@/lib/books';

export type { Block, BookMeta, BookPage, Chapter };

/** مدخلة الكتاب في `data/books.registry.json` */
export interface IngestEntry {
  docx: string;
  slug: string;
  accent: string;
  tags: string[];
  order: number;
  overrides?: {
    title?: string;
    subtitle?: string | null;
    description?: string;
  };
}

export interface BuiltBook {
  /** العناوين البارزة في المتن خارج الفهرس — تُعرض في تقرير المراجعة */
  subheadings: string[];
  meta: BookMeta;
  pages: BookPage[];
}

/** ميزانية الكلمات لكل صفحة مولّدة */
export const WORDS_PER_PAGE: number;

/** يحوّل بايتات ملف Word إلى بيانات الكتاب وصفحاته — بلا لمس القرص */
export function buildBook(options: {
  entry: IngestEntry;
  buffer: Buffer | Uint8Array;
  authorName: string;
  pdf?: { path: string; bytes: number } | null;
}): BuiltBook;

/** ملخّص الكتاب كما يظهر في `content/index.json` */
export function summarize(meta: BookMeta): Omit<BookMeta, 'chapters' | 'description'> & {
  chapterCount: number;
};
