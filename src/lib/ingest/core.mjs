/**
 * نواة الاستخراج — من ملف Word إلى محتوى الموقع
 * ===============================================================
 * هذه الوحدة نصّية خالصة: تأخذ بايتات ملف Word وتُعيد كائنات
 * JavaScript. لا تقرأ من القرص ولا تكتب عليه ولا تعرف أين ستُحفظ
 * النتيجة — ولهذا يستطيع استيرادها كلٌّ من:
 *
 *   • `scripts/ingest.mjs`  — يقرأ من books/ ويكتب في content/
 *   • لوحة الإدارة          — تُعالج ملفاً مرفوعاً في الذاكرة، ثم
 *                             تحفظ النتيجة على القرص أو تُودعها
 *                             في مستودع GitHub
 *
 * خطّ معالجة واحد لا اثنان: الكتاب المضاف من اللوحة يمرّ بنفس
 * الشيفرة التي مرّ بها كل كتاب في المكتبة، فلا يتفرّع السلوك.
 *
 * لماذا .docx وليس .pdf؟
 *   الـ PDF ناتج طباعة: يُقحم محارف التطويل داخل الكلمات لضبط
 *   المحاذاة، ويكسر الفقرات أسطراً، وقد يعكس رباط لام-ألف. أما
 *   ملف Word فهو النصّ الذي كتبه المؤلف وصحّحه — نظيف، ويحمل
 *   تنسيق العناوين بنفسه فيغنينا عن استنتاجها من فهرس مطبوع.
 *
 * الترقيم: ملف Word لا يحمل فواصل صفحات، فنولّد الصفحات بميزانية
 * كلمات ثابتة (`WORDS_PER_PAGE`) ونبدأ صفحة جديدة عند كل فصل. رقم
 * الصفحة عندنا مرجع قراءة داخل الموقع لا وعد بمطابقة الورق.
 */

import { readDocxBuffer } from './docx.mjs';

/** كلمات الصفحة المولّدة — قريبة من متوسّط صفحة الكتاب المطبوع */
export const WORDS_PER_PAGE = 150;
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
function extractTitle(front, fallback, authorName) {
  const lines = front
    .map((p) => squash(p.text))
    .filter(Boolean)
    .filter((t) => !BYLINE.test(t) && !t.includes(authorName))
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
   بناء الكتاب
   --------------------------------------------------------------- */

/**
 * يحوّل بايتات ملف Word إلى بيانات الكتاب وصفحاته.
 *
 * @param {object}      options
 * @param {object}      options.entry       مدخلة السجلّ (slug، docx، accent، tags، order، overrides)
 * @param {Buffer|Uint8Array} options.buffer بايتات ملف .docx
 * @param {string}      options.authorName  اسم المؤلف — يُنظَّف من الغلاف ويُكتب في البيانات
 * @param {{path: string, bytes: number} | null} [options.pdf] ملف التنزيل إن وُجد
 */
export function buildBook({ entry, buffer, authorName, pdf = null }) {
  const { paragraphs, notes } = readDocxBuffer(buffer);
  const { front, body } = splitFrontMatter(paragraphs);

  const extracted = extractTitle(front, entry.slug, authorName);
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

  return {
    subheadings: blocks.filter((b) => b.t === 's').map((b) => b.x),
    meta: {
      slug: entry.slug,
      title,
      subtitle,
      author: authorName,
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
      /** ملف التنزيل — يُولَّد بـ `npm run pdf` أو يُرفع من اللوحة */
      pdf,
    },
    pages,
  };
}

/**
 * ملخّص الكتاب كما يظهر في `content/index.json` — كل شيء عدا الفهرس
 * والنبذة (لا تُحمَّل مع صفحة المكتبة).
 */
export function summarize(meta) {
  const { chapters, description, ...summary } = meta;
  return { ...summary, chapterCount: chapters.length };
}
