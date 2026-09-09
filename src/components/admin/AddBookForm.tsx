'use client';

/**
 * إضافة كتاب
 * ---------------------------------------------------------------
 * حقل واحد إلزامي فعلياً — ملف Word. الباقي إمّا له قيمة افتراضية
 * أو يُستخرج من الملف نفسه: العنوان والعنوان الفرعي والنبذة تُقرأ
 * من الغلاف والمقدّمة، ولا تُملأ هنا إلا حين يخطئ الغلاف. الـ slug
 * يُقترح من اسم الملف ويبقى قابلاً للتعديل قبل الرفع.
 */

import { useRef, useState } from 'react';
import type { Notice } from './AdminDashboard';

/** ألوان الغلاف المستعملة في المكتبة — تُمزج مع الذهب */
const ACCENTS = [
  '#2A2340',
  '#17281E',
  '#14203A',
  '#14312F',
  '#2E1B2C',
  '#33261A',
  '#2B2A1C',
  '#3A1C22',
];

/** اقتراح معرّف لاتيني من اسم الملف — عربيّ غالباً، فنكتفي بما نجده */
function suggestSlug(fileName: string): string {
  return fileName
    .replace(/\.docx$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const field =
  'mt-1.5 w-full rounded border border-ink-600 bg-ink-950 px-3 py-2 font-ui text-[0.82rem] text-ivory outline-none transition-colors focus:border-gold-700 placeholder:text-ivory-dim/50';
const labelClass = 'block font-ui text-[0.68rem] tracking-[0.16em] text-ivory-dim';

export function AddBookForm({
  suggestedOrder,
  onDone,
}: {
  suggestedOrder: number;
  onDone: (notice: Notice) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [fileName, setFileName] = useState<string | null>(null);

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (!slug) setSlug(suggestSlug(file.name));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const body = new FormData(event.currentTarget);
    body.set('accent', accent);

    try {
      const response = await fetch('/api/admin/books', { method: 'POST', body });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        book?: { title: string; pageCount: number; chapterCount: number };
      };

      if (!response.ok) {
        setError(data.error ?? 'تعذّرت الإضافة.');
        return;
      }

      formRef.current?.reset();
      setSlug('');
      setFileName(null);
      setOpen(false);
      onDone({
        kind: 'ok',
        text: data.book
          ? `أُضيف «${data.book.title}» — ${data.book.pageCount} صفحة و ${data.book.chapterCount} فصلاً.`
          : 'أُضيف الكتاب.',
      });
    } catch {
      setError('تعذّر الاتصال بالخادم.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-10 w-full rounded border border-dashed border-ink-600 py-4 font-ui text-[0.8rem] tracking-[0.1em] text-ivory-dim transition-colors hover:border-gold-700 hover:text-gold-300"
      >
        + إضافة كتاب جديد
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="mt-10 rounded-lg border border-ink-700 bg-ink-900/60 p-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-gold-300">كتاب جديد</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-ui text-[0.72rem] text-ivory-dim transition-colors hover:text-copper"
        >
          إلغاء
        </button>
      </div>

      {/* ملف Word */}
      <div className="mt-6">
        <span className={labelClass}>ملف Word (.docx) — مصدر النصّ</span>
        <label className="mt-1.5 flex cursor-pointer items-center justify-center rounded border border-dashed border-ink-600 px-4 py-6 text-center transition-colors hover:border-gold-700">
          <input
            type="file"
            name="docx"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
            onChange={pickFile}
            className="sr-only"
          />
          <span className="font-ui text-[0.8rem] text-ivory-dim">
            {fileName ?? 'اضغط لاختيار الملف'}
          </span>
        </label>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="slug">
            المعرّف في الرابط
          </label>
          <input
            id="slug"
            name="slug"
            required
            dir="ltr"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="my-new-book"
            className={field}
          />
          <p className="mt-1.5 font-ui text-[0.68rem] text-ivory-dim/70" dir="ltr">
            /book/{slug || '…'}
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="order">
            الترتيب في المكتبة
          </label>
          <input
            id="order"
            name="order"
            type="number"
            min={1}
            max={999}
            defaultValue={suggestedOrder}
            dir="ltr"
            className={field}
          />
        </div>
      </div>

      <div className="mt-5">
        <label className={labelClass} htmlFor="tags">
          الوسوم — مفصولة بفاصلة
        </label>
        <input id="tags" name="tags" placeholder="تاريخ، مجتمع" className={field} />
      </div>

      <div className="mt-5">
        <span className={labelClass}>لون الغلاف</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {ACCENTS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setAccent(color)}
              aria-label={color}
              aria-pressed={accent === color}
              style={{ backgroundColor: color }}
              className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 ${
                accent === color ? 'scale-110 border-gold-500' : 'border-ink-600'
              }`}
            />
          ))}
          <input
            type="color"
            value={accent}
            onChange={(event) => setAccent(event.target.value.toUpperCase())}
            aria-label="لون مخصّص"
            className="h-9 w-12 cursor-pointer rounded border border-ink-600 bg-ink-950 p-1"
          />
        </div>
      </div>

      {/* التجاوزات — تُترك فارغة في الحالة العادية */}
      <details className="mt-6 rounded border border-ink-700 px-4 py-3">
        <summary className="cursor-pointer font-ui text-[0.75rem] text-ivory-dim">
          تصحيح العنوان أو النبذة (اختياري)
        </summary>
        <p className="mt-3 font-ui text-[0.7rem] leading-relaxed text-ivory-dim/70">
          اتركها فارغة ليُستخرج كلٌّ منها آلياً من غلاف الملف ومقدّمته. املأها فقط إن كان الغلاف
          يحمل خطأً.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className={labelClass} htmlFor="title">
              العنوان
            </label>
            <input id="title" name="title" className={field} />
          </div>
          <div>
            <label className={labelClass} htmlFor="subtitle">
              العنوان الفرعي
            </label>
            <input id="subtitle" name="subtitle" className={field} />
          </div>
          <div>
            <label className={labelClass} htmlFor="description">
              النبذة
            </label>
            <textarea id="description" name="description" rows={4} className={field} />
          </div>
        </div>
      </details>

      {error && (
        <p role="alert" className="mt-5 font-ui text-[0.78rem] leading-relaxed text-copper">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 rounded bg-[image:var(--grad-gold-surface)] px-8 py-2.5 font-ui text-[0.8rem] font-semibold tracking-wide text-ink-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'جارٍ الاستخراج...' : 'إضافة ومعالجة'}
      </button>

      {busy && (
        <p className="mt-3 font-ui text-[0.72rem] text-ivory-dim">
          يُقرأ النصّ ويُبنى الفهرس وتُولَّد الصفحات — بضع ثوانٍ.
        </p>
      )}
    </form>
  );
}
