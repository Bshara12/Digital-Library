/**
 * تشغيل سكربتات المشروع — الوضع المحلي وحده
 * ===============================================================
 * الاستخراج نفسه لم يعد يمرّ من هنا: لوحة الإدارة تستورد نواة
 * `src/lib/ingest/core.mjs` وتعالج الملف في الذاكرة، فتعمل على
 * Vercel كما تعمل على جهازك.
 *
 * ما بقي هنا هو ما لا يمكن أن يعمل إلا على جهاز حقيقي: تحويل Word
 * إلى PDF. يحتاج Microsoft Word (ويندوز) أو LibreOffice مثبّتاً،
 * ولا وجود لهما على Vercel — ولهذا يخفي المخزن هذا الإجراء هناك
 * (`Store.canGeneratePdf`).
 */

import path from 'node:path';
import { execFile } from 'node:child_process';

const ROOT = process.cwd();

function run(
  script: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [path.join(ROOT, 'scripts', script), ...args],
      { cwd: ROOT, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        // خطأ التشغيل نفسه (لم يُقلع) ≠ خروج بكود غير صفري
        if (error && typeof error.code !== 'number' && !('killed' in error && error.killed)) {
          reject(error);
          return;
        }
        const code = error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ code, stdout, stderr });
      }
    );
  });
}

export interface PdfResult {
  ok: boolean;
  /** مخرجات المحوّل — تُعرض كما هي لأن سببها غالباً بيئي (Word غير مثبّت) */
  message: string;
}

/**
 * يولّد ملفات التنزيل الناقصة، ثم يعيد الاستخراج الكامل ليُسجَّل حجم
 * كل ملف في بيانات الكتاب — وهما الخطوتان الموصوفتان في README.
 * إعادة الاستخراج هنا تُنعش أيضاً `content/review/BOOKS-REVIEW.md`.
 */
export async function runPdfExport(): Promise<PdfResult> {
  const pdf = await run('export-pdf.mjs', [], 600_000);
  const output = `${pdf.stdout}\n${pdf.stderr}`.trim();

  if (pdf.code !== 0) {
    return { ok: false, message: output.split(/\r?\n/).filter(Boolean).slice(-8).join('\n') };
  }

  const ingest = await run('ingest.mjs', [], 120_000);
  return {
    ok: ingest.code === 0,
    message: `${output}\n${ingest.stderr}`.split(/\r?\n/).filter(Boolean).slice(-8).join('\n'),
  };
}

/* ---------------------------------------------------------------
   قفل التسلسل
   ---------------------------------------------------------------
   الاستخراج الكامل يمحو `content/books/` ثم يعيد كتابته. عمليتان
   متوازيتان تتصادمان على القرص وتُنتجان محتوى ناقصاً، فنُسلسل
   عمليات الكتابة على طابور واحد داخل العملية.
*/
let queue: Promise<unknown> = Promise.resolve();

export function withPipelineLock<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}
