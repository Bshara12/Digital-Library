/**
 * رفع مقطع من ملف — POST /api/admin/upload
 * ===============================================================
 * Vercel تحدّ جسم الطلب الواحد بـ ٤.٥ م.ب، وبعض ملفات Word أكبر
 * (أكبر كتاب في المكتبة ٤.٧٩ م.ب). فالمتصفّح يقسّم الملف ويرسل كل
 * مقطع في طلب مستقلّ، وهذا المسار يحفظه ويُعيد مرجعاً إليه.
 *
 * الخادم لا يحتفظ بحالة الرفع: المتصفّح هو من يجمع المراجع ويرسلها
 * كلها عند الحفظ. ضروري على Vercel لأن كل طلب قد يصل نسخة مختلفة
 * من الدالة، فلا ذاكرة مشتركة بينها.
 */

import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/admin/auth';
import { getStore, StoreUnavailableError } from '@/lib/admin/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** أكبر من هذا يرفضه Vercel قبل أن يصل إلينا — المتصفّح يقسّم دونه */
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'غير مصرّح.' }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const chunk = form.get('chunk');

    if (!(chunk instanceof Blob) || chunk.size === 0) {
      return NextResponse.json({ error: 'مقطع فارغ.' }, { status: 400 });
    }
    if (chunk.size > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: 'المقطع أكبر من الحدّ المسموح.' }, { status: 413 });
    }

    const store = getStore();
    const ref = await store.stageChunk(Buffer.from(await chunk.arrayBuffer()));
    return NextResponse.json({ ref });
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('[admin] فشل رفع مقطع:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'خطأ غير متوقّع.' },
      { status: 500 }
    );
  }
}
