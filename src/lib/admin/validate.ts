/**
 * التحقّق من مدخلات لوحة الإدارة
 * ===============================================================
 * اللوحة تكتب ملفات على القرص وتشغّل سكربتات، فكل قيمة قادمة من
 * المتصفّح تُقيَّد هنا قبل أن تلمس نظام الملفات. أهمّها الـ slug:
 * يدخل في مسارات (`content/books/<slug>`) وفي أسماء ملفات
 * (`public/books/<slug>.pdf`)، فيُحصر في الحروف اللاتينية الصغيرة
 * والأرقام والشرطة — لا نقاط ولا فواصل مسار ولا محارف خاصّة.
 */

import { RegistryEntry, RegistryOverrides } from './registry';

export class ValidationError extends Error {}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** أسماء محجوزة على ويندوز — ملفّ باسمها يفشل بصمت */
const RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

export function parseSlug(value: unknown): string {
  const slug = String(value ?? '').trim().toLowerCase();
  if (!slug) throw new ValidationError('المعرّف (slug) مطلوب.');
  if (slug.length > 60) throw new ValidationError('المعرّف طويل جداً (٦٠ محرفاً كحدّ أقصى).');
  if (!SLUG_PATTERN.test(slug)) {
    throw new ValidationError(
      'المعرّف يقبل الحروف اللاتينية الصغيرة والأرقام والشرطة فقط — مثال: my-new-book'
    );
  }
  if (RESERVED.has(slug)) throw new ValidationError('هذا المعرّف محجوز في نظام الملفات.');
  return slug;
}

export function parseAccent(value: unknown, fallback = '#2A2340'): string {
  const accent = String(value ?? '').trim();
  if (!accent) return fallback;
  if (!HEX_COLOR.test(accent)) throw new ValidationError('اللون يجب أن يكون بصيغة #RRGGBB.');
  return accent.toUpperCase();
}

export function parseTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[,،]/);
  const tags = raw.map((tag) => String(tag).trim().replace(/\s+/g, ' ')).filter(Boolean);
  const unique = [...new Set(tags)];
  if (unique.length > 6) throw new ValidationError('٦ وسوم كحدّ أقصى للكتاب الواحد.');
  if (unique.some((tag) => tag.length > 30)) throw new ValidationError('وسم طويل جداً.');
  return unique;
}

export function parseOrder(value: unknown, fallback: number): number {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const order = Number(raw);
  if (!Number.isInteger(order) || order < 1 || order > 999) {
    throw new ValidationError('الترتيب يجب أن يكون عدداً صحيحاً بين ١ و ٩٩٩.');
  }
  return order;
}

/** نصّ اختياري: فارغ ⇒ لا تجاوز (يُترك للاستخراج الآلي) */
function optionalText(value: unknown, max: number, label: string): string | undefined {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  if (text.length > max) throw new ValidationError(`${label} طويل جداً (${max} محرفاً كحدّ أقصى).`);
  return text;
}

export function parseOverrides(input: {
  title?: unknown;
  subtitle?: unknown;
  description?: unknown;
  [key: string]: unknown;
}): RegistryOverrides | undefined {
  const overrides: RegistryOverrides = {};

  const title = optionalText(input.title, 160, 'العنوان');
  if (title) overrides.title = title;

  const subtitle = optionalText(input.subtitle, 300, 'العنوان الفرعي');
  if (subtitle) overrides.subtitle = subtitle;

  const description = optionalText(input.description, 1200, 'النبذة');
  if (description) overrides.description = description;

  return Object.keys(overrides).length ? overrides : undefined;
}

/**
 * اسم ملف Word المحفوظ في books/
 * ---------------------------------------------------------------
 * نحتفظ بالاسم الأصلي (بالعربية غالباً) لأنه يظهر في تقرير المراجعة
 * ويربط الكتاب بمصدره، لكن نجرّده من أي فاصل مسار ونحدّ طوله.
 */
export function safeDocxName(originalName: string, slug: string): string {
  const base = originalName.split(/[\/]/).pop() ?? '';
  const cleaned = base
    .replace(/\.docx$/i, '')
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return `${cleaned || slug}.docx`;
}

export function assertUniqueSlug(entries: RegistryEntry[], slug: string, ignore?: string): void {
  if (entries.some((entry) => entry.slug === slug && entry.slug !== ignore)) {
    throw new ValidationError(`المعرّف «${slug}» مستعمل من كتاب آخر.`);
  }
}

/** أوّل رقم ترتيب غير مستعمل — القيمة الافتراضية لكتاب جديد */
export function nextOrderOf(entries: RegistryEntry[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.order), 0) + 1;
}

/* ---------------------------------------------------------------
   التحقّق من الملفات المرفوعة
   ---------------------------------------------------------------
   الامتداد وحده لا يكفي: نتحقّق من البصمة في أوّل بايتات الملف.
   ملف .docx أرشيف ZIP، وملف PDF يبدأ بـ %PDF. رفع ملف مزيّف لا
   يخترق شيئاً هنا (لا ننفّذه) لكنه ينتج كتاباً فارغاً ورسالة خطأ
   غامضة، والرسالة الصريحة أنفع.
*/

/** أكبر كتاب في المكتبة ٤.٨ م.ب — الحدّ فسحة معقولة فوقه */
export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

export function assertDocx(bytes: Buffer): void {
  if (bytes.length === 0) throw new ValidationError('ملف Word فارغ.');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new ValidationError('ملف Word أكبر من ٤٠ م.ب.');
  // بصمة ZIP: PK
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) {
    throw new ValidationError('الملف ليس مستند Word صالحاً (.docx) — لا .doc ولا .pdf.');
  }
}

export function assertPdf(bytes: Buffer): void {
  if (bytes.length === 0) throw new ValidationError('ملف PDF فارغ.');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new ValidationError('ملف PDF أكبر من ٤٠ م.ب.');
  if (bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
    throw new ValidationError('الملف ليس PDF صالحاً.');
  }
}
