/**
 * إصلاح تشويه التطويل (kashida)
 * ===============================================================
 * المشكلة
 * -------
 * بعض ملفات الكتب تستعمل خطاً يمدّ الحروف لضبط المحاذاة، لكن جدول
 * ToUnicode داخل الملف يربط glyph التمديد بحرف عربي حقيقي بدل محرف
 * التطويل. فيخرج النص مشوّهاً:
 *
 *     «لتسليط الضوء»  ←  «لتسلليط الضلوء»      (حرف ل دخيل)
 *     «شغلت وسائل»    ←  «شغغلت وسغائل»        (حرف غ دخيل)
 *
 * هذا عطل في الملف المصدر لا في الاستخراج: جرّبنا pdftotext و
 * pdfjs-dist و PyMuPDF فأعطت النتيجة الفاسدة نفسها.
 *
 * الحل
 * ----
 * ستة من الكتب الثمانية سليمة، وتوفّر معجماً عربياً من ~١٦٠ ألف كلمة
 * من كتابة المؤلف نفسه. نستعمله للحكم: كلمة تحوي الحرف الدخيل ولا
 * وجود لها في المعجم، لكن حذف بعض مواضع ذلك الحرف يعطي كلمة معروفة
 * وشائعة — تُصحَّح. وإلا تُترك كما هي.
 *
 * القاعدة محافِظة عمداً: لا نغيّر كلمة إلا إذا كان البديل أكثر شيوعاً
 * بفارق واضح. ما لا نستطيع الجزم به يبقى على حاله.
 */

/**
 * الحروف المرشّحة لأن تكون حرف التمديد الدخيل.
 *
 * حروف العلّة (ا، و، ي) مستثناة عمداً: حذف واحد منها من كلمة عربية
 * صحيحة يعطي كلمة صحيحة أخرى في أغلب الأحيان («الأمور» ← «المور»،
 * «أفاميا» ← «أفاميا» منقوصة، «كتاب» ← «كتب»)، فيفقد المعجم قدرته
 * على التمييز وتتحوّل الخوارزمية إلى مصدر إفساد. احتمال أن يربط خطٌّ
 * رمزَ التطويل بحرف علّة أضعف بكثير من ضرر هذه الإصابات الكاذبة.
 */
const CANDIDATES = 'لغعحمسشصضطظفقكهبتثنءأإآئؤرزدذ'.split('');

/**
 * عتبتان منفصلتان عمداً:
 *   PROTECT — كلمة بهذا التكرار فأكثر تُعتبر صحيحة ولا تُمسّ إطلاقاً.
 *   ACCEPT  — أقل تكرار للبديل حتى نقبله بديلاً.
 * فصلهما ضروري: الكلمة المشوّهة موجودة في المتن (تكرارها ≥ ١)، فلو
 * وحّدناهما لحمَينا التشويه من الإصلاح.
 */
const STRICT = { protect: 3, accept: 3, ratio: 4 };

/**
 * بعد تأكيد أن كتاباً يُقحم حرفاً بعينه (مئات التصحيحات الناجحة)،
 * يصبح الاحتمال المسبق قوياً بما يكفي لتخفيف العتبات في ذلك الكتاب
 * وحده — مع بقاء حماية الكلمات الشائعة كما هي.
 */
const CONFIRMED = { protect: 3, accept: 1, ratio: 1 };

/** عدد التصحيحات التي تُعتبر بعدها إصابة الكتاب مؤكَّدة */
const CONFIRM_AT = 400;

const ARABIC_WORD = /[ء-ي]{2,}/g;

/** بناء معجم التكرارات من كل نصوص الكتب */
export function buildLexicon(allPagesByBook) {
  const lexicon = new Map();
  for (const pages of allPagesByBook) {
    for (const paragraphs of pages) {
      for (const para of paragraphs) {
        for (const word of para.match(ARABIC_WORD) ?? []) {
          lexicon.set(word, (lexicon.get(word) ?? 0) + 1);
        }
      }
    }
  }
  return lexicon;
}

