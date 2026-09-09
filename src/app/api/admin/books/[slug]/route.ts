/**
 * تعديل كتاب وحذفه — /api/admin/books/<slug>
 * ===============================================================
 * PATCH  : تعديل الوسوم واللون والترتيب وتجاوزات العنوان/النبذة،
 *          ثم إعادة الاستخراج (النصّ نفسه لا يتغيّر، لكن العنوان
 *          والنبذة والترتيب تُكتب في content/).
 * DELETE : إزالة الكتاب من السجلّ ومن القرص — ملف Word ومحتواه
 *          المستخرَج وملف التنزيل.
 */

import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAuthenticated } from '@/lib/admin/auth';
import {
  BOOKS_DIR,
  CONTENT_BOOKS_DIR,
  PDF_DIR,
  readRegistry,
  writeRegistry,
} from '@/lib/admin/registry';
import {
  ValidationError,
  parseAccent,
  parseOrder,
  parseOverrides,
  parseSlug,
  parseTags,
} from '@/lib/admin/validate';
import { runIngest, withPipelineLock } from '@/lib/admin/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

async function guard(): Promise<NextResponse | null> {
  if (await isAuthenticated()) return null;
  return NextResponse.json({ error: 'غير مصرّح.' }, { status: 401 });
}

export async function PATCH(request: Request, { params }: Params) {
  const denied = await guard();
  if (denied) return denied;

  try {
    const slug = parseSlug((await params).slug);
    const registry = readRegistry();
    const current = registry.find((entry) => entry.slug === slug);
    if (!current) return NextResponse.json({ error: 'الكتاب غير موجود.' }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;

    const updated = {
      ...current,
      accent: parseAccent(body.accent ?? current.accent, current.accent),
      tags: body.tags === undefined ? current.tags : parseTags(body.tags),
      order: parseOrder(body.order ?? current.order, current.order),
      overrides: parseOverrides({
        title: body.title ?? current.overrides?.title,
        subtitle: body.subtitle ?? current.overrides?.subtitle,
        description: body.description ?? current.overrides?.description,
      }),
    };

    await withPipelineLock(async () => {
      writeRegistry(registry.map((entry) => (entry.slug === slug ? updated : entry)));
      try {
        const ingest = await runIngest();
        const failure = ingest.failures.find((f) => f.slug === slug);
        if (failure) throw new ValidationError(`تعذّر إعادة الاستخراج: ${failure.error}`);
      } catch (error) {
        writeRegistry(registry);
        await runIngest().catch(() => undefined);
        throw error;
      }
    });

    revalidatePath('/', 'layout');
    return NextResponse.json({ ok: true, book: updated });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[admin] فشل تعديل كتاب:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'خطأ غير متوقّع.' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await guard();
  if (denied) return denied;

  try {
    const slug = parseSlug((await params).slug);
    const registry = readRegistry();
    const entry = registry.find((book) => book.slug === slug);
    if (!entry) return NextResponse.json({ error: 'الكتاب غير موجود.' }, { status: 404 });

    await withPipelineLock(async () => {
      writeRegistry(registry.filter((book) => book.slug !== slug));

      /*
       * ملف Word هو المصدر الوحيد للنصّ ولا نسخة أخرى منه، فلا
       * نمحوه بل ننقله إلى books/_deleted/ — حذفٌ بضغطة واحدة لا
       * يجوز أن يُتلف مخطوطة المؤلف. أمّا المولَّد (content و PDF)
       * فيُمحى لأنه يُعاد توليده من المصدر متى شئت.
       */
      const source = path.join(BOOKS_DIR, entry.docx);
      if (fs.existsSync(source)) {
        const trash = path.join(BOOKS_DIR, '_deleted');
        fs.mkdirSync(trash, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        fs.renameSync(source, path.join(trash, `${stamp}__${entry.docx}`));
      }

      fs.rmSync(path.join(CONTENT_BOOKS_DIR, slug), { recursive: true, force: true });
      fs.rmSync(path.join(PDF_DIR, `${slug}.pdf`), { force: true });

      await runIngest();
    });

    revalidatePath('/', 'layout');
    return NextResponse.json({ ok: true, slug });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[admin] فشل حذف كتاب:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'خطأ غير متوقّع.' },
      { status: 500 }
    );
  }
}
