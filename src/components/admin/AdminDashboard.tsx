'use client';

/**
 * لوحة التحكّم
 * ---------------------------------------------------------------
 * كل عملية هنا تنتهي بإعادة توليد `content/` على الخادم، فبعد كل
 * نجاح نستدعي `router.refresh()` لتُقرأ البيانات الجديدة — لا نحدّث
 * حالة محلّية بالتخمين، لأن ما يعرضه الخادم هو الحقيقة الوحيدة.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AddBookForm } from './AddBookForm';
import { BookRow } from './BookRow';

export interface AdminBook {
  slug: string;
  docx: string;
  accent: string;
  tags: string[];
  order: number;
  overrides: { title?: string; subtitle?: string | null; description?: string };
  title: string;
  subtitle: string | null;
  pageCount: number;
  wordCount: number;
  chapterCount: number;
  pdfBytes: number | null;
  extracted: boolean;
}

export type Notice = { kind: 'ok' | 'error'; text: string; link?: string } | null;

export function AdminDashboard({
  books,
  usingDefaultPassword,
  storage,
  canGeneratePdf,
}: {
  books: AdminBook[];
  usingDefaultPassword: boolean;
  /** أين تُحفظ التغييرات: قرص الجهاز أم مستودع GitHub */
  storage: 'local' | 'github';
  canGeneratePdf: boolean;
}) {
  const deploys = storage === 'github';
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.refresh();
    router.push('/admin/login');
  }

  async function generatePdfs() {
    setPdfBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/pdf', { method: 'POST' });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        withPdf?: number;
        total?: number;
      };
      setNotice(
        data.ok
          ? { kind: 'ok', text: `تمّ — ${data.withPdf} من ${data.total} كتاباً لها ملف تنزيل.` }
          : {
              kind: 'error',
              text:
                data.error ??
                `تعذّر التوليد. يحتاج Microsoft Word (ويندوز) أو LibreOffice.\n${data.message ?? ''}`,
            }
      );
      refresh();
    } catch {
      setNotice({ kind: 'error', text: 'تعذّر الاتصال بالخادم.' });
    } finally {
      setPdfBusy(false);
    }
  }

  const missingPdf = books.filter((book) => book.pdfBytes === null).length;

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-gold-300">لوحة الإدارة</h1>
          <p className="mt-2 font-ui text-[0.78rem] text-ivory-dim">
            {books.length} كتاباً في المكتبة —{' '}
            {deploys ? 'التغييرات تُودَع في مستودع GitHub' : 'التغييرات تُحفظ على هذا الجهاز'}
          </p>
        </div>
        <div className="flex items-center gap-4 font-ui text-[0.72rem] tracking-[0.14em]">
          <Link href="/library" className="text-ivory-dim transition-colors hover:text-gold-300">
            عرض المكتبة ↗
          </Link>
          <button onClick={logout} className="text-ivory-dim transition-colors hover:text-copper">
            خروج
          </button>
        </div>
      </header>
      <hr className="rule-gold mt-6" />

      {usingDefaultPassword && (
        <p className="mt-6 rounded border border-copper/40 bg-copper/10 px-4 py-3 font-ui text-[0.75rem] leading-relaxed text-ivory-dim">
          <span className="text-copper">{deploys ? 'خطر:' : 'تنبيه:'}</span> كلمة السرّ الافتراضية{' '}
          <code dir="ltr">123456</code> مستعملة.{' '}
          {deploys
            ? 'اللوحة منشورة على الإنترنت ويستطيع أي أحد تخمينها والكتابة على مستودعك — اضبط ADMIN_PASSWORD في متغيّرات البيئة على Vercel فوراً.'
            : 'مناسبة للتشغيل على جهازك — لكن إن نشرت اللوحة على الإنترنت فاضبط ADMIN_PASSWORD.'}
        </p>
      )}

      {notice && (
        <div
          role="status"
          className={`mt-6 whitespace-pre-line rounded border px-4 py-3 font-ui text-[0.78rem] leading-relaxed ${
            notice.kind === 'ok'
              ? 'border-gold-700/50 bg-gold-700/10 text-gold-300'
              : 'border-copper/50 bg-copper/10 text-copper'
          }`}
        >
          {notice.text}
          {notice.link && (
            <>
              {' '}
              <a
                href={notice.link}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                عرض الإيداع ↗
              </a>
            </>
          )}
        </div>
      )}

      <AddBookForm
        suggestedOrder={books.reduce((max, book) => Math.max(max, book.order), 0) + 1}
        offerPdfUpload={!canGeneratePdf}
        deploys={deploys}
        onDone={(message) => {
          setNotice(message);
          refresh();
        }}
      />

      <section className="mt-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-gold-300">الكتب</h2>
          {canGeneratePdf ? (
            <button
              onClick={generatePdfs}
              disabled={pdfBusy}
              title="يحتاج Microsoft Word على ويندوز أو LibreOffice على غيره"
              className="rounded border border-ink-600 px-4 py-2 font-ui text-[0.72rem] tracking-[0.1em] text-ivory-dim transition-colors hover:border-gold-700 hover:text-gold-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pdfBusy
                ? 'جارٍ التوليد...'
                : `توليد ملفات التنزيل${missingPdf ? ` (${missingPdf} ناقص)` : ''}`}
            </button>
          ) : (
            missingPdf > 0 && (
              <span className="font-ui text-[0.7rem] text-ivory-dim/70">
                {missingPdf} كتاباً بلا ملف تنزيل — يُرفع مع الكتاب أو يُولَّد محلياً بـ{' '}
                <code dir="ltr">npm run pdf</code>
              </span>
            )
          )}
        </div>

        <ul className="mt-6 space-y-3">
          {books.map((book) => (
            <BookRow
              key={book.slug}
              book={book}
              deploys={deploys}
              onDone={(message) => {
                setNotice(message);
                refresh();
              }}
            />
          ))}
        </ul>

        {books.length === 0 && (
          <p className="mt-8 font-ui text-[0.8rem] text-ivory-dim">
            لا كتب بعد — ارفع أوّل ملف Word من النموذج أعلاه.
          </p>
        )}
      </section>
    </main>
  );
}
