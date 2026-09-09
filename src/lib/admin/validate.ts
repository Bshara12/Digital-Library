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
