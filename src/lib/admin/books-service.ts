/**
 * عمليات الكتب — إضافة وتعديل وحذف
 * ===============================================================
 * كل عملية تُترجم إلى مجموعة تغييرات على ملفات، ثم يطبّقها المخزن
 * (القرص محلياً، المستودع على Vercel). المنطق واحد في الحالتين.
 *
 * الاستخراج يجري **داخل العملية** عبر `src/lib/ingest/core.mjs` —
 * نفس النواة التي يستعملها `npm run ingest`. لا تشغيل لعملية خارجية:
 * على Vercel لا سبيل إلى ذلك أصلاً، ومحلياً لا داعي له.
 *
 * ولماذا نعيد بناء الكتاب المتغيّر وحده لا المكتبة كلها؟ لأن إعادة
 * بناء الكل على Vercel تعني تنزيل كل ملفات Word من المستودع (١٢ م.ب)
 * في كل عملية. والنتيجة واحدة: النواة واحدة، وملخّص كل كتاب محفوظ
 * في `content/index.json` فنُحدّث منه المدخلة المعنيّة فقط.
 */

import { AUTHOR_NAME } from '@/lib/ingest/author.mjs';
import { buildBook, summarize } from '@/lib/ingest/core.mjs';
import type { BookSummary } from '@/lib/books';
import type { FileChange, Store, ApplyResult } from './store';
import { INDEX_FILE, REGISTRY_FILE } from './store';
import type { RegistryEntry } from './registry';
import { ValidationError, assertUniqueSlug } from './validate';

export interface BookInput {
  slug: string;
  docx: string;
  accent: string;
  tags: string[];
  order: number;
  overrides?: RegistryEntry['overrides'];
}

export interface OperationResult extends ApplyResult {
  slug: string;
  title: string;
  pageCount: number;
  chapterCount: number;
  wordCount: number;
}

/* ---------------------------------------------------------------
   قراءة الحالة الراهنة
   --------------------------------------------------------------- */

export async function loadRegistry(store: Store): Promise<RegistryEntry[]> {
  const raw = await store.readText(REGISTRY_FILE);
  if (!raw) throw new Error(`${REGISTRY_FILE} غير موجود في المصدر.`);
  return (JSON.parse(raw) as RegistryEntry[]).sort((a, b) => a.order - b.order);
}

export async function loadIndex(store: Store): Promise<BookSummary[]> {
  const raw = await store.readText(INDEX_FILE);
  return raw ? (JSON.parse(raw) as BookSummary[]) : [];
}

const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
/** الصفحات تُكتب مضغوطة بلا مسافات — أكبر ملف في المشروع ولا يُقرأ بشرياً */
const jsonCompact = (value: unknown): Buffer => Buffer.from(JSON.stringify(value), 'utf8');

function registryFile(entries: RegistryEntry[]): FileChange {
  const ordered = entries
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({
      docx: entry.docx,
      slug: entry.slug,
      accent: entry.accent,
      tags: entry.tags,
      order: entry.order,
      ...(entry.overrides && Object.keys(entry.overrides).length > 0
        ? { overrides: entry.overrides }
        : {}),
    }));
  return { path: REGISTRY_FILE, content: json(ordered) };
}

function indexFile(summaries: BookSummary[]): FileChange {
  return {
    path: INDEX_FILE,
    content: json(summaries.slice().sort((a, b) => a.order - b.order)),
  };
}

const contentPaths = (slug: string) => ({
  meta: `content/books/${slug}/meta.json`,
  pages: `content/books/${slug}/pages.json`,
});

/* ---------------------------------------------------------------
   إضافة كتاب
   --------------------------------------------------------------- */

export async function addBook(
  store: Store,
  input: BookInput,
  docxBytes: Buffer,
  pdfBytes: Buffer | null
): Promise<OperationResult> {
  const registry = await loadRegistry(store);
  assertUniqueSlug(registry, input.slug);

  if (registry.some((entry) => entry.docx === input.docx)) {
    throw new ValidationError(
      `يوجد كتاب آخر بملف باسم «${input.docx}». غيّر اسم الملف قبل الرفع.`
    );
  }

  const entry: RegistryEntry = { ...input };
  const pdfPath = `public/books/${input.slug}.pdf`;
  const built = buildBook({
    entry,
    buffer: docxBytes,
    authorName: AUTHOR_NAME,
    pdf: pdfBytes ? { path: `/books/${input.slug}.pdf`, bytes: pdfBytes.length } : null,
  });

  const index = await loadIndex(store);
  const paths = contentPaths(input.slug);

  const changes: FileChange[] = [
    { path: `books/${input.docx}`, content: docxBytes },
    registryFile([...registry, entry]),
    { path: paths.meta, content: json(built.meta) },
    { path: paths.pages, content: jsonCompact(built.pages) },
    indexFile([...index, summarize(built.meta)]),
  ];
  if (pdfBytes) changes.push({ path: pdfPath, content: pdfBytes });

  const applied = await store.apply(changes, `إضافة كتاب: ${built.meta.title}`);
  return { ...applied, ...stats(built) };
}

