/**
 * توليد ملفات التنزيل — POST /api/admin/pdf
 * ===============================================================
 * يشغّل `scripts/export-pdf.mjs` (يتخطّى الملفات المحدَّثة أصلاً)
 * ثم يعيد الاستخراج ليُسجَّل حجم كل ملف في بيانات الكتاب.
 *
 * إجراء محلّي بطبيعته: التحويل يحتاج Microsoft Word (ويندوز) أو
 * LibreOffice مثبّتاً على الجهاز. في وضع المستودع (Vercel) لا سبيل
 * إلى ذلك، فالبديل رفع ملف PDF جاهز مع الكتاب من نموذج الإضافة.
 */

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAuthenticated } from '@/lib/admin/auth';
import { getStore, StoreUnavailableError } from '@/lib/admin/store';
import { loadIndex } from '@/lib/admin/books-service';
import { runPdfExport, withPipelineLock } from '@/lib/admin/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** تحويل مكتبة كاملة عبر Word قد يطول */
export const maxDuration = 600;

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'غير مصرّح.' }, { status: 401 });
  }

  try {
    const store = getStore();
    if (!store.canGeneratePdf) {
      return NextResponse.json(
        {
          error:
            'توليد PDF يحتاج Word أو LibreOffice على الجهاز، وهو غير متاح في وضع النشر على ' +
            'Vercel. ارفع ملف PDF جاهزاً مع الكتاب، أو ولّد الملفات محلياً بـ `npm run pdf` وارفعها.',
        },
        { status: 409 }
      );
    }

    const result = await withPipelineLock(runPdfExport);
    revalidatePath('/', 'layout');

    const index = await loadIndex(store);
    return NextResponse.json({
      ok: result.ok,
      message: result.message,
      withPdf: index.filter((book) => book.pdf).length,
      total: index.length,
    });
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('[admin] فشل توليد PDF:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'خطأ غير متوقّع.' },
      { status: 500 }
    );
  }
}
