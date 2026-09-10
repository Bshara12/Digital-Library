/**
 * سكربت الاستخراج — يحوّل ملفات Word إلى محتوى الموقع
 * ===============================================================
 * يُشغَّل محلياً (`npm run ingest`) ومخرجاته تُرفع مع المشروع.
 *
 * هذا الملف هو غلاف نظام الملفات فقط: يقرأ `books/*.docx`، يمرّرها
 * إلى نواة الاستخراج في `src/lib/ingest/core.mjs`، ويكتب النتيجة
 * في `content/`. كل منطق التحويل — تنظيف النصّ، بناء الفهرس،
 * توليد الصفحات — يعيش في النواة، لأن لوحة الإدارة تستوردها هي
 * أيضاً لتعالج ملفاً مرفوعاً في الذاكرة. خطّ معالجة واحد لا اثنان.
 *
 * الأعلام:
 *   --report-only  يحلّل ويكتب تقرير المراجعة دون لمس content/
 *   --json         يطبع سطراً أخيراً بحصيلة آلية (تقرؤه اللوحة)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBook, summarize, WORDS_PER_PAGE } from '../src/lib/ingest/core.mjs';
import { BOOKS, AUTHOR_NAME } from './books.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOKS_DIR = path.join(ROOT, 'books');
const OUT_DIR = path.join(ROOT, 'content');
const PDF_OUT_DIR = path.join(ROOT, 'public', 'books');

const REPORT_ONLY = process.argv.includes('--report-only');
const JSON_REPORT = process.argv.includes('--json');
const JSON_MARKER = '@@INGEST_JSON@@';

/** يقرأ ملف الكتاب من القرص ويمرّره إلى النواة */
function processBook(entry) {
  const docxPath = path.join(BOOKS_DIR, entry.docx);
  if (!fs.existsSync(docxPath)) throw new Error(`ملف غير موجود: ${entry.docx}`);

  const result = buildBook({
    entry,
    buffer: fs.readFileSync(docxPath),
    authorName: AUTHOR_NAME,
    pdf: pdfInfo(entry.slug),
  });
  return { entry, ...result };
}

/** حجم ملف التنزيل إن وُجد — يظهر على زرّ التنزيل */
function pdfInfo(slug) {
  const file = path.join(PDF_OUT_DIR, `${slug}.pdf`);
  if (!fs.existsSync(file)) return null;
  const { size } = fs.statSync(file);
  return { path: `/books/${slug}.pdf`, bytes: size };
}

