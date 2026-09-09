/**
 * تشغيل خطّ المعالجة من لوحة الإدارة
 * ===============================================================
 * اللوحة لا تعيد كتابة منطق الاستخراج، بل تشغّل السكربتات نفسها
 * التي يشغّلها `npm run ingest` و `npm run pdf`. هذا مقصود: خطّ
 * معالجة واحد لا اثنان، فما يظهر بعد الرفع من اللوحة يطابق تماماً
 * ما ينتج من سطر الأوامر، ولا يتفرّع السلوك مع الوقت.
 *
 * الاستخراج الكامل للمكتبة يستغرق أقلّ من ثانية (يقرأ الـ .docx
 * مباشرة بلا حزم خارجية)، فلا داعي لتعقيد الاستخراج الجزئي —
 * التوليد الكامل يضمن أن `content/index.json` متّسق دائماً.
 */

import path from 'node:path';
import { execFile } from 'node:child_process';
import { ROOT } from './registry';

export interface IngestBook {
  slug: string;
  title: string;
  pageCount: number;
  wordCount: number;
  chapterCount: number;
  hasPdf: boolean;
}

export interface IngestResult {
  ok: boolean;
  written: boolean;
  books: IngestBook[];
  failures: { slug: string; docx: string; error: string }[];
}

const JSON_MARKER = '@@INGEST_JSON@@';

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

/** يعيد توليد `content/` كاملاً من السجلّ الحالي */
export async function runIngest(): Promise<IngestResult> {
  const { stdout, stderr, code } = await run('ingest.mjs', ['--json'], 120_000);

  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith(JSON_MARKER));

  if (!line) {
    throw new Error(
      `تعذّر تشغيل الاستخراج (رمز ${code}). ${stderr.trim() || stdout.trim().slice(-400)}`
    );
  }
  return JSON.parse(line.slice(JSON_MARKER.length)) as IngestResult;
}

export interface PdfResult {
  ok: boolean;
  /** رسالة المحوّل — تُعرض كما هي لأن سببها غالباً بيئي (Word غير مثبّت) */
  message: string;
}

/**
 * توليد ملفات التنزيل. يحتاج Microsoft Word على ويندوز أو
 * LibreOffice على غيره؛ إن غاب المحوّل نُرجع الفشل برسالته بدل
 * أن نرمي — فالكتاب يبقى صالحاً للقراءة على الموقع بلا ملف تنزيل.
 */
export async function runPdfExport(): Promise<PdfResult> {
  const { code, stdout, stderr } = await run('export-pdf.mjs', [], 600_000);
  const output = `${stdout}\n${stderr}`.trim();
  return {
    ok: code === 0,
    message: output.split(/\r?\n/).filter(Boolean).slice(-8).join('\n'),
  };
}

/* ---------------------------------------------------------------
   قفل التسلسل
   ---------------------------------------------------------------
   الاستخراج يمحو `content/books/` ثم يعيد كتابته. عمليتان متوازيتان
   تتصادمان على القرص وتُنتجان محتوى ناقصاً، فنُسلسل كل عمليات
   الكتابة على طابور واحد داخل العملية.
*/
let queue: Promise<unknown> = Promise.resolve();

export function withPipelineLock<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}