/** كل الصيغ الممكنة بعد حذف مجموعة جزئية من مواضع الحرف `ch` */
function deletionVariants(word, ch) {
  const positions = [];
  /*
   * قيد جوهري: التطويل محرف وصل بين حرفين، فلا يقع أبداً في أول
   * الكلمة ولا في آخرها. بدونه تحذف الخوارزمية واو العطف وباء الجر
   * («وقال» ← «قال») لأن الناتج كلمة شائعة في المعجم.
   */
  for (let i = 1; i < word.length - 1; i++) if (word[i] === ch) positions.push(i);
  // أكثر من ٥ مواضع يعني انفجاراً في الاحتمالات — ونادر جداً
  if (positions.length === 0 || positions.length > 5) return [];

  const variants = [];
  const total = 1 << positions.length;
  // نبدأ من ١ لتخطّي «لا حذف» (وهي الكلمة الأصلية)
  for (let mask = 1; mask < total; mask++) {
    const drop = new Set();
    let removed = 0;
    for (let b = 0; b < positions.length; b++) {
      if (mask & (1 << b)) {
        drop.add(positions[b]);
        removed++;
      }
    }
    let out = '';
    for (let i = 0; i < word.length; i++) if (!drop.has(i)) out += word[i];
    if (out.length >= 2) variants.push({ word: out, removed });
  }
  /*
   * الأقلّ حذفاً أولاً: التطويل قصير عادةً، والحذف الزائد يأكل حروفاً
   * أصلية («شغغلت» ← «شلت» بدل «شغلت» لأن كليهما كلمة عربية صحيحة).
   */
  variants.sort((a, b) => a.removed - b.removed);
  return variants;
}

/**
 * طيّ التكرارات: لا توجد كلمة عربية فيها الحرف نفسه ثلاث مرات
 * متتالية، فكل تكرار ثلاثي فأكثر هو تمديد مؤكّد — يُطوى إلى حرف
 * واحد بلا حاجة إلى المعجم. أما التكرار الثنائي («الله») فمشروع،
 * ويُترك لحكم المعجم.
 */
export function collapseTriples(word, ch) {
  const run = new RegExp(`(?<=.)${ch}{3,}(?=.)`, 'g');
  return word.replace(run, ch);
}

const NO_DICT = { has: () => false, available: false };

/** أفضل تصحيح لكلمة، أو null إن لم يكن هناك بديل مقنع */
function repairWord(word, ch, lexicon, level = STRICT, dict = NO_DICT) {
  // (١) المعجم المرجعي حارس أول: كلمة عربية صحيحة لا تُمسّ إطلاقاً
  if (dict.has(word)) return null;

  const original = lexicon.get(word) ?? 0;
  /*
   * حماية بالتكرار — بديل يُستعمل فقط حين لا يتوفّر معجم مرجعي.
   * مع المعجم تصبح ضارّة: التشويه منهجي فتتكرّر الصيغة الفاسدة
   * («التواصغل») مرّات كافية لتحتمي بها من الإصلاح.
   */
  if (!dict.available && original >= level.protect) return null;

  // (٢) التكرارات الثلاثية تُطوى بلا شرط
  const folded = collapseTriples(word, ch);

  /*
   * (٣) بديل يعترف به المعجم = دليل قاطع، لا يحتاج عتبة تكرار.
   * عند تعدّد البدائل المعترف بها نرجّح الأشيع في كتب المؤلف.
   */
  let dictBest = null;
  let dictBestRemoved = Infinity;
  let dictBestFreq = -1;
  let freqBest = null;
  let freqBestCount = 0;

  for (const { word: variant, removed } of deletionVariants(folded, ch)) {
    const freq = lexicon.get(variant) ?? 0;
    if (dict.has(variant)) {
      // أقلّ حذفاً أولاً، ثم الأشيع في كتب المؤلف عند التساوي
      if (removed < dictBestRemoved || (removed === dictBestRemoved && freq > dictBestFreq)) {
        dictBestRemoved = removed;
        dictBestFreq = freq;
        dictBest = variant;
      }
    }
    if (freq > freqBestCount) {
      freqBestCount = freq;
      freqBest = variant;
    }
  }

  if (dictBest) return dictBest;

  // (٤) لا شهادة من المعجم — نعود إلى ترجيح التكرار
  if (freqBest && freqBestCount >= level.accept && freqBestCount >= (original + 1) * level.ratio)
    return freqBest;

  // (٥) طيّ التكرار وحده تحسين مؤكّد حتى دون بديل معروف
  return folded !== word ? folded : null;
}

