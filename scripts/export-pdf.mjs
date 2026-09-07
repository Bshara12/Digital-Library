/**
 * توليد ملفات التنزيل — من Word إلى PDF
 * ===============================================================
 * يُشغَّل محلياً (`npm run pdf`) ومخرجاته تُرفع مع المشروع في
 * `public/books/<slug>.pdf`.
 *
 * لماذا نولّدها بدل استعمال ملفات PDF القديمة الموجودة في books/؟
 * لأن المؤلف صحّح النصّ في ملفات Word، فالـ PDF القديم يحمل
 * الأخطاء التي صُحّحت. الملف الذي ينزّله الزائر يجب أن يطابق ما
 * يقرأه على الموقع.
 *
 * الاسم اللاتيني (slug.pdf) مقصود: الاسم العربي في الرابط يتحوّل
 * إلى ترميز مئوي طويل وقبيح عند المشاركة.
 *
 * المحوّل: Microsoft Word عبر COM على ويندوز، أو LibreOffice
 * (soffice) على غيره. كلاهما يحفظ التنسيق والصور والخطوط العربية
 * كما صمّمها المؤلف.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BOOKS } from './books.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOKS_DIR = path.join(ROOT, 'books');
const OUT_DIR = path.join(ROOT, 'public', 'books');

const FORCE = process.argv.includes('--force');

/* ---------------------------------------------------------------
   المحوّلات
   --------------------------------------------------------------- */

/** Word على ويندوز — أدقّ نتيجة لأنه المحرّر الذي أُنشئ به الملف */
function convertWithWord(jobs) {
  /*
   * نفتح Word مرّة واحدة لكل الكتب: تشغيله وإغلاقه لكل ملف يستهلك
   * ثواني طويلة. `ExportAsFixedFormat` بالنوع 17 = PDF.
   */
  const lines = [
    '$ErrorActionPreference = "Stop"',
    '$word = New-Object -ComObject Word.Application',
    '$word.Visible = $false',
    '$word.DisplayAlerts = 0',
    'try {',
  ];
  for (const { source, target } of jobs) {
    const src = source.replace(/'/g, "''");
    const dst = target.replace(/'/g, "''");
    lines.push(
      `  Write-Output '>> ${path.basename(target)}'`,
      `  $doc = $word.Documents.Open('${src}', $false, $true)`,
      `  $doc.ExportAsFixedFormat('${dst}', 17)`,
      '  $doc.Close(0)'
    );
  }
  lines.push('} finally {', '  $word.Quit()', '}');

  const script = path.join(os.tmpdir(), `export-pdf-${process.pid}.ps1`);
  // BOM يضمن قراءة PowerShell للمسارات العربية بترميز صحيح
  fs.writeFileSync(script, '\ufeff' + lines.join('\n'), 'utf8');
  try {
    execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { stdio: 'inherit' }
    );
  } finally {
    fs.rmSync(script, { force: true });
  }
}

/** LibreOffice — البديل على macOS وlinux */
function convertWithSoffice(jobs, binary) {
  for (const { source, target } of jobs) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-'));
    execFileSync(binary, ['--headless', '--convert-to', 'pdf', '--outdir', tmp, source], {
      stdio: 'pipe',
    });
    // soffice يسمّي الناتج باسم المصدر — ننقله إلى الاسم اللاتيني
    const produced = fs
      .readdirSync(tmp)
      .map((name) => path.join(tmp, name))
      .find((file) => file.endsWith('.pdf'));
    if (!produced) throw new Error(`لم يُنتَج ملف PDF من ${path.basename(source)}`);
    fs.renameSync(produced, target);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`>> ${path.basename(target)}`);
  }
}

function findConverter() {
  if (process.platform === 'win32') {
    try {
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$w = New-Object -ComObject Word.Application; $w.Quit()',
        ],
        { stdio: 'pipe' }
      );
      return { kind: 'word' };
    } catch {
      /* لا Word — نجرّب LibreOffice */
    }
  }

  const candidates = [
    'soffice',
    'C:/Program Files/LibreOffice/program/soffice.exe',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ];
  for (const binary of candidates) {
    try {
      execFileSync(binary, ['--version'], { stdio: 'pipe' });
      return { kind: 'soffice', binary };
    } catch {
      /* التالي */
    }
  }
  return null;
}

/* ---------------------------------------------------------------
   التنفيذ
   --------------------------------------------------------------- */
function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const jobs = [];
  for (const entry of BOOKS.slice().sort((a, b) => a.order - b.order)) {
    const source = path.join(BOOKS_DIR, entry.docx);
    const target = path.join(OUT_DIR, `${entry.slug}.pdf`);
    if (!fs.existsSync(source)) {
      console.log(`   ! ملف غير موجود: ${entry.docx}`);
      continue;
    }
    // نتخطّى ما هو أحدث من مصدره — التحويل بطيء
    if (!FORCE && fs.existsSync(target)) {
      if (fs.statSync(target).mtimeMs >= fs.statSync(source).mtimeMs) {
        console.log(`   = ${entry.slug}.pdf محدَّث`);
        continue;
      }
    }
    jobs.push({ source, target, slug: entry.slug });
  }

  if (jobs.length === 0) {
    console.log('\n[ok] كل ملفات التنزيل محدَّثة. (`npm run pdf -- --force` لإعادة التوليد)\n');
    return;
  }

  const converter = findConverter();
  if (!converter) {
    console.error(
      '\n✖ لا محوّل متوفّر.\n' +
        '  ويندوز : Microsoft Word\n' +
        '  غير ذلك: LibreOffice — brew install libreoffice / apt install libreoffice\n'
    );
    process.exit(1);
  }

  console.log(`\n[*] توليد ${jobs.length} ملف PDF بواسطة ${converter.kind}...\n`);
  if (converter.kind === 'word') convertWithWord(jobs);
  else convertWithSoffice(jobs, converter.binary);

  console.log('');
  let total = 0;
  for (const job of jobs) {
    if (!fs.existsSync(job.target)) {
      console.log(`   ✖ فشل: ${job.slug}`);
      continue;
    }
    const { size } = fs.statSync(job.target);
    total += size;
    console.log(`   ${job.slug}.pdf — ${(size / 1048576).toFixed(1)} م.ب`);
  }
  console.log(`\n[ok] المجموع ${(total / 1048576).toFixed(1)} م.ب في public/books/`);
  console.log('     شغّل `npm run ingest` بعدها ليُسجّل الحجم في بيانات الكتب.\n');
}

main();
