/**
 * شكل مدخلة الكتاب في السجلّ
 * ===============================================================
 * `data/books.registry.json` هو مصدر الحقيقة لأي كتاب في المكتبة:
 * منه تقرأ `scripts/books.config.mjs` وعليه تعتمد كل السكربتات.
 *
 * قراءته وكتابته ليستا هنا بل في `store.ts` — لأن مكانه يختلف
 * باختلاف بيئة التشغيل: القرص محلياً، ومستودع GitHub على Vercel
 * حيث لا نظام ملفات قابلاً للكتابة. هذا الملف للأنواع وحدها.
 */

export interface RegistryOverrides {
  title?: string;
  subtitle?: string | null;
  description?: string;
}

export interface RegistryEntry {
  /** اسم ملف Word في مجلد books/ — مصدر النصّ */
  docx: string;
  /** المعرّف في الرابط، ويدخل في مسارات المحتوى وأسماء ملفات التنزيل */
  slug: string;
  /** لون الغلاف المميّز — يُمزج مع الذهب */
  accent: string;
  tags: string[];
  order: number;
  /** تصحيح ما يخطئ فيه غلاف الملف — يُترك محذوفاً للاستخراج الآلي */
  overrides?: RegistryOverrides;
}
