/**
 * محرّك البحث الشامل
 * ---------------------------------------------------------------
 * يعمل كلّه في متصفّح الزائر: لا خادم بحث ولا خدمة خارجية ولا تتبّع
 * لما يبحث عنه أحد. فهرس كل كتاب ملفّ ثابت مولَّد وقت البناء
 * (`/search-index/<slug>`) يُنزَّل مرّة واحدة عند أوّل بحث ثم يبقى
 * في الذاكرة لبقيّة الجلسة.
 *
 * لماذا يكفي المسح المباشر بلا فهرس مقلوب؟ المكتبة ثمانية كتب
 * (~مليونا محرف)، ومطابقة نصّية عليها بعد التطبيع تستغرق أجزاء من
 * الثانية — أرخص من بناء فهرس مقلوب وشحنه وصيانته.
 */

import { findMatches, normalizeForSearch, type MatchRange } from './arabic';

/** `[رقم الصفحة، النوع، النصّ]` — 0 فقرة، 1 عنوان فصل، 2 عنوان فرعي */
export type IndexBlock = [number, 0 | 1 | 2, string];

export interface BookIndex {
  slug: string;
  title: string;
  subtitle: string | null;
  accent: string;
  author: string;
  order: number;
  pageCount: number;
  blocks: IndexBlock[];
}

/** الفهرس بعد التطبيع المسبق — التطبيع أثقل من المطابقة، فيُحسب مرّة */
export interface LoadedIndex extends BookIndex {
  norms: string[];
}

export interface Hit {
  slug: string;
  page: number;
  kind: 0 | 1 | 2;
  /** النصّ الأصلي كاملاً — الاقتطاف يُحسب عند العرض */
  text: string;
  score: number;
}

export interface BookResults {
  index: LoadedIndex;
  hits: Hit[];
  /** عدد الكتل المطابقة كلّها، حتى ما لم يُعرض منها */
  total: number;
}

export interface Query {
  /** العبارة كاملة مطبَّعة */
  phrase: string;
  /** كلماتها مفردة — تُستعمل حين لا تُطابق العبارة حرفياً */
  tokens: string[];
}

/** أقلّ طول لعبارة بحث معقولة بالعربية */
export const MIN_QUERY = 2;

export function parseQuery(raw: string): Query {
  const phrase = normalizeForSearch(raw);
  return { phrase, tokens: phrase.split(' ').filter(Boolean) };
}

/* ---------------------------------------------------------------- */
/* تنزيل الفهارس                                                     */
/* ---------------------------------------------------------------- */

const cache = new Map<string, Promise<LoadedIndex>>();

export function loadBookIndex(slug: string): Promise<LoadedIndex> {
  let pending = cache.get(slug);
  if (!pending) {
    pending = fetch(`/search-index/${slug}`)
      .then((response) => {
        if (!response.ok) throw new Error(`تعذّر تحميل فهرس ${slug}`);
        return response.json() as Promise<BookIndex>;
      })
      .then((index) => ({ ...index, norms: index.blocks.map((b) => normalizeForSearch(b[2])) }))
      .catch((error) => {
        // فشل التنزيل لا يجوز أن يبقى محفوظاً — المحاولة التالية تُعيد الطلب
        cache.delete(slug);
        throw error;
      });
    cache.set(slug, pending);
  }
  return pending;
}

/* ---------------------------------------------------------------- */
/* المطابقة والترتيب                                                 */
/* ---------------------------------------------------------------- */

/** عدد مرّات ورود عبارة داخل نصّ مطبَّع */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
}

/**
 * وزن الكتلة الواحدة.
 * العبارة الحرفية أثقل من تفرّق كلماتها، وعنوان الفصل أثقل من الفقرة
 * لأنه يدلّ على موضع الموضوع لا على مجرّد ذكره.
 *
 * `relaxed` يخفّف شرط اجتماع الكلمات — لا يُلجأ إليه إلا حين لا تعطي
 * المطابقة الصارمة شيئاً في المكتبة كلّها.
 */
