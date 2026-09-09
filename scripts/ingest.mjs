/**
 * سكربت الاستخراج — يحوّل ملفات Word إلى محتوى الموقع
 * ===============================================================
 * يُشغَّل محلياً فقط (`npm run ingest`)، ومخرجاته تُرفع مع المشروع.
 * لا يعمل وقت البناء على Vercel ولا يحتاج أي خدمة خارجية.
 *
 * لماذا .docx وليس .pdf؟
 *   الـ PDF ناتج طباعة: يُقحم محارف التطويل داخل الكلمات لضبط
 *   المحاذاة، ويكسر الفقرات أسطراً، وقد يعكس رباط لام-ألف. أما
 *   ملف Word فهو النصّ الذي كتبه المؤلف وصحّحه — نظيف، ويحمل
 *   تنسيق العناوين بنفسه فيغنينا عن استنتاجها من فهرس مطبوع.
 *   (السكربت القديم محفوظ في scripts/legacy/ للرجوع فقط.)
 *
 * الترقيم: ملف Word لا يحمل فواصل صفحات، فنولّد الصفحات بميزانية
 * كلمات ثابتة (`WORDS_PER_PAGE`) ونبدأ صفحة جديدة عند كل فصل. رقم
 * الصفحة عندنا مرجع قراءة داخل الموقع لا وعد بمطابقة الورق.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDocx } from './docx.mjs';
import { BOOKS, AUTHOR_NAME } from './books.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOKS_DIR = path.join(ROOT, 'books');
const OUT_DIR = path.join(ROOT, 'content');
const PDF_OUT_DIR = path.join(ROOT, 'public', 'books');
const REPORT_ONLY = process.argv.includes('--report-only');
/**
 * `--json` : يطبع سطراً أخيراً بصيغة JSON بحصيلة كل كتاب (نجح/فشل).
 * تستعمله لوحة الإدارة لتعرف إن نجح الكتاب الذي رفعه المستخدم تحديداً،
 * بدل قراءة السجلّ البشري. لا أثر له على المخرجات الأخرى.
 */
const JSON_REPORT = process.argv.includes('--json');
const JSON_MARKER = '@@INGEST_JSON@@';

/** كلمات الصفحة المولّدة — قريبة من متوسّط صفحة الكتاب المطبوع */
const WORDS_PER_PAGE = 150;
/** لا نبدأ صفحة جديدة لفصل إن كانت الصفحة الحالية شبه فارغة */
const MIN_WORDS_BEFORE_BREAK = 60;

/* ---------------------------------------------------------------
   أدوات النص العربي (نسخة مستقلة من src/lib/arabic.ts)
   --------------------------------------------------------------- */
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩؜]/g;
const stripBidi = (s) => s.replace(BIDI_CONTROLS, '');
/** الحروف العربية وحدها — دون الترقيم والتشكيل، فتُستثنى من قواعد التباعد */
const AR_LETTER = 'ء-غف-يٱ-ۓ';
const COMBINING = 'ؐ-ًؚ-ْٰۖ-ۭ';

/**
 * قلب الأقواس المعكوسة
 * ---------------------------------------------------------------
 * كتابة القوس اللاتيني داخل نصّ عربي تعرضه مقلوباً «)آرام دمشق(»،
 * وهو أشيع أخطاء الطباعة العربية. لا نكتفي بمطابقة نصّية — فذلك
 * يُفسد «(أ) و (ب)» — بل نمرّ على السلسلة ونحسب العمق: القوس
 * المغلق الذي يظهر بلا مفتوح سابق هو مفتوحٌ مقلوب، فنقلبه مع أوّل
 * قوس مفتوح يتيم بعده.
 */
function fixReversedParens(text) {
  const chars = [...text];
  let depth = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '(') {
      depth++;
    } else if (chars[i] === ')') {
      if (depth > 0) {
        depth--;
        continue;
      }
      const opener = chars.indexOf('(', i + 1);
      const closer = chars.indexOf(')', i + 1);
      if (opener !== -1 && (closer === -1 || opener < closer)) {
        chars[i] = '(';
        chars[opener] = ')';
        i = opener;
      }
    }
  }
  return chars.join('');
}