/* ---------------------------------------------------------------
   تعديل كتاب
   ---------------------------------------------------------------
   التعديل يمسّ ما يُحرَّر يدوياً (الوسوم، اللون، الترتيب، تصحيح
   العنوان والنبذة). لكنّ هذه تُكتب داخل `meta.json`، وبعضها يغيّر
   الاستخراج نفسه (تجاوز العنوان مثلاً)، فنعيد بناء الكتاب من ملف
   Word الأصلي بدل تعديل الحقول في مكانها — نتيجة واحدة مضمونة
   مطابقة لما ينتجه `npm run ingest`.
*/

export async function updateBook(
  store: Store,
  slug: string,
  changesTo: Partial<Omit<BookInput, 'slug' | 'docx'>>
): Promise<OperationResult> {
  const registry = await loadRegistry(store);
  const current = registry.find((entry) => entry.slug === slug);
  if (!current) throw new ValidationError('الكتاب غير موجود.');

  const entry: RegistryEntry = {
    ...current,
    accent: changesTo.accent ?? current.accent,
    tags: changesTo.tags ?? current.tags,
    order: changesTo.order ?? current.order,
    overrides: changesTo.overrides,
  };

  const docxBytes = await store.readBinary(`books/${current.docx}`);
  if (!docxBytes) {
    throw new ValidationError(
      `ملف Word المصدر غير موجود (books/${current.docx}) — تعذّرت إعادة البناء.`
    );
  }

  const index = await loadIndex(store);
  const existing = index.find((book) => book.slug === slug);
  const built = buildBook({
    entry,
    buffer: docxBytes,
    authorName: AUTHOR_NAME,
    // ملف التنزيل لا يتغيّر بالتعديل — نحتفظ بما هو مسجّل
    pdf: existing?.pdf ?? null,
  });

  const paths = contentPaths(slug);
  const applied = await store.apply(
    [
      registryFile(registry.map((item) => (item.slug === slug ? entry : item))),
      { path: paths.meta, content: json(built.meta) },
      { path: paths.pages, content: jsonCompact(built.pages) },
      indexFile([...index.filter((book) => book.slug !== slug), summarize(built.meta)]),
    ],
    `تعديل كتاب: ${built.meta.title}`
  );

  return { ...applied, ...stats(built) };
}

/* ---------------------------------------------------------------
   حذف كتاب
   --------------------------------------------------------------- */

export interface DeleteResult extends ApplyResult {
  slug: string;
  title: string;
}

export async function deleteBook(store: Store, slug: string): Promise<DeleteResult> {
  const registry = await loadRegistry(store);
  const entry = registry.find((item) => item.slug === slug);
  if (!entry) throw new ValidationError('الكتاب غير موجود.');

  const index = await loadIndex(store);
  const title = index.find((book) => book.slug === slug)?.title ?? entry.slug;
  const paths = contentPaths(slug);

  const changes: FileChange[] = [
    registryFile(registry.filter((item) => item.slug !== slug)),
    indexFile(index.filter((book) => book.slug !== slug)),
    { path: paths.meta, content: null },
    { path: paths.pages, content: null },
  ];

  /*
   * ملف Word هو المصدر الوحيد للنصّ. في المستودع يبقى في تاريخ Git
   * بعد حذفه، فنحذفه بلا قلق. على القرص لا شبكة أمان، فينتقل إلى
   * `books/_deleted/` — حذفٌ بضغطة واحدة لا يجوز أن يُتلف مخطوطة.
   */
  if (store.kind === 'github') {
    changes.push({ path: `books/${entry.docx}`, content: null });
  } else {
    const bytes = await store.readBinary(`books/${entry.docx}`);
    if (bytes) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      changes.push({ path: `books/_deleted/${stamp}__${entry.docx}`, content: bytes });
      changes.push({ path: `books/${entry.docx}`, content: null });
    }
  }

  // ملف التنزيل مولَّد ويُعاد بناؤه من المصدر — يُمحى في الحالتين
  if (index.find((book) => book.slug === slug)?.pdf) {
    changes.push({ path: `public/books/${slug}.pdf`, content: null });
  }

  const applied = await store.apply(changes, `حذف كتاب: ${title}`);
  return { ...applied, slug, title };
}

function stats(built: { meta: { slug: string; title: string; pageCount: number; wordCount: number; chapters: unknown[] } }) {
  return {
    slug: built.meta.slug,
    title: built.meta.title,
    pageCount: built.meta.pageCount,
    wordCount: built.meta.wordCount,
    chapterCount: built.meta.chapters.length,
  };
}