function main() {
  console.log(`\n[*] استخراج ${BOOKS.length} كتب من ملفات Word...\n`);

  const results = [];
  const failures = [];
  for (const entry of BOOKS.slice().sort((a, b) => a.order - b.order)) {
    process.stdout.write(`   - ${entry.docx} ... `);
    try {
      const result = processBook(entry);
      results.push(result);
      console.log(
        `${result.meta.pageCount} صفحة | ${result.meta.wordCount} كلمة | ` +
          `${result.meta.chapters.length} فصل | ${result.subheadings.length} عنوان فرعي` +
          (result.meta.pdf ? '' : ' | (لا ملف PDF)')
      );
    } catch (err) {
      failures.push({ slug: entry.slug, docx: entry.docx, error: err.message });
      console.log(`FAILED: ${err.message}`);
    }
  }

  if (!REPORT_ONLY) {
    fs.rmSync(path.join(OUT_DIR, 'books'), { recursive: true, force: true });
    for (const r of results) {
      const dir = path.join(OUT_DIR, 'books', r.meta.slug);
      fs.mkdirSync(dir, { recursive: true });
      // سطر جديد في الآخر — كملفّ نصّي، وليطابق ما تكتبه لوحة الإدارة
      fs.writeFileSync(path.join(dir, 'meta.json'), `${JSON.stringify(r.meta, null, 2)}
`, 'utf8');
      fs.writeFileSync(path.join(dir, 'pages.json'), JSON.stringify(r.pages), 'utf8');
    }
    const index = results.map((r) => summarize(r.meta));
    fs.writeFileSync(path.join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}
`, 'utf8');
    console.log(`\n[ok] كُتب المحتوى في content/`);
  }

  writeReport(results);

  if (JSON_REPORT) {
    console.log(
      JSON_MARKER +
        JSON.stringify({
          ok: failures.length === 0,
          written: !REPORT_ONLY,
          books: results.map((r) => ({
            slug: r.meta.slug,
            title: r.meta.title,
            pageCount: r.meta.pageCount,
            wordCount: r.meta.wordCount,
            chapterCount: r.meta.chapters.length,
            hasPdf: r.meta.pdf !== null,
          })),
          failures,
        })
    );
  }
}

/* ---------------------------------------------------------------
   ملف المراجعة — يُعرض على صاحب المشروع قبل الاعتماد
   --------------------------------------------------------------- */
function writeReport(results) {
  const L = [];
  L.push('# مراجعة بيانات الكتب المستخرَجة');
  L.push('');
  L.push('> وُلِّد آلياً بـ `npm run ingest` من ملفات Word في `books/`.');
  L.push('> راجع العناوين والفهارس، وصحّح ما يلزم في `scripts/books.config.mjs`.');
  L.push('');
  L.push('| # | العنوان | صفحات | كلمات | دقائق | فصول | عناوين فرعية | PDF |');
  L.push('|---|---|---|---|---|---|---|---|');
  results.forEach((r, i) => {
    const size = r.meta.pdf ? `${(r.meta.pdf.bytes / 1048576).toFixed(1)} م.ب` : '—';
    L.push(
      `| ${i + 1} | ${r.meta.title} | ${r.meta.pageCount} | ${r.meta.wordCount} | ` +
        `${r.meta.readingMinutes} | ${r.meta.chapters.length} | ${r.subheadings.length} | ${size} |`
    );
  });
  L.push('');
  L.push('> **الصفحات مولّدة** بميزانية ' + WORDS_PER_PAGE + ' كلمة للصفحة، وكل فصل');
  L.push('> يبدأ صفحة جديدة. ملف Word لا يحمل فواصل صفحات، ورقم الصفحة هنا');
  L.push('> مرجع قراءة داخل الموقع لا مطابقة للورق المطبوع.');
  L.push('');
  L.push('---');
  L.push('');

  for (const r of results) {
    L.push(`## ${r.meta.title}`);
    L.push('');
    L.push(`- **الملف المصدر:** \`${r.meta.sourceFile}\``);
    L.push(`- **الرابط:** \`/book/${r.meta.slug}\``);
    L.push(`- **العنوان الفرعي:** ${r.meta.subtitle ?? '_(لا يوجد)_'}`);
    L.push(`- **الوسوم:** ${r.meta.tags.join('، ')}`);
    L.push(
      `- **ملف التنزيل:** ${r.meta.pdf ? `\`${r.meta.pdf.path}\`` : '_غير مولَّد — شغّل `npm run pdf`_'}`
    );
    L.push('');
    L.push('**النبذة _(مقتطف آلي — يُستحسن استبدالها بنصّ من عندك عبر `overrides.description`)_:**');
    L.push('');
    L.push('> ' + (r.meta.description || '_تعذّر الاستخراج_'));
    L.push('');
    if (r.meta.chapters.length) {
      L.push('**الفهرس (من تنسيق العناوين في ملف Word):**');
      L.push('');
      L.push('| الفصل | الصفحة |');
      L.push('|---|---|');
      for (const chapter of r.meta.chapters) L.push(`| ${chapter.title} | ${chapter.page} |`);
      L.push('');
    }
    if (r.subheadings.length) {
      L.push('<details><summary>العناوين الفرعية (بارزة في المتن، خارج الفهرس)</summary>');
      L.push('');
      for (const s of r.subheadings) L.push(`- ${s}`);
      L.push('');
      L.push('</details>');
      L.push('');
    }
    L.push('---');
    L.push('');
  }

  const dir = path.join(OUT_DIR, 'review');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'BOOKS-REVIEW.md'), L.join('\n'), 'utf8');
  console.log(`[ok] تقرير المراجعة: content/review/BOOKS-REVIEW.md\n`);
}

main();