/**
 * زرّ تنزيل الكتاب بصيغة PDF
 * ---------------------------------------------------------------
 * الملف مولَّد من ملف Word نفسه الذي بُني منه نصّ الموقع
 * (`npm run pdf`)، فما ينزّله الزائر يطابق ما يقرأه هنا — بتنسيق
 * المؤلف وصوره.
 *
 * زرّ ثانوي بحدود ذهبية لا سطح ذهبي: القراءة داخل الموقع هي
 * الفعل الأول، والتنزيل يليه.
 */

interface Props {
  pdf: { path: string; bytes: number } | null;
  title: string;
  /** مضغوط: للاستعمال داخل لوح القارئ */
  compact?: boolean;
}

/** حجم بالميغابايت بأرقام لاتينية — أوضح للقراءة داخل نصّ عربي */
function formatSize(bytes: number) {
  const mb = bytes / 1048576;
  return `${mb < 1 ? mb.toFixed(1) : Math.round(mb * 10) / 10} م.ب`;
}

export function DownloadBook({ pdf, title, compact = false }: Props) {
  if (!pdf) return null;

  const label = `تنزيل «${title}» بصيغة PDF — ${formatSize(pdf.bytes)}`;

  return (
    <a
      href={pdf.path}
      download={`${title}.pdf`}
      aria-label={label}
      title={label}
      className={
        compact
          ? 'flex items-center justify-center gap-2 rounded-sm border border-ink-700 px-4 py-2.5 font-body text-xs text-ivory-dim transition-colors hover:border-gold-700 hover:text-gold-300'
          : 'group flex items-center gap-2.5 rounded-sm border border-gold-500/45 px-7 py-3.5 font-body text-sm text-gold-300 transition-colors duration-200 hover:border-gold-500 hover:bg-gold-500/8'
      }
    >
      <ArrowDownIcon />
      <span>تنزيل PDF</span>
      <span className={compact ? 'font-latin text-[0.7rem] opacity-60' : 'font-latin text-xs opacity-70'}>
        {formatSize(pdf.bytes)}
      </span>
    </a>
  );
}

/** سهم نازل إلى خطّ — أوضح رمز للتنزيل، مرسوم بخطّ رفيع يناسب الطراز */
function ArrowDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[1.05em] w-[1.05em] flex-none transition-transform duration-200 group-hover:translate-y-[2px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3.5v11.5" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </svg>
  );
}
