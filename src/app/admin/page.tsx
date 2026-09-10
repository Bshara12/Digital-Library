import { redirect } from 'next/navigation';
import { isAuthenticated, isUsingDefaultPassword } from '@/lib/admin/auth';
import { getStore, StoreUnavailableError } from '@/lib/admin/store';
import { loadIndex, loadRegistry } from '@/lib/admin/books-service';
import { AdminDashboard, type AdminBook } from '@/components/admin/AdminDashboard';
import { SetupNotice } from '@/components/admin/SetupNotice';

export const dynamic = 'force-dynamic';

/**
 * تُدمج مدخلة السجلّ (ما يُحرَّر) مع الملخّص المستخرَج (ما يُعرض).
 * غياب الملخّص يعني أن استخراج هذا الكتاب لم يكتمل — نُظهره محدَّداً
 * بعلامة بدل أن نخفيه، وإلا صار كتاباً شبحاً في السجلّ.
 *
 * المصدر هو المخزن لا القرص: على Vercel قد تكون النسخة المنشورة أقدم
 * من آخر حفظ (إعادة النشر تستغرق دقيقة)، وقراءة المستودع تُظهر
 * الحقيقة الراهنة.
 */
async function mergeBooks(): Promise<AdminBook[]> {
  const store = getStore();
  const [registry, index] = await Promise.all([loadRegistry(store), loadIndex(store)]);
  const summaries = new Map(index.map((book) => [book.slug, book]));

  return registry.map((entry) => {
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

  let books: AdminBook[];
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore();
    books = await mergeBooks();
  } catch (error) {
    // إعداد ناقص أو مستودع غير قابل للقراءة — نشرح ما ينقص بدل صفحة خطأ
    return (
      <SetupNotice
        message={
          error instanceof StoreUnavailableError || error instanceof Error
            ? error.message
            : 'تعذّر قراءة بيانات المكتبة.'
        }
        onVercel={Boolean(process.env.VERCEL)}
      />
    );
  }

  return (
    <AdminDashboard
      books={books}
      usingDefaultPassword={isUsingDefaultPassword()}
      storage={store.kind}
      canGeneratePdf={store.canGeneratePdf}
    />
  );
}
