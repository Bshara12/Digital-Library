import { redirect } from 'next/navigation';
import { isAuthenticated, isUsingDefaultPassword } from '@/lib/admin/auth';
import { readRegistry } from '@/lib/admin/registry';
import { getAllBooks } from '@/lib/books';
import { AdminDashboard, type AdminBook } from '@/components/admin/AdminDashboard';

export const dynamic = 'force-dynamic';

/**
 * تُدمج مدخلة السجلّ (ما يُحرَّر) مع الملخّص المستخرَج (ما يُعرض).
 * غياب الملخّص يعني أن الاستخراج فشل لهذا الكتاب — نُظهره في اللوحة
 * محدَّداً بعلامة بدل أن نخفيه، وإلا صار كتاباً شبحاً في السجلّ.
 */
function mergeBooks(): AdminBook[] {
  const summaries = new Map(getAllBooks().map((book) => [book.slug, book]));

  return readRegistry().map((entry) => {
    const summary = summaries.get(entry.slug);
    return {
      slug: entry.slug,
      docx: entry.docx,
      accent: entry.accent,
      tags: entry.tags,
      order: entry.order,
      overrides: entry.overrides ?? {},
      title: summary?.title ?? entry.overrides?.title ?? entry.docx.replace(/\.docx$/i, ''),
      subtitle: summary?.subtitle ?? null,
      pageCount: summary?.pageCount ?? 0,
      wordCount: summary?.wordCount ?? 0,
      chapterCount: summary?.chapterCount ?? 0,
      pdfBytes: summary?.pdf?.bytes ?? null,
      extracted: summary !== undefined,
    };
  });
}

export default async function AdminPage() {
  if (!(await isAuthenticated())) redirect('/admin/login');

  return (
    <AdminDashboard books={mergeBooks()} usingDefaultPassword={isUsingDefaultPassword()} />
  );
}
