'use client';

/**
 * صفّ كتاب في اللوحة — عرض وتعديل وحذف
 * ---------------------------------------------------------------
 * التعديل هنا يمسّ ما يُحرَّر يدوياً فقط (الوسوم، اللون، الترتيب،
 * تصحيح العنوان والنبذة). النصّ نفسه لا يُحرَّر من اللوحة — مصدره
 * ملف Word، وتحريره في مكانين يفتح باب التعارض. لتغيير النصّ
 * يُرفع الملف من جديد.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { AdminBook, Notice } from './AdminDashboard';

const field =
  'mt-1.5 w-full rounded border border-ink-600 bg-ink-950 px-3 py-2 font-ui text-[0.82rem] text-ivory outline-none transition-colors focus:border-gold-700';
const labelClass = 'block font-ui text-[0.68rem] tracking-[0.16em] text-ivory-dim';

const megabytes = (bytes: number) => `${(bytes / 1048576).toFixed(1)} م.ب`;

export function BookRow({
  book,
  deploys,
  onDone,
}: {
  book: AdminBook;
  /** وضع المستودع: التغيير يظهر بعد إعادة النشر لا فوراً */
  deploys: boolean;
  onDone: (notice: Notice) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tags, setTags] = useState(book.tags.join('، '));
  const [order, setOrder] = useState(String(book.order));
  const [accent, setAccent] = useState(book.accent);
  const [title, setTitle] = useState(book.overrides.title ?? '');
  const [subtitle, setSubtitle] = useState(book.overrides.subtitle ?? '');
  const [description, setDescription] = useState(book.overrides.description ?? '');

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/books/${book.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags, order, accent, title, subtitle, description }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        title?: string;
        commitUrl?: string;
        deploying?: boolean;
      };
      if (!response.ok) {
        setError(data.error ?? 'تعذّر الحفظ.');
        return;
      }
      setEditing(false);
      onDone({
        kind: 'ok',
        text:
          `حُفظت تعديلات «${data.title ?? book.title}».` +
          (data.deploying ? '\nVercel تُعيد النشر — يظهر التغيير خلال دقيقة أو دقيقتين.' : ''),
        link: data.commitUrl,
      });
    } catch {
      setError('تعذّر الاتصال بالخادم.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/books/${book.slug}`, { method: 'DELETE' });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        commitUrl?: string;
        deploying?: boolean;
      };
      if (!response.ok) {
        setError(data.error ?? 'تعذّر الحذف.');
        setBusy(false);
        return;
      }
      onDone({
        kind: 'ok',
        text:
          `حُذف «${book.title}». ` +
          (data.deploying
            ? 'ملف Word باقٍ في تاريخ Git إن أردت استرجاعه.\nVercel تُعيد النشر الآن.'
            : 'ملف Word محفوظ في books/_deleted/ إن أردت استرجاعه.'),
        link: data.commitUrl,
      });
    } catch {
      setError('تعذّر الاتصال بالخادم.');
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-ink-700 bg-ink-900/40 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden
          style={{ backgroundColor: book.accent }}
          className="mt-1 h-10 w-7 shrink-0 rounded-sm border border-ink-600"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-ui text-[0.7rem] text-ivory-dim/60">{book.order}.</span>
            <h3 className="font-display text-xl text-ivory">{book.title}</h3>
            {!book.extracted && (
              <span className="rounded border border-copper/50 px-2 py-0.5 font-ui text-[0.62rem] text-copper">
                لم يُستخرج
              </span>
            )}
          </div>

          {book.subtitle && (
            <p className="mt-1 font-ui text-[0.75rem] leading-relaxed text-ivory-dim">
              {book.subtitle}
            </p>
          )}

          <p className="mt-2 font-ui text-[0.7rem] text-ivory-dim/80">
            {book.extracted
              ? `${book.pageCount} صفحة · ${book.chapterCount} فصلاً · ${book.wordCount.toLocaleString('ar-EG')} كلمة · `
              : ''}
            {book.pdfBytes ? `تنزيل ${megabytes(book.pdfBytes)}` : 'بلا ملف تنزيل'}
          </p>

          {book.tags.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {book.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-ink-600 px-2.5 py-0.5 font-ui text-[0.65rem] text-ivory-dim"
                >
                  {tag}
                </span>
              ))}
            </p>
          )}

          <p className="mt-2 font-ui text-[0.65rem] text-ivory-dim/50" dir="ltr">
            books/{book.docx}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 font-ui text-[0.7rem]">
          {book.extracted && (
            <Link
              href={`/book/${book.slug}`}
              target="_blank"
              className="text-ivory-dim transition-colors hover:text-gold-300"
            >
              معاينة ↗
            </Link>
          )}
          <button
            onClick={() => setEditing((value) => !value)}
            className="text-ivory-dim transition-colors hover:text-gold-300"
          >
            {editing ? 'إغلاق' : 'تعديل'}
          </button>
          <button
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="text-ivory-dim transition-colors hover:text-copper disabled:opacity-40"
          >
            حذف
          </button>
        </div>
      </div>

      {/* تأكيد الحذف — إجراء لا رجعة فيه من ضغطة واحدة */}
      {confirming && (
        <div className="mt-4 rounded border border-copper/50 bg-copper/10 p-4">
          <p className="font-ui text-[0.78rem] leading-relaxed text-ivory">
            حذف «{book.title}» من المكتبة؟ يُمحى النصّ المستخرَج وملف التنزيل.{' '}
            {deploys ? (
              <>ملف Word يبقى في تاريخ Git فيمكن استرجاعه منه.</>
            ) : (
              <>
                ملف Word الأصلي يُنقل إلى <code dir="ltr">books/_deleted/</code> ولا يُمحى.
              </>
            )}
          </p>
          <div className="mt-4 flex gap-3">
            <button
              onClick={remove}
              disabled={busy}
              className="rounded bg-copper px-5 py-2 font-ui text-[0.75rem] font-semibold text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? 'جارٍ الحذف...' : 'نعم، احذف'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded border border-ink-600 px-5 py-2 font-ui text-[0.75rem] text-ivory-dim transition-colors hover:text-ivory"
            >
              تراجع
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="mt-5 border-t border-ink-700 pt-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor={`tags-${book.slug}`}>
                الوسوم
              </label>
              <input
                id={`tags-${book.slug}`}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                className={field}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor={`order-${book.slug}`}>
                الترتيب
              </label>
              <input
                id={`order-${book.slug}`}
                type="number"
                min={1}
                max={999}
                dir="ltr"
                value={order}
                onChange={(event) => setOrder(event.target.value)}
                className={field}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <label className={labelClass} htmlFor={`accent-${book.slug}`}>
              لون الغلاف
            </label>
            <input
              id={`accent-${book.slug}`}
              type="color"
              value={accent}
              onChange={(event) => setAccent(event.target.value.toUpperCase())}
              className="h-9 w-14 cursor-pointer rounded border border-ink-600 bg-ink-950 p-1"
            />
            <span className="font-ui text-[0.7rem] text-ivory-dim" dir="ltr">
              {accent}
            </span>
          </div>

          <details className="mt-5 rounded border border-ink-700 px-4 py-3" open={Boolean(title || subtitle || description)}>
            <summary className="cursor-pointer font-ui text-[0.75rem] text-ivory-dim">
              تصحيح العنوان أو النبذة
            </summary>
            <p className="mt-3 font-ui text-[0.7rem] leading-relaxed text-ivory-dim/70">
              الحقل الفارغ يعني «استخرجه آلياً من الملف».
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className={labelClass} htmlFor={`title-${book.slug}`}>
                  العنوان
                </label>
                <input
                  id={`title-${book.slug}`}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className={field}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`subtitle-${book.slug}`}>
                  العنوان الفرعي
                </label>
                <input
                  id={`subtitle-${book.slug}`}
                  value={subtitle}
                  onChange={(event) => setSubtitle(event.target.value)}
                  className={field}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`description-${book.slug}`}>
                  النبذة
                </label>
                <textarea
                  id={`description-${book.slug}`}
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className={field}
                />
              </div>
            </div>
          </details>

          <button
            onClick={save}
            disabled={busy}
            className="mt-5 rounded bg-[image:var(--grad-gold-surface)] px-6 py-2 font-ui text-[0.78rem] font-semibold text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 font-ui text-[0.75rem] text-copper">
          {error}
        </p>
      )}
    </li>
  );
}
