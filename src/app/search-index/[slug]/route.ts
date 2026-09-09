import { getBookMeta, getBookPages, getBookSlugs } from '@/lib/books';
import type { BookIndex, IndexBlock } from '@/lib/search';

/**
 * فهرس البحث لكل كتاب
 * ---------------------------------------------------------------
 * الموقع ثابت بالكامل ولا خادم بحث خلفه، فالفهرس ملفّ JSON يُولَّد
 * وقت البناء ويُنزَّل في المتصفّح عند أوّل بحث فقط — لا يُحمَّل مع
 * أي صفحة أخرى.
 *
 * الكتل مصفوفات لا كائنات: `[صفحة، نوع، نصّ]`. حذف أسماء الحقول
 * وحده يوفّر قرابة ثلث حجم الفهرس، وهو نصّ عربي يُضغط جيداً على الشبكة.
 */

export const dynamic = 'force-static';
/*
 * الكتب المعروفة وقت البناء تُولَّد مسبقاً، وما يُضاف بعده من لوحة
 * الإدارة يُولَّد عند أوّل طلب ثم يُخزَّن — لولا ذلك لظهر الكتاب في
 * المكتبة وغاب عن البحث حتى إعادة البناء.
 */
export const dynamicParams = true;

export function generateStaticParams() {
  return getBookSlugs().map((slug) => ({ slug }));
}

const KIND: Record<string, IndexBlock[1]> = { p: 0, h: 1, s: 2 };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // مع `dynamicParams` مفتوحاً يصل إلينا أي slug — والمحذوف منها يجب
  // أن يُردّ بـ 404 لا أن يرمي عند قراءة ملف غير موجود
  if (!getBookSlugs().includes(slug)) return new Response('Not found', { status: 404 });

  const meta = getBookMeta(slug);

  const blocks: IndexBlock[] = [];
  for (const page of getBookPages(slug)) {
    for (const block of page.blocks) {
      const text = block.x.trim();
      if (text.length > 1) blocks.push([page.n, KIND[block.t] ?? 0, text]);
    }
  }

  const payload: BookIndex = {
    slug,
    title: meta.title,
    subtitle: meta.subtitle,
    accent: meta.accent,
    author: meta.author,
    order: meta.order,
    pageCount: meta.pageCount,
    blocks,
  };

  return Response.json(payload);
}
