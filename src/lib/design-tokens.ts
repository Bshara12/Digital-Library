/**
 * نظام التصميم — «حبر وذهب»
 * ---------------------------------------------------------------
 * هذا الملف هو المصدر الوحيد للحقيقة بخصوص الألوان والمقاسات.
 * القيم نفسها تُصدَّر كمتغيرات CSS في globals.css — لا تكرّر قيمة
 * لونية في أي مكان آخر من المشروع.
 */

export const palette = {
  // الخلفيات الداكنة (الحبر)
  ink950: '#0A0A0C', // خلفية الموقع العميقة
  ink900: '#111014', // خلفية الأقسام
  ink800: '#1A1820', // أسطح البطاقات
  ink700: '#26232D', // الحدود والفواصل
  ink600: '#3A3644', // حدود بارزة

  // الذهب — يُستخدم كتدرّج دائماً، لا كتعبئة صلبة
  gold300: '#EBD9A5', // لمعة عالية
  gold500: '#C9A227', // اللون الأساسي
  gold700: '#8A6D1F', // ظل الذهب

  // نحاسي — لون ثانوي للوسوم والتمييز
  copper: '#B87333',

  // النصوص
  ivory: '#EDE7DA', // نص المتن على خلفية داكنة
  ivoryDim: '#9A9287', // نص ثانوي

  // أسطح القراءة النهارية
  parchment: '#F5EFE2',
  sepia: '#EFE3CC',
  inkOnLight: '#211E18', // نص على خلفية فاتحة
} as const;

/** تدرّجات الذهب — الذهب الصلب يبدو رخيصاً، المتدرّج يبدو معدناً */
export const gradients = {
  goldSurface: `linear-gradient(135deg, ${palette.gold300} 0%, ${palette.gold500} 45%, ${palette.gold700} 100%)`,
  goldLine: `linear-gradient(90deg, transparent 0%, ${palette.gold500} 50%, transparent 100%)`,
  goldText: `linear-gradient(135deg, ${palette.gold300} 0%, ${palette.gold500} 50%, ${palette.gold700} 100%)`,
} as const;

/** منحنيات الحركة ومددها — تُستعمل عبر lib/motion.ts */
export const easing = {
  /** المنحنى الافتراضي: بداية سريعة، نهاية تتلاشى بنعومة */
  luxe: [0.16, 1, 0.3, 1],
  /** تقليب صفحات الكتاب */
  page: [0.65, 0, 0.35, 1],
  /** دخول وخروج متماثل */
  smooth: [0.4, 0, 0.2, 1],
} as const;

export const duration = {
  fast: 0.2, // hover، أزرار
  medium: 0.6, // ظهور العناصر عند التمرير
  slow: 0.9, // انتقالات الصفحات
  splash: 1.2, // شاشة الافتتاح
} as const;

/** أعماق المنظور ثلاثي الأبعاد */
export const depth = {
  scenePerspective: 1600, // px — منظور مشهد الرفّ
  cardPerspective: 900, // px — منظور البطاقة المفردة
  bookSpine: 22, // px — سماكة كعب الكتاب
  maxTiltDeg: 12, // أقصى ميلان للبطاقة مع الماوس
  hoverLiftZ: 40, // px — ارتفاع الكتاب عند التحويم
} as const;

/** إعدادات القراءة المتاحة للزائر */
export const readingScales = {
  fontSize: [17, 19, 21, 24, 28], // px
  lineHeight: [1.8, 2.0, 2.2, 2.5],
  measure: [58, 65, 72, 80], // عدد الأحرف في السطر
} as const;

export type ReadingTheme = 'night' | 'day' | 'sepia';
export type ReadingMode = 'book' | 'text';
