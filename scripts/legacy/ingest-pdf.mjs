/**
 * [متقاعد] سكربت الاستخراج القديم — من ملفات PDF
 * ===============================================================
 * استُبدل بـ scripts/ingest.mjs الذي يقرأ ملفات Word (.docx): المؤلف
 * صحّح النصّ في ملفات Word، وهي أصل النصّ لا ناتج طباعته. يُحفظ هذا
 * الملف للرجوع إليه فقط ولا يُشغّل.
 *
 * سكربت الاستخراج — يحوّل ملفات PDF إلى محتوى الموقع
 * ===============================================================
 * يُشغَّل محلياً فقط (`npm run ingest`)، ومخرجاته تُرفع مع المشروع.
 * لا يعمل وقت البناء على Vercel ولا يحتاج أي خدمة خارجية.
 *
 * لماذا pdftotext وليس pdfjs؟
 *   pdf.js يعكس رباط «لام-ألف» في هذه الملفات فيُخرج نصاً فاسداً:
 *   «والأساطير» ← «واألساطير» ، «الله» ← «هللا».
 *   pdftotext (Xpdf/Poppler) يفكّ الرباط بشكل صحيح.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BOOKS, AUTHOR_NAME } from '../books.config.mjs';
import { buildLexicon, repairBook, CONFIRM_AT } from './repair-kashida.mjs';
import { loadArabicDictionary } from './arabic-dictionary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOKS_DIR = path.join(ROOT, 'books');
const OUT_DIR = path.join(ROOT, 'content');
const REPORT_ONLY = process.argv.includes('--report-only');

/* ---------------------------------------------------------------
   أدوات النص العربي (نسخة مستقلة من src/lib/arabic.ts)
   --------------------------------------------------------------- */
const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩؜]/g;
const stripBidi = (s) => s.replace(BIDI_CONTROLS, '');
/**
 * إصلاح تباعد ناتج عن الاستخراج
 * ---------------------------------------------------------------
 * pdftotext يفصل أحياناً علامة التشكيل عن حرفها («أسا ًسا» بدل
 * «أساسًا»)، ويضع مسافة قبل علامة الترقيم بدل ما بعدها. الإصلاحان
 * أدناه لا يمسّان الحروف نفسها — فقط المسافات حولها.
 */
const COMBINING = 'ؐ-ًؚ-ٰٟۖ-ۭ';
function repairSpacing(s) {
  return (
    s
      /*
       * علامة تشكيل مفصولة بمسافة = علامة وردت في موضع خاطئ في أصل
       * الملف («أسا ًسا» والصواب «أساسًا»)، فلصقها بما قبلها ينتج
       * خطأً ظاهراً. نحذفها — والنص العربي غير المشكول صحيح تماماً.
       * أما التشكيل الملتصق بحرفه أصلاً فيبقى كما هو.
       */
      .replace(new RegExp(`\\s+[${COMBINING}]+`, 'g'), '')
      // التطويل محرف محاذاة بصري بحت — حذفه لا يمسّ المعنى
      .replace(/ـ/g, '')
      // مسافة قبل الفاصلة/النقطة/الفاصلة المنقوطة بدل ما بعدها
      .replace(/\s+([،؛])(?=\S)/g, '$1 ')
      .replace(/\s+([،؛.])(?=\s|$)/g, '$1')
  );
}

const squash = (s) => repairSpacing(stripBidi(s).replace(/\s+/g, ' ')).trim();
const toLatinDigits = (s) =>
  s.replace(/[٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c - (c >= 0x06f0 ? 0x06f0 : 0x0660));
  });