/**
 * إصلاح تباعد وترقيم
 * ---------------------------------------------------------------
 * الطباعة اليدوية في Word تتركُ آثاراً: مسافة قبل الفاصلة بدل ما
 * بعدها، ومحارف تطويل للزخرفة، ومسافات مزدوجة. كلّها تُصلَح دون
 * لمس الحروف نفسها.
 */
function repairSpacing(s) {
  return (
    fixReversedParens(s)
      // التطويل محرف محاذاة بصري بحت — حذفه لا يمسّ المعنى
      .replace(/ـ/g, '')
      // علامة تشكيل منفصلة عن حرفها بمسافة
      .replace(new RegExp(`\\s+[${COMBINING}]+`, 'g'), '')
      // مسافة قبل علامة الترقيم بدل ما بعدها
      .replace(/\s+([،؛:؟!])(?=\S)/g, '$1 ')
      .replace(/\s+([،؛:؟!.])(?=\s|$)/g, '$1')
      // مسافة داخل القوسين
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      /*
       * علامة ترقيم بلا مسافة بعدها («خصم.ويمكن»، «التخطيط:هو») —
       * خطأ طباعة شائع. نقيّده بحرفين عربيين على الجانبين حتى لا
       * نمسّ الأرقام (٥٠.٥) ولا الروابط.
       */
      .replace(new RegExp(`([${AR_LETTER}])([.:،؛!؟])(?=[${AR_LETTER}])`, 'g'), '$1$2 ')
      // قوس أو علامة تنصيص ملتصقة بالكلمة المجاورة
      .replace(new RegExp('([)\\]»”])(?=[' + AR_LETTER + '])', 'g'), '$1 ')
      .replace(new RegExp(`([${AR_LETTER}])(?=[([«“])`, 'g'), '$1 ')
      // نقطة أو شرطة تائهة في مطلع الفقرة (بقايا ترقيم قائمة)
      .replace(/^[.·]\s+/, '')
  );
}

const squash = (s) => repairSpacing(stripBidi(s).replace(/\s+/g, ' ')).trim();

const toLatinDigits = (s) =>
  s.replace(/[٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c - (c >= 0x06f0 ? 0x06f0 : 0x0660));
  });

