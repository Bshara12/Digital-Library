/**
 * إضافة كتاب — POST /api/admin/books
 * ===============================================================
 * الخطوات بالترتيب، وكلّها قابلة للتراجع إن فشلت أي واحدة:
 *   1. تحقّق من المدخلات والملف
 *   2. حفظ ملف Word في books/
 *   3. تسجيل المدخلة في data/books.registry.json
 *   4. تشغيل scripts/ingest.mjs (نفس السكربت اليدوي)
 *   5. إن فشل استخراج هذا الكتاب تحديداً ⇒ تراجع كامل
 *   6. تفريغ ذاكرة الصفحات المولّدة ليظهر الكتاب فوراً
 */

import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAuthenticated } from '@/lib/admin/auth';
import {
  BOOKS_DIR,
  RegistryEntry,
  nextOrder,
  readRegistry,
  writeRegistry,
} from '@/lib/admin/registry';
import {
  ValidationError,
  assertUniqueSlug,
  parseAccent,
  parseOrder,
  parseOverrides,
  parseSlug,
  parseTags,
  safeDocxName,
} from '@/lib/admin/validate';
import { runIngest, withPipelineLock } from '@/lib/admin/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** حدّ حجم ملف Word — أكبر كتاب في المكتبة أقلّ من ٥ م.ب */
const MAX_DOCX_BYTES = 40 * 1024 * 1024;
/** بصمة ZIP — ملف .docx هو أرشيف ZIP في حقيقته */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'غير مصرّح.' }, { status: 401 });
  }
  return NextResponse.json({ books: readRegistry() });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'غير مصرّح.' }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get('docx');

    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError('ارفع ملف Word (.docx) الخاصّ بالكتاب.');
    }
    if (!/\.docx$/i.test(file.name)) {
      throw new ValidationError('الصيغة المدعومة هي .docx فقط — لا .doc ولا .pdf.');
    }
    if (file.size > MAX_DOCX_BYTES) {
      throw new ValidationError('الملف أكبر من ٤٠ م.ب.');
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!ZIP_MAGIC.every((byte, i) => bytes[i] === byte)) {
      throw new ValidationError('الملف ليس مستند Word صالحاً (.docx).');
    }

    const registry = readRegistry();
    const slug = parseSlug(form.get('slug'));
    assertUniqueSlug(registry, slug);

    const entry: RegistryEntry = {
      docx: safeDocxName(file.name, slug),
      slug,
      accent: parseAccent(form.get('accent')),
      tags: parseTags(form.get('tags')),
      order: parseOrder(form.get('order'), nextOrder(registry)),
      overrides: parseOverrides({
        title: form.get('title'),
        subtitle: form.get('subtitle'),
        description: form.get('description'),
      }),
    };

    if (registry.some((b) => b.docx === entry.docx)) {
      throw new ValidationError(
        `يوجد كتاب آخر بملف باسم «${entry.docx}». غيّر اسم الملف قبل الرفع.`
      );
    }

    const result = await withPipelineLock(async () => {
      const target = path.join(BOOKS_DIR, entry.docx);
      fs.mkdirSync(BOOKS_DIR, { recursive: true });
      fs.writeFileSync(target, bytes);

      try {
        writeRegistry([...registry, entry]);
        const ingest = await runIngest();
        const failure = ingest.failures.find((f) => f.slug === slug);
        if (failure) throw new ValidationError(`تعذّر استخراج نصّ الكتاب: ${failure.error}`);
        return ingest;
      } catch (error) {
        // تراجع: لا نترك ملفاً يتيماً ولا مدخلة معطوبة في السجلّ
        writeRegistry(registry);
        fs.rmSync(target, { force: true });
        await runIngest().catch(() => undefined);
        throw error;
      }
    });

    revalidatePath('/', 'layout');

    const book = result.books.find((b) => b.slug === slug);
    return NextResponse.json({ ok: true, slug, book }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[admin] فشل إضافة كتاب:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'خطأ غير متوقّع.' },
      { status: 500 }
    );
  }
}
