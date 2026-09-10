/**
 * إضافة كتاب — POST /api/admin/books
 * ===============================================================
 * الملف نفسه وصل قبل هذا الطلب على مقاطع عبر `/api/admin/upload`،
 * فالجسم هنا خفيف: مراجع المقاطع وبيانات الكتاب. نجمع المقاطع،
 * نستخرج النصّ بنواة `src/lib/ingest`، ثم نسلّم النتيجة إلى المخزن
 * — يكتبها على القرص محلياً، أو يودعها في المستودع على Vercel.
 */

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAuthenticated } from '@/lib/admin/auth';
import { getStore, StoreUnavailableError } from '@/lib/admin/store';
import { addBook, loadRegistry } from '@/lib/admin/books-service';
import {
  ValidationError,
  nextOrderOf,
  parseAccent,
  parseOrder,
  parseOverrides,
  parseSlug,
  parseTags,
  safeDocxName,
  assertDocx,
  assertPdf,
} from '@/lib/admin/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/*
 * ٦٠ ثانية — أقصى ما تسمح به خطة Hobby المجانية (الافتراضي عندها
 * ١٠ ثوانٍ وحدها، وهي لا تكفي لرفع ملف وإيداعه). القيمة صالحة على
 * كل الخطط، وتجاوزها يُفشل البناء على Vercel لا وقت التشغيل.
 */
export const maxDuration = 60;

interface AddBody {
  [key: string]: unknown;
  slug?: unknown;
  docxName?: unknown;
  docxRefs?: unknown;
  pdfRefs?: unknown;
  accent?: unknown;
  tags?: unknown;
  order?: unknown;
  title?: unknown;
  subtitle?: unknown;
  description?: unknown;
}

function parseRefs(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`${label}: لم يصل الملف. أعد اختياره وحاول مجدداً.`);
  }
  if (value.some((ref) => typeof ref !== 'string' || ref.length === 0 || ref.length > 200)) {
    throw new ValidationError(`${label}: مراجع الرفع غير صالحة.`);
  }
  return value as string[];
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'غير مصرّح.' }, { status: 401 });
  }
  try {
    return NextResponse.json({ books: await loadRegistry(getStore()) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'خطأ غير متوقّع.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'غير مصرّح.' }, { status: 401 });
  }

  try {
    const store = getStore();
    const body = (await request.json()) as AddBody;

    const slug = parseSlug(body.slug);
    const docxBytes = await store.assembleChunks(parseRefs(body.docxRefs, 'ملف Word'));
    assertDocx(docxBytes);

    const pdfBytes = body.pdfRefs
      ? await store.assembleChunks(parseRefs(body.pdfRefs, 'ملف PDF'))
      : null;
    if (pdfBytes) assertPdf(pdfBytes);

    const registry = await loadRegistry(store);

    const result = await addBook(
      store,
      {
        slug,
        docx: safeDocxName(String(body.docxName ?? ''), slug),
        accent: parseAccent(body.accent),
        tags: parseTags(body.tags),
        order: parseOrder(body.order, nextOrderOf(registry)),
        overrides: parseOverrides(body),
      },
      docxBytes,
      pdfBytes
    );

    // محلياً الملفات جاهزة فوراً؛ على Vercel تُعيد إعادة النشر البناء
    if (!result.deploying) revalidatePath('/', 'layout');

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof StoreUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('[admin] فشل إضافة كتاب:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'خطأ غير متوقّع.' },
      { status: 500 }
    );
  }
}