/** تطبيع للمقارنة فقط */
const normLoose = (s) =>
  toLatinDigits(stripBidi(s))
    .replace(new RegExp(`[${COMBINING}ـ]`, 'g'), '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();

const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;

/* ---------------------------------------------------------------
   تمييز مقدّمة الكتاب (الغلاف والفهرس المطبوع)
   ---------------------------------------------------------------
   الصفحات الأولى في ملف Word هي الغلاف (العنوان، «تأليف …») ثم
   فهرس مطبوع بأرقام صفحات الورق. الفهرس لا يفيدنا — ترقيمنا مختلف
   وسنبني الفهرس من عناوين المتن — فنقتطعه ونستخرج منه العنوان فقط.
*/
const INTRO_HEADING = /^(ال)?مقدمة$/;
const TOC_HEADING = /^(ال)?فهرس$/;
/** مدخل فهرس مطبوع: «عنوان الفصل صفحة 12» */
const TOC_ENTRY = /صفحة\s*\d+\s*$/;
const BYLINE = /^(تأليف|الكاتب|بقلم|للكاتب|المؤلف)\s*[:\-]?\s*/;

function splitFrontMatter(paragraphs) {
  const introIndex = paragraphs.findIndex((p) => INTRO_HEADING.test(squash(p.text)));
  // لا مقدمة معنونة: المتن يبدأ عند أول فقرة طويلة حقيقية
  const bodyStart =
    introIndex !== -1 ? introIndex : paragraphs.findIndex((p) => squash(p.text).length > 220);

  return {
    front: paragraphs.slice(0, Math.max(bodyStart, 0)),
    body: paragraphs.slice(Math.max(bodyStart, 0)),
  };
}

/** العنوان والعنوان الفرعي من صفحة الغلاف */
function extractTitle(front, fallback) {
  const lines = front
    .map((p) => squash(p.text))
    .filter(Boolean)
    .filter((t) => !BYLINE.test(t) && !t.includes(AUTHOR_NAME))
    .filter((t) => !TOC_HEADING.test(t) && !TOC_ENTRY.test(toLatinDigits(t)));

  const title = lines[0] ? lines[0].replace(/\s*[-]\s*$/, '').trim() : fallback;
  // ما بعد العنوان على الغلاف وقبل الفهرس = عنوان فرعي/وصف
  const subtitle = lines.slice(1, 3).join(' — ').trim() || null;
  return { title, subtitle };
}

/* ---------------------------------------------------------------
   تصنيف الفقرات
   ---------------------------------------------------------------
   المؤلف يميّز عناوينه بالتوسيط أو بالخطّ العريض. نعتمد ذلك، ثم
   نتحقّق بشرط بنيوي: العنوان يتبعه نصّ متن طويل. هذا يستبعد
   العبارات العريضة داخل الجُمل وخلايا الجداول ومداخل القوائم.

   • h = عنوان فصل (يدخل الفهرس ويبدأ صفحة جديدة)
   • s = عنوان فرعي (بارز في المتن، خارج الفهرس)
   • p = فقرة
*/
const MAX_HEADING_CHARS = 95;
/** ينتهي بنقطة أو فاصلة ⇒ جملة لا عنوان (نسمح بـ ؟ و ! فهي عناوين شائعة) */
const SENTENCE_END = /[.،؛]\s*$/;
const ENDS_WITH_COLON = /[:：]\s*$/;
/** الحدّ الأدنى لطول المتن الذي يلي العنوان حتى يُعدّ فصلاً */
const PROSE_AFTER_CHAPTER = 260;

function classify(body) {
  /*
   * كسر السطر اليدوي داخل الفقرة = فقرة عند المؤلف (يستعمله لبنود
   * القوائم). نفصله فقرةً مستقلة ترث تنسيق أصلها.
   */
  const segments = body.flatMap((p) =>
    p.text.split('\n').map((line) => ({ ...p, text: squash(line) }))
  );

  const items = segments
    .filter((p) => p.text.length > 0)
    // بقايا الفهرس المطبوع إن تسرّبت إلى المتن
    .filter((p) => !(p.text.length < 110 && TOC_ENTRY.test(toLatinDigits(p.text))))
    .filter((p) => !TOC_HEADING.test(p.text));

  /** مجموع أطوال أوّل ثلاث فقرات تالية — مقياس «هل يليه متن؟» */
  const proseAfter = (index) => {
    let total = 0;
    for (let i = index + 1, seen = 0; i < items.length && seen < 3; i++) {
      const { text } = items[i];
      if (text.length <= MAX_HEADING_CHARS) continue; // عنوان آخر أو سطر قصير
      total += text.length;
      seen++;
    }
    return total;
  };

  const blocks = items.map((p, i) => {
    const marked = p.bold || p.align === 'center' || /^(Title|Heading)/.test(p.style ?? '');
    const headingLike =
      marked &&
      !p.inTable &&
      !p.listItem &&
      p.text.length <= MAX_HEADING_CHARS &&
      !SENTENCE_END.test(p.text);

    if (!headingLike) return { t: 'p', x: p.text };

    // ينتهي بنقطتين ⇒ تصدير لقائمة أو تعريف، لا فصل
    if (ENDS_WITH_COLON.test(p.text) || proseAfter(i) < PROSE_AFTER_CHAPTER) {
      return { t: 's', x: p.text.replace(/\s*[:：]\s*$/, ' :'), centered: p.align === 'center' };
    }
    return { t: 'h', x: p.text, centered: p.align === 'center' };
  });

  /*
   * مستويان للعناوين: في بعض الكتب يوسّط المؤلف عناوين الفصول
   * ويكتفي بالخطّ العريض للعناوين الداخلية. نعتمد التوسيط فاصلاً
   * بين المستويين فقط حين يكون مستعملاً بانتظام (أغلب العناوين
   * موسّطة) — وإلا فالتوسيط عندئذٍ صدفة تنسيق لا دلالة مستوى،
   * فنترك كل العناوين فصولاً.
   */
  const candidates = blocks.filter((b) => b.t === 'h');
  const centered = candidates.filter((b) => b.centered).length;
  const useCentering = centered >= 6 && centered / candidates.length >= 0.6;

  return blocks.map(({ t, x, centered }) => ({
    t: t === 'h' && useCentering && !centered ? 's' : t,
    x,
  }));
}

/* ---------------------------------------------------------------
   توليد الصفحات
   --------------------------------------------------------------- */
function paginate(blocks) {
  const pages = [];
  let current = [];
  let words = 0;

  const flush = () => {
    if (current.length) pages.push({ n: pages.length + 1, blocks: current });
    current = [];
    words = 0;
  };

  for (const block of blocks) {
    // الفصل يفتتح صفحة — كما في الكتاب المطبوع
    if (block.t === 'h' && words >= MIN_WORDS_BEFORE_BREAK) flush();

    current.push(block);
    words += wordCount(block.x);

    // لا نقطع مباشرة بعد عنوان: يبقى العنوان مع مطلع فصله
    if (words >= WORDS_PER_PAGE && block.t === 'p') flush();
  }
  flush();

  // صفحة أخيرة يتيمة تُدمج بما قبلها
  if (pages.length > 1) {
    const last = pages[pages.length - 1];
    const lastWords = last.blocks.reduce((sum, b) => sum + wordCount(b.x), 0);
    if (lastWords < 40 && !last.blocks.some((b) => b.t === 'h')) {
      pages[pages.length - 2].blocks.push(...last.blocks);
      pages.pop();
    }
  }

  return pages;
}

/* ---------------------------------------------------------------
   النبذة — مقتطف من المقدمة، قابل للاستبدال يدوياً من الإعدادات
   --------------------------------------------------------------- */
function draftDescription(pages) {
  const paragraphs = pages
    .flatMap((page) => page.blocks)
    .filter((b) => b.t === 'p' && b.x.length > 80);
  return paragraphs.slice(0, 2).map((b) => b.x).join(' ').slice(0, 420).trim();
}

/* ---------------------------------------------------------------
   التنفيذ
   --------------------------------------------------------------- */
function processBook(entry) {
  const docxPath = path.join(BOOKS_DIR, entry.docx);
  if (!fs.existsSync(docxPath)) throw new Error(`ملف غير موجود: ${entry.docx}`);

  const { paragraphs, notes } = readDocx(docxPath);
  const { front, body } = splitFrontMatter(paragraphs);

  const extracted = extractTitle(front, path.parse(entry.docx).name);
  const title = entry.overrides?.title ?? extracted.title;
  const subtitle =
    entry.overrides?.subtitle !== undefined ? entry.overrides.subtitle : extracted.subtitle;

  const blocks = classify(body);

  // الحواشي تُلحق بآخر الكتاب كي لا تُفقد مراجع المؤلف
  if (notes.length) {
    blocks.push({ t: 'h', x: 'الحواشي والمراجع' });
    for (const note of notes) blocks.push({ t: 'p', x: squash(note) });
  }

  const pages = paginate(blocks);

  const chapters = [];
  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.t !== 'h') continue;
      chapters.push({
        title: block.x,
        page: page.n,
        anchorPage: page.n,
        headingText: block.x,
      });
    }
  }

  const words = blocks.reduce((sum, b) => sum + wordCount(b.x), 0);
  const pdf = pdfInfo(entry.slug);

  return {
    entry,
    subheadings: blocks.filter((b) => b.t === 's').map((b) => b.x),
    meta: {
      slug: entry.slug,
      title,
      subtitle,
      author: AUTHOR_NAME,
      sourceFile: entry.docx,
      accent: entry.accent,
      tags: entry.tags,
      order: entry.order,
      pageCount: pages.length,
      wordCount: words,
      readingMinutes: Math.max(1, Math.round(words / 165)),
      description: entry.overrides?.description ?? draftDescription(pages),
      chapters,
      tocConfidence: chapters.length >= 4 ? 'high' : 'low',
      titleConflict: null,
      /** ملف التنزيل — يُولَّد بـ `npm run pdf` */
      pdf,
    },
    pages,
  };
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
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(r.meta, null, 2), 'utf8');
      fs.writeFileSync(path.join(dir, 'pages.json'), JSON.stringify(r.pages), 'utf8');
    }
    const index = results.map((r) => {
      const { chapters, description, ...summary } = r.meta;
      return { ...summary, chapterCount: chapters.length };
    });
    fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
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