function scoreBlock(norm: string, kind: 0 | 1 | 2, query: Query, relaxed: boolean): number {
  const phraseHits = countOccurrences(norm, query.phrase);
  let score = phraseHits * 10;

  if (!phraseHits) {
    // كل الكلمات مطلوبة — «الشيول الكوني» لا يطابق فقرة فيها «الكوني» وحدها
    let matched = 0;
    for (const token of query.tokens) {
      if (norm.includes(token)) matched++;
      else if (!relaxed) return 0;
    }
    if (!matched) return 0;
    score += matched * 2;
  }

  if (kind === 1) score *= 2.5;
  else if (kind === 2) score *= 1.5;

  // الكتلة القصيرة المطابِقة أدلّ من فقرة طويلة وردت فيها الكلمة عرضاً
  return score * (1 + 40 / (40 + norm.length));
}

export function searchIndex(
  index: LoadedIndex,
  query: Query,
  limit = 8,
  relaxed = false
): BookResults {
  const hits: Hit[] = [];

  for (let i = 0; i < index.blocks.length; i++) {
    const score = scoreBlock(index.norms[i], index.blocks[i][1], query, relaxed);
    if (score <= 0) continue;
    const [page, kind, text] = index.blocks[i];
    hits.push({ slug: index.slug, page, kind, text, score });
  }

  const total = hits.length;
  hits.sort((a, b) => b.score - a.score || a.page - b.page);
  return { index, hits: hits.slice(0, limit), total };
}

/** هل يطابق عنوان الكتاب أو عنوانه الفرعي أو وسومه؟ */
export function matchesBookTitle(haystack: string, query: Query): boolean {
  const norm = normalizeForSearch(haystack);
  if (norm.includes(query.phrase)) return true;
  return query.tokens.length > 1 && query.tokens.every((token) => norm.includes(token));
}

/* ---------------------------------------------------------------- */
/* الاقتطاف والتظليل                                                 */
/* ---------------------------------------------------------------- */

/** مواضع كل مصطلحات البحث داخل نصّ أصلي، مرتّبة وغير متداخلة */
export function highlightRanges(text: string, query: Query): MatchRange[] {
  let ranges = findMatches(text, query.phrase);
  if (!ranges.length && query.tokens.length > 1) {
    ranges = query.tokens.flatMap((token) => findMatches(text, token, 8));
  }
  if (ranges.length < 2) return ranges;

  ranges.sort((a, b) => a.start - b.start);
  const merged: MatchRange[] = [{ ...ranges[0] }];
  for (const range of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

export interface Snippet {
  text: string;
  /** مواضع التظليل داخل `text` بعد الاقتطاف */
  ranges: MatchRange[];
  before: boolean;
  after: boolean;
}

/** نافذة حول أوّل مطابقة، مقصوصة عند حدود الكلمات */
export function makeSnippet(text: string, ranges: MatchRange[], radius = 130): Snippet {
  const window = radius * 2;
  if (text.length <= window || !ranges.length) {
    return {
      text: text.slice(0, window),
      ranges: ranges.filter((range) => range.end <= window),
      before: false,
      after: text.length > window,
    };
  }

  const first = ranges[0];
  let start = Math.max(0, first.start - radius);
  let end = Math.min(text.length, Math.max(first.end + radius, start + window));

  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space !== -1 && space < first.start) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > first.end) end = space;
  }

  return {
    text: text.slice(start, end),
    ranges: ranges
      .filter((range) => range.start >= start && range.end <= end)
      .map((range) => ({ start: range.start - start, end: range.end - start })),
    before: start > 0,
    after: end < text.length,
  };
}

export interface TextPart {
  text: string;
  hit: boolean;
}

/** تقطيع نصّ إلى قطع مظلَّلة وغير مظلَّلة — يستهلكها العارض مباشرة */
export function splitByRanges(text: string, ranges: MatchRange[]): TextPart[] {
  if (!ranges.length) return [{ text, hit: false }];

  const parts: TextPart[] = [];
  let at = 0;
  for (const range of ranges) {
    if (range.start > at) parts.push({ text: text.slice(at, range.start), hit: false });
    parts.push({ text: text.slice(range.start, range.end), hit: true });
    at = range.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
}

/** يُستعمل في القارئ: تظليل نصّ كامل بعبارة خام قادمة من الرابط */
export function highlightText(text: string, rawQuery: string): TextPart[] {
  const query = parseQuery(rawQuery);
  if (query.phrase.length < MIN_QUERY) return [{ text, hit: false }];
  return splitByRanges(text, highlightRanges(text, query));
}
