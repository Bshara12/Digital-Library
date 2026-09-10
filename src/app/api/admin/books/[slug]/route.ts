/**
 * تعديل كتاب وحذفه — /api/admin/books/<slug>
 * ===============================================================
 * PATCH  : الوسوم واللون والترتيب وتصحيح العنوان/النبذة. يُعاد بناء
 *          الكتاب من ملف Word الأصلي لأن بعض هذه الحقول تدخل في
 *          الاستخراج نفسه.
 * DELETE : إزالة الكتاب من السجلّ ومن المحتوى المولَّد. ملف Word
 *          يبقى في تاريخ Git (وضع المستودع) أو ينتقل إلى
 *          `books/_deleted/` (الوضع المحلي).
 */

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAuthenticated } from '@/lib/admin/auth';
import { getStore, StoreUnavailableError } from '@/lib/admin/store';
import { deleteBook, loadRegistry, updateBook } from '@/lib/admin/books-service';
import {
  ValidationError,
  parseAccent,
  parseOrder,
  parseOverrides,
  parseSlug,
  parseTags,
} from '@/lib/admin/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/*
 * ٦٠ ثانية — أقصى ما تسمح به خطة Hobby المجانية (الافتراضي عندها
 * ١٠ ثوانٍ وحدها، وهي لا تكفي لرفع ملف وإيداعه). القيمة صالحة على
 * كل الخطط، وتجاوزها يُفشل البناء على Vercel لا وقت التشغيل.
 */
export const maxDuration = 60;

type Params = { params: Promise<{ slug: string }> };

async function guard(): Promise<NextResponse | null> {
  if (await isAuthenticated()) return null;
  return NextResponse.json({ error: 'غير مصرّح.' }, { status: 401 });
}

function failure(error: unknown): NextResponse {
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof StoreUnavailableError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  console.error('[admin] فشلت عملية على كتاب:', error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'خطأ غير متوقّع.' },
    { status: 500 }
  );
}

export async function PATCH(request: Request, { params }: Params) {
  const denied = await guard();
  if (denied) return denied;

  try {
    const store = getStore();
    const slug = parseSlug((await params).slug);
    const body = (await request.json()) as Record<string, unknown>;

    const registry = await loadRegistry(store);
    const current = registry.find((entry) => entry.slug === slug);
    if (!current) return NextResponse.json({ error: 'الكتاب غير موجود.' }, { status: 404 });

    const result = await updateBook(store, slug, {
      accent: parseAccent(body.accent ?? current.accent, current.accent),
      tags: body.tags === undefined ? current.tags : parseTags(body.tags),
      order: parseOrder(body.order ?? current.order, current.order),
      overrides: parseOverrides(body),
    });

    if (!result.deploying) revalidatePath('/', 'layout');
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await guard();
  if (denied) return denied;

  try {
    const store = getStore();
    const slug = parseSlug((await params).slug);
    const result = await deleteBook(store, slug);

    if (!result.deploying) revalidatePath('/', 'layout');
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failure(error);
  }
}