/** تطبيع للمقارنة فقط — لمطابقة عناوين الفهرس بعناوين المتن */
const normLoose = (s) =>
  toLatinDigits(stripBidi(s))
    .replace(/[ؐ-ًؚ-ٰٟـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();

/* ---------------------------------------------------------------
   استدعاء pdftotext
   --------------------------------------------------------------- */
function ensurePdftotext() {
  try {
    // ملاحظة: pdftotext من Xpdf يخرج بالكود 99 عند -v رغم نجاحه،
    // لذا المهم هو أن يُعثر على الملف التنفيذي لا رمز الخروج.
    execFileSync('pdftotext', ['-v'], { stdio: 'pipe' });
  } catch (err) {
    if (err.code !== 'ENOENT') return; // وُجدت الأداة، ورمز الخروج غير مهم
    console.error(
      '\n✖ الأداة pdftotext غير متوفرة.\n' +
        '  ثبّتها عبر Poppler:\n' +
        '    Windows : choco install poppler   أو   scoop install poppler\n' +
        '    macOS   : brew install poppler\n' +
        '    Linux   : sudo apt install poppler-utils\n'
    );
    process.exit(1);
  }
}

/**
 * أسماء الملفات عربية، وبعض إصدارات pdftotext تفشل معها على Windows.
 * الحل: نسخة مؤقتة باسم لاتيني.
 */
function extract(pdfPath, layout) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-'));
  const src = path.join(tmp, 'in.pdf');
  const dst = path.join(tmp, 'out.txt');
  fs.copyFileSync(pdfPath, src);

  const args = ['-enc', 'UTF-8', '-eol', 'unix'];
  if (layout) args.push('-layout');
  args.push(src, dst);
  execFileSync('pdftotext', args, { stdio: 'pipe' });

  const text = fs.readFileSync(dst, 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  return text.split('\f'); // صفحة لكل عنصر
}

/* ---------------------------------------------------------------
   تنظيف الصفحات
   --------------------------------------------------------------- */

/** الترويسة المتكرّرة = السطر الأول الأكثر تكراراً عبر الصفحات */
function detectRunningHeader(rawPages) {
  const tally = new Map();
  for (const raw of rawPages) {
    const first = raw.split('\n').map(squash).find(Boolean);
    if (!first || first.length > 90) continue;
    tally.set(first, (tally.get(first) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [line, count] of tally) {
    const looksLikeHeader = line.includes(AUTHOR_NAME) || count > rawPages.length * 0.5;
    if (looksLikeHeader && count > bestCount) {
      best = line;
      bestCount = count;
    }
  }
  return bestCount >= 3 ? { text: best, count: bestCount } : null;
}

const isPageNumberLine = (line) => /^\d{1,4}$/.test(toLatinDigits(line));

/**
 * تحويل صفحة خام إلى فقرات نظيفة.
 * pdftotext يجمع الفقرة الواحدة في سطر واحد ويفصل بين الفقرات بسطر
 * فارغ — لذا كل سطر غير فارغ ≈ فقرة.
 */
function cleanPage(raw, header) {
  const out = [];
  for (const line of raw.split('\n')) {
    const text = squash(line);
    if (!text) continue;
    if (header && text === header) continue;
    if (isPageNumberLine(text)) continue;
    if (header && text.length < header.length + 6 && normLoose(text) === normLoose(header)) continue;
    out.push(text);
  }
  return out;
}

/* ---------------------------------------------------------------
   استخراج العنوان الحقيقي من صفحة الغلاف
   --------------------------------------------------------------- */
const BYLINE = /^(تأليف|الكاتب|بقلم)\s*[:\-ـ]?\s*/;

function extractTitle(firstPageLines, fallback) {
  const lines = firstPageLines.filter((l) => !BYLINE.test(l) && !l.includes(AUTHOR_NAME));
  const title = lines[0] ? lines[0].replace(/\s*[-ـ]\s*$/, '').trim() : fallback;
  const subtitle = lines.slice(1).join(' — ').trim() || null;
  return { title, subtitle };
}

/* ---------------------------------------------------------------
   استخراج الفهرس
   ---------------------------------------------------------------
   العمودان (الأرقام والعناوين) غير متحاذيين رأسياً في الملف الأصلي،
   فلا يمكن مزاوجتهما سطراً بسطر. الحل: نجمع القائمتين بالترتيب
   المستقل ثم نزاوجهما، ونتحقّق بشرطين: تطابق العدد + تصاعد الأرقام.
*/
const TOC_HEADING = /^(ال)?فهرس$/;
const pageRefRe = () => /صفحة\s*(\d+)/g;

function extractToc(layoutPages, header) {
  let tocIndex = -1;
  for (let i = 0; i < Math.min(4, layoutPages.length); i++) {
    const flat = toLatinDigits(squash(layoutPages[i]));
    if (/فهرس/.test(flat) && pageRefRe().test(flat)) {
      tocIndex = i;
      break;
    }
  }
  if (tocIndex === -1)
    return { chapters: [], confidence: 'none', note: 'لم يُعثر على صفحة فهرس', pageIndex: -1 };

  // قد يمتد الفهرس لصفحتين
  const pagesToScan = [layoutPages[tocIndex]];
  const next = layoutPages[tocIndex + 1];
  if (next && pageRefRe().test(toLatinDigits(next))) pagesToScan.push(next);

  const numbers = [];
  /** كلمة «الفهرس» أحياناً عنوان زائد وأحياناً مدخل حقيقي يشير لصفحته */
  const withIndexEntry = [];
  const withoutIndexEntry = [];

  for (const page of pagesToScan) {
    for (const rawLine of page.split('\n')) {
      let line = toLatinDigits(stripBidi(rawLine));
      const re = pageRefRe();
      let m;
      while ((m = re.exec(line))) numbers.push(Number(m[1]));

      // في وضع -layout قد تلتصق الترويسة بأول مدخل في الفهرس
      if (header) line = line.split(header).join(' ');

      const remainder = squash(line.replace(pageRefRe(), ' '));
      if (!remainder) continue;
      if (header && normLoose(remainder) === normLoose(header)) continue;
      if (isPageNumberLine(remainder)) continue;

      withIndexEntry.push(remainder);
      if (!TOC_HEADING.test(remainder)) withoutIndexEntry.push(remainder);
    }
  }

  const monotonic = numbers.every((n, i) => i === 0 || n >= numbers[i - 1]);

  // نختار الصيغة التي يتطابق فيها عدد العناوين مع عدد الأرقام
  const titles =
    withoutIndexEntry.length === numbers.length
      ? withoutIndexEntry
      : withIndexEntry.length === numbers.length
        ? withIndexEntry
        : withoutIndexEntry;

  const matched = numbers.length === titles.length && numbers.length > 0;

  const chapters = [];
  const count = Math.min(numbers.length, titles.length);
  for (let i = 0; i < count; i++) chapters.push({ title: titles[i], page: numbers[i] });

  let confidence = 'low';
  const notes = [];
  if (matched && monotonic) confidence = 'high';
  else if (matched && !monotonic) {
    // العناوين مزدوجة بشكل صحيح، لكن الأرقام في الكتاب الأصلي غير مرتّبة
    confidence = 'high';
    const bad = numbers
      .map((n, i) => (i > 0 && n < numbers[i - 1] ? `«${titles[i]}» ← ${n}` : null))
      .filter(Boolean);
    notes.push(
      `أرقام الصفحات في فهرس الكتاب الأصلي غير تصاعدية (خطأ مطبعي في المصدر): ${bad.join('، ')}`
    );
  } else if (monotonic && Math.abs(numbers.length - titles.length) <= 2) confidence = 'medium';

  if (!matched)
    notes.push(`عدد الأرقام ${numbers.length} مقابل عدد العناوين ${titles.length}`);

  return {
    chapters,
    confidence,
    note: notes.length ? notes.join(' — ') : null,
    pageIndex: tocIndex,
  };
}

/* ---------------------------------------------------------------
   اكتشاف العناوين للكتب التي لا تحتوي فهرساً
   ---------------------------------------------------------------
   عنوان الفصل في هذه الملفات: سطر قصير، منفرد، لا ينتهي بعلامة
   ترقيم، ولا يبدأ بحرف عطف. النتيجة «مقترحة» وتُعرض للمراجعة.
*/
const STARTS_MID_SENTENCE = /^(و|ف|ثم|أما|لكن|كما|وقد|وفي|ومن|وهذا|وهو)\b/;
/** أي ترقيم أو رقم داخل السطر يعني أنه جزء من جملة لا عنوان */
const NOT_HEADING_CHARS = /[.،؛:؟!()[\]"»«0-9٠-٩]/;

function detectHeadings(pages) {
  const found = [];
  const seen = new Set();
  pages.forEach((paras, i) => {
    paras.forEach((text, j) => {
      if (text.length < 10 || text.length > 60) return;
      if (NOT_HEADING_CHARS.test(text)) return;
      if (STARTS_MID_SENTENCE.test(text)) return;
      // العنوان يسبق متناً: الفقرة التالية طويلة
      const next = paras[j + 1];
      if (!next || next.length < 150) return;
      const key = normLoose(text);
      if (!key || seen.has(key)) return;
      seen.add(key);
      found.push({ title: text, page: i + 1, suggested: true });
    });
  });
  return found;
}

/* ---------------------------------------------------------------
   تحقّق آلي: هل يقود كل فصل فعلاً إلى صفحته؟
   ---------------------------------------------------------------
   نبحث عن عنوان الفصل في نطاق ±3 صفحات حول الرقم المذكور في
   الفهرس. النتيجة تُعرض في تقرير المراجعة، ولو كان هناك إزاحة
   ثابتة بين ترقيم الكتاب وترقيم المستند فسنكتشفها هنا.
*/
const STOPWORDS = new Set(['في', 'من', 'الى', 'على', 'عند', 'عن', 'او', 'مع', 'بين', 'التي', 'الذي']);

/** كلمات دالّة مطبَّعة، بلا أدوات الربط */
function keyWords(text) {
  return new Set(
    stripBidi(text)
      .split(/\s+/)
      .map(normLoose)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

/**
 * نسبة كلمات العنوان الموجودة في مطلع الفقرة.
 * نقتصر على أول ١٤ كلمة لأن العنوان قد يكون اندمج مع أول فقرة في
 * الصفحة أثناء الاستخراج، فيظل مطلعها هو العنوان.
 */
function overlap(titleWords, paragraph) {
  if (titleWords.size === 0) return 0;
  const head = stripBidi(paragraph).split(/\s+/).slice(0, 14).join(' ');
  const words = keyWords(head);
  let hit = 0;
  for (const w of titleWords) if (words.has(w)) hit++;
  return hit / titleWords.size;
}

/**
 * صياغة العنوان في الفهرس تختلف غالباً عن صياغته في المتن
 * (مثال: «عند قدماء المصريين» في الفهرس ← «عند القدماء المصريين»
 * في المتن)، لذا نطابق بتشابه الكلمات لا بالنص الحرفي.
 */
function verifyChapters(chapters, pages, tocPageIndex) {
  const WINDOW = 2;
  const THRESHOLD = 0.6;
  const offsets = [];
  let matched = 0;

  for (const ch of chapters) {
    const words = keyWords(ch.title);
    if (words.size === 0) continue;

    let bestScore = 0;
    let bestOffset = null;
    let bestText = null;

    for (let d = -WINDOW; d <= WINDOW; d++) {
      const idx = ch.page - 1 + d;
      if (idx < 0 || idx >= pages.length) continue;
      if (idx === tocPageIndex) continue; // لا نطابق صفحة الفهرس نفسها
      for (const para of pages[idx]) {
        const score = overlap(words, para);
        // نُفضّل الصفحة المذكورة في الفهرس عند تساوي الدرجة
        if (score > bestScore || (score === bestScore && d === 0 && bestOffset !== 0)) {
          bestScore = score;
          bestOffset = d;
          bestText = para.length <= 120 ? para : null;
        }
      }
    }

    if (bestScore >= THRESHOLD) {
      matched++;
      offsets.push(bestOffset);
      ch.anchorPage = ch.page + bestOffset;
      ch.headingText = bestText;
    } else {
      ch.anchorPage = ch.page;
    }
  }

  const rate = chapters.length ? matched / chapters.length : 0;
  // الإزاحة الأشيع بين ترقيم الفهرس وترقيم المستند
  const tally = new Map();
  for (const o of offsets) tally.set(o, (tally.get(o) ?? 0) + 1);
  let offset = 0;
  let bestCount = 0;
  for (const [o, c] of tally) if (c > bestCount) [offset, bestCount] = [o, c];

  return { matched, total: chapters.length, rate, offset };
}

/* ---------------------------------------------------------------
   النبذة — مقتطف من المقدمة، للمراجعة والاستبدال يدوياً
   --------------------------------------------------------------- */
/** فقرة تحمل عدة إحالات «صفحة N» هي سطر فهرس لا نصّ متن */
const looksLikeToc = (p) => (toLatinDigits(p).match(/صفحة\s*\d+/g) ?? []).length >= 2;

function draftDescription(pages, tocPageIndex) {
  const usable = (i) => i !== tocPageIndex;

  // الأفضل: أول فقرتين بعد عنوان «مقدمة»
  for (let i = 0; i < Math.min(6, pages.length); i++) {
    if (!usable(i)) continue;
    const idx = pages[i].findIndex((p) => /^(ال)?مقدمة$/.test(p));
    if (idx !== -1) {
      const body = pages[i].slice(idx + 1).filter((p) => p.length > 60 && !looksLikeToc(p));
      if (body.length) return body.slice(0, 2).join(' ').slice(0, 420).trim();
    }
  }

  // البديل: أول فقرتين طويلتين من المتن، مع تجاوز صفحة الفهرس
  const flat = pages
    .filter((_, i) => usable(i))
    .flat()
    .filter((p) => p.length > 80 && !looksLikeToc(p));
  return flat.slice(0, 2).join(' ').slice(0, 420).trim();
}

/* ---------------------------------------------------------------
   التنفيذ
   --------------------------------------------------------------- */
/** المرحلة الأولى: استخراج وتنظيف — قبل بناء المعجم */
function extractBook(entry) {
  const pdfPath = path.join(BOOKS_DIR, entry.file);
  if (!fs.existsSync(pdfPath)) throw new Error(`ملف غير موجود: ${entry.file}`);

  const rawPages = extract(pdfPath, false);
  const layoutPages = extract(pdfPath, true);

  const header = detectRunningHeader(rawPages);
  const pages = rawPages.map((raw) => cleanPage(raw, header?.text ?? null));

  while (pages.length && pages[pages.length - 1].length === 0) pages.pop();

  return { entry, header, pages, layoutPages };
}

/** المرحلة الثانية: التحليل والتوليد — بعد إصلاح التطويل */
function processBook({ entry, header, pages, layoutPages, kashida }) {
  const extractedTitle = extractTitle(pages[0] ?? [], path.parse(entry.file).name);
  /*
   * أغلفة بعض الكتب تحمل أخطاء مطبعية أو تدمج العنوان بالعنوان
   * الفرعي. `overrides` في books.config.mjs هو المكان الوحيد
   * لتصحيح ذلك — دون لمس الملفات الأصلية ولا الكود.
   */
  const title = entry.overrides?.title ?? extractedTitle.title;
  const subtitle =
    entry.overrides?.subtitle !== undefined ? entry.overrides.subtitle : extractedTitle.subtitle;
  const toc = extractToc(layoutPages, header?.text ?? null);

  // الكتب بلا فهرس: نقترح عناوين من بنية المتن
  if (toc.chapters.length === 0) {
    toc.chapters = detectHeadings(pages);
    if (toc.chapters.length) {
      toc.confidence = 'suggested';
      toc.note = 'لا يحتوي الكتاب فهرساً — العناوين أدناه مستنتجة آلياً وتحتاج مراجعتك';
    }
  }

  /**
   * تعارض العنوان: العنوان على الغلاف قد يخالف الترويسة المتكرّرة
   * (خطأ مطبعي في المصدر). نرصده ونتركه لصاحب المشروع.
   */
  let titleConflict = null;
  if (header?.text) {
    const headerTitle = squash(
      header.text
        .replace(/[([]\s*عصام السالم\s*[)\]]/g, '')
        .replace(/[-ـ]?\s*عصام السالم/g, '')
    );
    if (headerTitle && normLoose(headerTitle) !== normLoose(title)) {
      titleConflict = headerTitle;
    }
  }

  const tocPageIndex = toc.pageIndex ?? -1;
  const verification = verifyChapters(toc.chapters, pages, tocPageIndex);

  /**
   * وسم عناوين الفصول في المتن — نعتمد النص الذي عثر عليه التحقّق
   * فعلاً في الصفحة، لا نص الفهرس (فالصياغتان تختلفان غالباً).
   */
  const headingKeys = new Set(
    toc.chapters.filter((c) => c.headingText).map((c) => normLoose(c.headingText))
  );
  const blocks = pages.map((paras, i) => ({
    n: i + 1,
    blocks: paras.map((text) => ({
      t: text.length < 120 && headingKeys.has(normLoose(text)) ? 'h' : 'p',
      x: text,
    })),
  }));

  const words = pages.flat().reduce((sum, p) => sum + p.split(/\s+/).filter(Boolean).length, 0);

  return {
    entry,
    header,
    toc,
    titleConflict,
    verification,
    kashida,
    meta: {
      slug: entry.slug,
      title,
      subtitle,
      author: AUTHOR_NAME,
      sourceFile: entry.file,
      accent: entry.accent,
      tags: entry.tags,
      order: entry.order,
      pageCount: blocks.length,
      wordCount: words,
      readingMinutes: Math.max(1, Math.round(words / 165)),
      description: draftDescription(pages, tocPageIndex),
      chapters: toc.chapters,
      tocConfidence: toc.confidence,
      titleConflict,
    },
    pages: blocks,
  };
}

async function main() {
  ensurePdftotext();
  console.log(`\n[*] استخراج ${BOOKS.length} كتب...\n`);

  const ordered = BOOKS.slice().sort((a, b) => a.order - b.order);

  // (١) استخراج وتنظيف كل الكتب
  const extracted = [];
  for (const entry of ordered) {
    process.stdout.write(`   - ${entry.file} ... `);
    try {
      const book = extractBook(entry);
      extracted.push(book);
      console.log(`${book.pages.length} صفحة`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }

  /*
   * (٢) معجم مشترك من كل الكتب، ثم إصلاح تشويه التطويل.
   * الكتب السليمة هي التي تُعلّم النظام الصيغة الصحيحة للكلمات
   * المشوّهة في الكتب المعطوبة — وكلها بقلم المؤلف نفسه.
   */
  console.log('\n[*] بناء المعجم وإصلاح تشويه التطويل...');

  // معجم عربي مرجعي خارجي — يؤكّد التصحيح ويحمي الكلمات الصحيحة
  const dict = await loadArabicDictionary();
  if (dict.available) console.log('    المعجم المرجعي (ayaspell): جاهز');

  /*
   * أربع دورات: كل كلمة تُصحَّح تدخل المعجم الداخلي فتتيح تصحيح
   * كلمات أخرى في الدورة التالية، حتى تتوقّف المكاسب.
   */
  const PASSES = 4;
  for (let pass = 1; pass <= PASSES; pass++) {
    const lexicon = buildLexicon(extracted.map((b) => b.pages));
    let totalFixed = 0;

    for (const book of extracted) {
      /*
       * حالما تتجاوز تصحيحات كتابٍ عتبة التأكيد، تصير إصابته مؤكّدة
       * فنخفّف عتباته — الاحتمال المسبق صار قوياً بما يكفي.
       */
      // الرموز التي ثبتت إصابة الكتاب بها تُطبَّق في كل دورة تالية
      const known = book.kashida && book.kashida.repaired >= CONFIRM_AT ? book.kashida.chars : [];

      const { pages, report } = repairBook(book.pages, lexicon, known, dict);
      book.pages = pages;
      if (report) {
        totalFixed += report.repaired;
        if (!book.kashida) {
          book.kashida = report;
        } else {
          book.kashida.repaired += report.repaired;
          book.kashida.chars = report.chars;
          if (book.kashida.samples.length < 12)
            book.kashida.samples.push(...report.samples.slice(0, 4));
        }
      }
    }

    console.log(`    دورة ${pass}: معجم ${lexicon.size} كلمة — أُصلحت ${totalFixed} كلمة`);
    if (totalFixed === 0) break;
  }

  for (const book of extracted) {
    if (book.kashida) {
      console.log(
        `    ${book.entry.file}: ${book.kashida.repaired} كلمة ` +
          `(الرموز الدخيلة: ${book.kashida.chars.map((c) => `«${c}»`).join(' ')})`
      );
    }
  }

  // (٣) التحليل والتوليد
  console.log('');
  const results = [];
  for (const book of extracted) {
    process.stdout.write(`   - ${book.entry.file} ... `);
    try {
      const r = processBook(book);
      results.push(r);
      console.log(
        `${r.meta.pageCount} صفحة | ${r.meta.wordCount} كلمة | ` +
          `فهرس: ${r.toc.chapters.length} فصل (${r.toc.confidence})`
      );
    } catch (err) {
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
}

/* ---------------------------------------------------------------
   ملف المراجعة — يُعرض على صاحب المشروع قبل الاعتماد
   --------------------------------------------------------------- */
function writeReport(results) {
  const L = [];
  L.push('# مراجعة بيانات الكتب المستخرَجة');
  L.push('');
  L.push('> وُلِّد آلياً بـ `npm run ingest`. راجع العناوين والنبذ والفهارس،');
  L.push('> وصحّح ما يلزم، ثم أبلغني لأعتمدها نهائياً.');
  L.push('');
  L.push('| # | العنوان المستخرَج | صفحات | كلمات | دقائق | فصول | ثقة الفهرس | تأكيد موضع العنوان |');
  L.push('|---|---|---|---|---|---|---|---|');
  results.forEach((r, i) => {
    const c = {
      high: 'عالية',
      medium: 'متوسطة',
      low: 'ضعيفة',
      none: 'لا فهرس',
      suggested: 'مستنتج',
    }[r.toc.confidence];
    L.push(
      `| ${i + 1} | ${r.meta.title} | ${r.meta.pageCount} | ${r.meta.wordCount} | ${r.meta.readingMinutes} | ${r.toc.chapters.length} | ${c} | ${Math.round(r.verification.rate * 100)}% |`
    );
  });
  L.push('');
  L.push('> **تأكيد موضع العنوان:** نسبة الفصول التي عُثر على نصّ عنوانها فعلاً');
  L.push('> في الصفحة التي يذكرها الفهرس. الفصول غير المؤكَّدة تنتقل إلى رقم');
  L.push('> الصفحة كما ورد في الفهرس — وقد تحقّقنا يدوياً من أن هذه الأرقام');
  L.push('> صحيحة، وأن سبب عدم التأكيد هو اختلاف صياغة العنوان بين الفهرس');
  L.push('> والمتن، أو اندماجه مع الفقرة التالية أثناء الاستخراج.');
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
    if (r.titleConflict) {
      L.push(
        `- **[!] تعارض في العنوان:** الغلاف يقول «${r.meta.title}» بينما ترويسة كل صفحة تقول ` +
          `«${r.titleConflict}». أيّهما نعتمد؟`
      );
    }
    L.push(
      `- **الترويسة المحذوفة:** ${r.header ? `\`${r.header.text}\` (في ${r.header.count} صفحة)` : '_لم تُكتشف_'}`
    );
    L.push(
      `- **تحقّق روابط الفصول:** ${r.verification.matched} من ${r.verification.total} ` +
        `عنوان وُجد فعلاً في صفحته` +
        (r.verification.offset !== 0 ? ` (بإزاحة ${r.verification.offset} صفحة)` : '')
    );
    if (r.kashida) {
      L.push(
        `- **[!] إصلاح تشويه التطويل:** الملف المصدر يُقحم الرموز ` +
          `${r.kashida.chars.map((c) => `«${c}»`).join(' و ')} ` +
          `داخل الكلمات لضبط المحاذاة. أُصلحت ${r.kashida.repaired} كلمة آلياً بالاعتماد ` +
          `على معجم مبني من كتبك السليمة. أمثلة: ${r.kashida.samples.slice(0, 6).join(' · ')}`
      );
    }
    L.push('');
    L.push('**النبذة المقترحة _(مقتطف آلي — يُستحسن استبدالها بنص من عندك)_:**');
    L.push('');
    L.push('> ' + (r.meta.description || '_تعذّر الاستخراج_'));
    L.push('');
    if (r.toc.note) L.push(`> **ملاحظة على الفهرس:** ${r.toc.note}`, '');
    if (r.toc.chapters.length) {
      L.push('**الفهرس المستخرَج:**');
      L.push('');
      L.push('| الفصل | الصفحة |');
      L.push('|---|---|');
      for (const ch of r.toc.chapters) L.push(`| ${ch.title} | ${ch.page} |`);
      L.push('');
    }
    L.push('---');
    L.push('');
  }

  const dir = path.join(OUT_DIR, 'review');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'BOOKS-REVIEW.md'), L.join('\n'), 'utf8');
  console.log(`[ok] ملف المراجعة: content/review/BOOKS-REVIEW.md\n`);
}

await main();
