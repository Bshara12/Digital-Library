/**
 * توليد ملفات التنزيل — POST /api/admin/pdf
 * ===============================================================
 * يشغّل `scripts/export-pdf.mjs` (يتخطّى الملفات المحدَّثة أصلاً)
 * ثم يعيد الاستخراج ليُسجَّل حجم كل ملف في بيانات الكتاب — وهي
 * نفس الخطوتين الموصوفتين في README.
 *
 * يحتاج Microsoft Word على ويندوز أو LibreOffice على غيره. إن غاب
 * المحوّل نُبلّغ بذلك ولا نُفشل شيئاً آخر: الكتب تبقى مقروءة على
 * الموقع، وزرّ التنزيل وحده هو الذي لا يظهر.
 */

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAuthenticated } from '@/lib/admin/auth';
import { runIngest, runPdfExport, withPipelineLock } from '@/lib/admin/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** تحويل مكتبة كاملة عبر Word قد يطول */
export const maxDuration = 600;

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'غير مصرّح.' }, { status: 401 });
  }

  try {
    const result = await withPipelineLock(async () => {
      const pdf = await runPdfExport();
      const ingest = await runIngest();
      return { pdf, ingest };
    });

    revalidatePath('/', 'layout');

    return NextResponse.json({
      ok: result.pdf.ok,
      message: result.pdf.message,
      withPdf: result.ingest.books.filter((b) => b.hasPdf).length,
      total: result.ingest.books.length,
    });
  } catch (error) {
    console.error('[admin] فشل توليد PDF:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'خطأ غير متوقّع.' },
      { status: 500 }
    );
  }
}
