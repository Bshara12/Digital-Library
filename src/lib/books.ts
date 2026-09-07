/**
 * طبقة الوصول إلى المحتوى
 * ---------------------------------------------------------------
 * كل شيء يُقرأ من ملفات JSON المولَّدة بـ `npm run ingest` وقت البناء.
 * لا قاعدة بيانات ولا طلبات شبكة — الموقع ثابت بالكامل.
 */

import fs from 'node:fs';
import path from 'node:path';

const CONTENT_DIR = path.join(process.cwd(), 'content');

export type BlockType = 'p' | 'h' | 's';

export interface Block {
  /** p = فقرة ، h = عنوان فصل (في الفهرس) ، s = عنوان فرعي (في المتن فقط) */
  t: BlockType;
  /** النص */
  x: string;
}

export interface BookPage {
  n: number;
  blocks: Block[];
}

export interface Chapter {
  title: string;
  /** رقم الصفحة كما ورد في فهرس الكتاب */
  page: number;
  /** الصفحة التي عُثر فيها فعلاً على العنوان (تساوي page عند عدم التأكيد) */
  anchorPage: number;
  /** نص العنوان كما ورد في المتن — يوجد فقط عند تأكيد الموضع */
  headingText?: string;
  /** العناوين المستنتجة آلياً للكتب التي لا تحتوي فهرساً */
  suggested?: boolean;
}

export interface BookSummary {
  slug: string;
  title: string;
  subtitle: string | null;
  author: string;
  sourceFile: string;
  accent: string;
  tags: string[];
  order: number;
  pageCount: number;
  wordCount: number;
  readingMinutes: number;
  chapterCount: number;
  tocConfidence: 'high' | 'medium' | 'low' | 'none' | 'suggested';
  /** يُملأ حين يختلف عنوان الغلاف عن الترويسة المتكرّرة (خطأ في المصدر) */
  titleConflict: string | null;
  /** ملف التنزيل المولَّد بـ `npm run pdf` — null إن لم يُولَّد بعد */
  pdf: { path: string; bytes: number } | null;
}

export interface BookMeta extends Omit<BookSummary, 'chapterCount'> {
  description: string;
  chapters: Chapter[];
}

function readJson<T>(...segments: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, ...segments), 'utf8')) as T;
}

/** كل الكتب مرتّبة حسب `order` في scripts/books.config.mjs */
export function getAllBooks(): BookSummary[] {
  return readJson<BookSummary[]>('index.json').sort((a, b) => a.order - b.order);
}

export function getBookSlugs(): string[] {
  return getAllBooks().map((b) => b.slug);
}

export function getBookMeta(slug: string): BookMeta {
  return readJson<BookMeta>('books', slug, 'meta.json');
}

export function getBookPages(slug: string): BookPage[] {
  return readJson<BookPage[]>('books', slug, 'pages.json');
}

/** الوسوم المتاحة للتصفية في صفحة المكتبة */
export function getAllTags(): string[] {
  const tags = new Set<string>();
  for (const book of getAllBooks()) for (const tag of book.tags) tags.add(tag);
  return [...tags];
}

/** إجماليات تُعرض في الصفحة الرئيسية */
export function getLibraryStats() {
  const books = getAllBooks();
  return {
    bookCount: books.length,
    pageCount: books.reduce((sum, b) => sum + b.pageCount, 0),
    wordCount: books.reduce((sum, b) => sum + b.wordCount, 0),
    readingHours: Math.round(books.reduce((sum, b) => sum + b.readingMinutes, 0) / 60),
  };
}
