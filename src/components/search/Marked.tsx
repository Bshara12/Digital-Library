import type { TextPart } from '@/lib/search';

/**
 * عرض نصّ مع تظليل مواضع البحث.
 *
 * `ui` — على خلفية الموقع الداكنة: لمعة ذهبية خفيفة.
 * `reader` — داخل صفحة الكتاب: تظليل شفّاف يحتفظ بلون النصّ نفسه،
 * فالسمة قد تكون نهارية أو سيبيا ولا يصحّ أن يُقحم لون غريب في المتن.
 */
export function Marked({ parts, tone = 'ui' }: { parts: TextPart[]; tone?: 'ui' | 'reader' }) {
  const markClass =
    tone === 'reader'
      ? 'rounded-[2px] bg-[rgba(201,162,39,0.34)] px-[0.1em] text-inherit [box-decoration-break:clone]'
      : 'rounded-[2px] bg-gold-500/22 px-[0.12em] text-gold-300 [box-decoration-break:clone]';

  return (
    <>
      {parts.map((part, i) =>
        part.hit ? (
          <mark key={i} className={markClass}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}
