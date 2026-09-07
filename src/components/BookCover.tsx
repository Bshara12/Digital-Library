import { CoverOrnament } from './CoverOrnament';

/**
 * الغلاف لا يحتاج بيانات الكتاب كاملة — هذه الحقول فقط. تضييق النوع
 * يجعله يقبل `BookSummary` و`BookMeta` معاً بلا تحويل.
 */
export interface CoverData {
  title: string;
  subtitle: string | null;
  author: string;
  accent: string;
  order: number;
}

/**
 * غلاف الكتاب
 * ---------------------------------------------------------------
 * الكتب لا تحمل أغلفة مصمّمة في ملفاتها الأصلية، فنولّدها تايبوغرافياً
 * بطراز واحد يعطي إحساس «سلسلة أعمال لمؤلف واحد» — وهو أفخم من أغلفة
 * متفرّقة غير متناسقة.
 *
 * لماذا DOM لا صورة؟
 *   • حادّ في أي مقاس وعلى أي كثافة شاشة
 *   • صفر بايت من الأصول (لا تحميل، لا تخطيط متأخّر)
 *   • يدخل في مشهد ثلاثي الأبعاد حقيقي بدل أن يكون سطحاً مسطّحاً
 *   • تعديل عنوان = إعادة بناء، بلا إعادة تصدير صور
 *
 * كل المقاسات بوحدة `cqw` (نسبة من عرض الغلاف) فيتناسب كل شيء تلقائياً
 * مهما كان حجم البطاقة — من مصغّرة في الرفّ إلى ملء الشاشة.
 */

interface Props {
  book: CoverData;
  /** يظهر عند العرض الكبير فقط — يُثقل المصغّرات بلا داعٍ */
  showSubtitle?: boolean;
  className?: string;
}

export function BookCover({ book, showSubtitle = false, className = '' }: Props) {
  return (
    <div
      className={`relative aspect-[2/3] w-full overflow-hidden rounded-[2px] ${className}`}
      style={{
        containerType: 'inline-size',
        backgroundColor: book.accent,
        // عمق: إضاءة من أعلى اليمين + قتامة نحو الكعب
        backgroundImage: `
          radial-gradient(120% 90% at 78% 8%, rgba(255,255,255,0.10) 0%, transparent 55%),
          linear-gradient(255deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)
        `,
      }}
    >
      {/* نسيج ورقي خافت يمنع الإحساس بسطح بلاستيكي مسطّح */}
      <div className="grain absolute inset-0" />

      {/* إطار ذهبي مزدوج */}
      <div
        className="absolute inset-[4.5cqw] border border-gold-500/45"
        style={{ borderWidth: '0.35cqw' }}
      />
      <div className="absolute inset-[6.5cqw] border border-gold-500/20" />

      <div className="relative flex h-full flex-col items-center justify-between px-[10cqw] py-[11cqw] text-center">
        {/* الزخرفة العلوية — نخيلة عربية */}
        <CoverOrnament
          variant={book.order}
          className="w-[50cqw] text-gold-500/60"
        />

        {/* العنوان */}
        <div className="flex flex-col items-center gap-[3cqw]">
          <h3
            className="font-display leading-[1.35] text-gold-300"
            style={{
              fontSize: 'clamp(0.7rem, 9.5cqw, 4rem)',
              textShadow: '0 0.4cqw 1.2cqw rgba(0,0,0,0.55)',
              textWrap: 'balance',
            }}
          >
            {book.title}
          </h3>

          {showSubtitle && book.subtitle && (
            <p
              className="font-body leading-relaxed text-ivory/70"
              style={{ fontSize: 'clamp(0.5rem, 3.6cqw, 1.05rem)', textWrap: 'balance' }}
            >
              {book.subtitle}
            </p>
          )}
        </div>

        {/* اسم المؤلف */}
        <div className="flex w-full flex-col items-center gap-[3.5cqw]">
          <div
            className="w-[38cqw] rule-gold opacity-70"
            style={{ height: '0.25cqw' }}
          />
          <p
            className="font-body text-ivory/85"
            style={{ fontSize: 'clamp(0.45rem, 4.2cqw, 1.1rem)', letterSpacing: '0.08em' }}
          >
            {book.author}
          </p>
        </div>
      </div>

      {/* لمعة زجاجية قطرية ثابتة — توحي بسطح مصقول */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(118deg, transparent 42%, rgba(255,255,255,0.055) 50%, transparent 58%)',
        }}
      />
    </div>
  );
}
