/**
 * أدوات معالجة النص العربي
 * ---------------------------------------------------------------
 * تُستعمل في مكانين: سكربت الاستخراج (scripts/ingest.mjs) ومحرك
 * البحث في المتصفح. لذلك يجب أن تبقى خالية من أي اعتماد على DOM.
 */

/** محارف التحكّم في الاتجاه التي يحقنها مولّد الـ PDF داخل النص */
const BIDI_CONTROLS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]/g;

/** التشكيل والتطويل */
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;

/** أرقام عربية-هندية → لاتينية، ليعمل البحث الرقمي في الحالتين */
const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** محارف تُحذف كلّياً عند التطبيع (لا تقابلها أي محارف في الناتج) */
const DROPPED = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/;

/** محرف واحد ← محرف واحد. الطيّ ١:١ شرطٌ لبقاء خريطة المواضع صحيحة */
const FOLD: Record<string, string> = {
  '\u0622': '\u0627', // آ
  '\u0623': '\u0627', // أ
  '\u0625': '\u0627', // إ
  '\u0671': '\u0627', // ٱ
  '\u0649': '\u064A', // ى
  '\u0629': '\u0647', // ة
  '\u0624': '\u0621', // ؤ
  '\u0626': '\u0621', // ئ
};

/** حرف أو رقم — ما عداه فاصل */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/** إزالة محارف اتجاه النص مع الحفاظ على المحتوى كما هو */
export function stripBidi(text: string): string {
  return text.replace(BIDI_CONTROLS, '');
}

/** تحويل الأرقام العربية-الهندية إلى لاتينية */
export function normalizeDigits(text: string): string {
  return text.replace(ARABIC_INDIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/** نصّ مطبَّع مع خريطة تُرجع كل محرف فيه إلى موضعه في النصّ الأصلي */
export interface NormalizedText {
  norm: string;
  /** map[i] = موضع norm[i] في النصّ الأصلي */
  map: number[];
}

/**
 * التطبيع مع تتبّع المواضع.
 * هو نفسه `normalizeForSearch` — لكنه يحتفظ بخريطة تسمح بتظليل
 * المطابقة داخل النصّ الأصلي (بتشكيله وترقيمه كما كتبه المؤلف).
 */
export function normalizeWithMap(text: string): NormalizedText {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < text.length; i++) {
    const raw = text[i];
    if (DROPPED.test(raw)) continue;

    let ch = FOLD[raw] ?? raw;

    if (!WORD_CHAR.test(ch)) {
      // أي فاصل (مسافة، ترقيم، رمز) يصير مسافة واحدة — ولا مسافة في المطلع
      pendingSpace = out.length > 0;
      continue;
    }

    const code = ch.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) ch = String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) ch = String(code - 0x06f0);
    else ch = ch.toLowerCase();

    if (pendingSpace) {
      out.push(' ');
      map.push(i);
      pendingSpace = false;
    }

    // toLowerCase قد يعطي أكثر من محرف في لغات أخرى — نُبقي الخريطة سليمة
    for (const c of ch) {
      out.push(c);
      map.push(i);
    }
  }

  return { norm: out.join(''), map };
}

/**
 * تطبيع للبحث فقط — لا يُستخدم أبداً للنص المعروض.
 * يوحّد ما يخلط بين كتابته القرّاء: أ/إ/آ/ا، ى/ي، ة/ه، ؤ/ئ/ء، والأرقام.
 */
export function normalizeForSearch(text: string): string {
  return normalizeWithMap(text).norm;
}

/** مدى مطابقة داخل النصّ الأصلي */
export interface MatchRange {
  start: number;
  end: number;
}

/**
 * مواضع عبارة مطبَّعة داخل نصّ أصلي.
 * `needle` يجب أن يكون ناتج `normalizeForSearch` مسبقاً.
 */
export function findMatches(text: string, needle: string, limit = 40): MatchRange[] {
  if (!needle) return [];
  const { norm, map } = normalizeWithMap(text);
  const ranges: MatchRange[] = [];

  let from = 0;
  while (ranges.length < limit) {
    const at = norm.indexOf(needle, from);
    if (at === -1) break;
    ranges.push({ start: map[at], end: map[at + needle.length - 1] + 1 });
    from = at + needle.length;
  }
  return ranges;
}

/** تقسيم إلى كلمات قابلة للفهرسة */
export function tokenize(text: string): string[] {
  return normalizeForSearch(text).split(' ').filter((w) => w.length > 1);
}

/** عدّ الكلمات في نص عربي */
export function countWords(text: string): number {
  return stripBidi(text).trim().split(/\s+/).filter(Boolean).length;
}

/**
 * وقت القراءة التقديري بالدقائق.
 * المتوسط للقراءة العربية المتأنّية ~180 كلمة/دقيقة، وهذه كتب
 * بحثية كثيفة فنستعمل 165 لتقدير أقرب للواقع.
 */
export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 165));
}

/** توليد معرّف نصي آمن للروابط من عنوان عربي */
export function slugify(title: string): string {
  return stripBidi(title)
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