/**
 * تحديد حرف التمديد الدخيل في كتاب: الحرف الذي يُصلح حذفُه أكبر عدد
 * من الكلمات المجهولة. نُرجع null إن كان الكتاب سليماً.
 */
export function detectStretchChar(pages, lexicon, dict = NO_DICT, exclude = []) {
  const unknown = new Map();
  for (const paragraphs of pages) {
    for (const para of paragraphs) {
      for (const word of para.match(ARABIC_WORD) ?? []) {
        if (dict.has(word)) continue; // كلمة صحيحة — ليست مرشّحة للتشويه
        if ((lexicon.get(word) ?? 0) < STRICT.protect) unknown.set(word, (unknown.get(word) ?? 0) + 1);
      }
    }
  }

  let bestChar = null;
  let bestScore = 0;
  for (const ch of CANDIDATES) {
    if (exclude.includes(ch)) continue;
    let score = 0;
    for (const [word, count] of unknown) {
      if (!word.includes(ch)) continue;
      if (repairWord(word, ch, lexicon, STRICT, dict)) score += count;
    }
    if (score > bestScore) {
      bestScore = score;
      bestChar = ch;
    }
  }

  // عتبة: أقل من ١٥٠ كلمة قابلة للإصلاح = ضجيج طبيعي لا تشويه منهجي
  return bestScore >= 150 ? { char: bestChar, fixable: bestScore } : null;
}

/** تطبيق الإصلاح على نصّ واحد */
export function repairText(text, ch, lexicon, stats, level = STRICT, dict = NO_DICT) {
  return text.replace(ARABIC_WORD, (word) => {
    if (!word.includes(ch)) return word;
    const fixed = repairWord(word, ch, lexicon, level, dict);
    if (!fixed) return word;
    if (stats) {
      stats.repaired++;
      if (stats.samples.length < 12 && !stats.seen.has(word)) {
        stats.seen.add(word);
        stats.samples.push(`${word} ← ${fixed}`);
      }
    }
    return fixed;
  });
}

/** إصلاح كتاب كامل — يُرجع الصفحات المصلَحة وإحصاءً للتقرير */
/**
 * إصلاح كتاب كامل.
 * ---------------------------------------------------------------
 * `aggressive` يُفعَّل بعد أن يثبت أن الكتاب مصاب فعلاً، فيخفّف
 * العتبات. ونعيد الكشف في كل دورة عمداً: خطوط هذه الملفات تخلط
 * أكثر من رمز واحد، فبعد إصلاح الحرف الأسوأ يظهر الذي يليه.
 */
export function repairBook(pages, lexicon, known = [], dict = NO_DICT) {
  /*
   * الرموز المؤكَّدة من دورات سابقة تُطبَّق دائماً وبعتبات مخفّفة،
   * ثم نبحث عن رمز جديد لم يُكتشف بعد — فخطوط هذه الملفات قد تخلط
   * أكثر من رمز، ولا يظهر التالي إلا بعد إصلاح الأسوأ.
   */
  const fresh = detectStretchChar(pages, lexicon, dict, known)?.char ?? null;
  const chars = [...known, ...(fresh ? [fresh] : [])];
  if (chars.length === 0) return { pages, report: null };

  const stats = { repaired: 0, samples: [], seen: new Set() };
  let out = pages;
  for (const ch of chars) {
    const level = known.includes(ch) ? CONFIRMED : STRICT;
    out = out.map((paragraphs) =>
      paragraphs.map((para) => repairText(para, ch, lexicon, stats, level, dict))
    );
  }

  return { pages: out, report: { chars, repaired: stats.repaired, samples: stats.samples } };
}

export { CONFIRM_AT };
