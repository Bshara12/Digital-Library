/**
 * معجم عربي مرجعي للتحقّق من الكلمات
 * ===============================================================
 * مبني على معجم ayaspell المفتوح (عبر حزمة @cspell/dict-ar).
 * يُستعمل وقت الاستخراج فقط — لا يدخل حزمة الموقع ولا يؤثّر في
 * حجمه أو سرعته، ولا يكلّف شيئاً.
 *
 * دوره: الحكم على ما إذا كانت الكلمة عربية صحيحة. هذا أدقّ بكثير من
 * التكرار الإحصائي وحده، ويعمل في الاتجاهين:
 *   • يؤكّد التصحيح  (البديل كلمة معروفة)
 *   • يمنع التصحيح  (الأصل كلمة معروفة، فلا تُمسّ)
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** معجم فارغ يعمل كبديل صامت إن لم تتوفّر الحزمة */
const EMPTY = { has: () => false, available: false, size: 0 };

export async function loadArabicDictionary() {
  /*
   * الحزمة تقيّد `exports` فلا يمكن حلّ مسار ar.trie.gz عبر
   * require.resolve مباشرة — نبحث عنه في مسارات node_modules.
   */
  const triePath = require.resolve
    .paths('@cspell/dict-ar')
    ?.map((dir) => path.join(dir, '@cspell', 'dict-ar', 'ar.trie.gz'))
    .find((p) => fs.existsSync(p));

  if (!triePath) {
    console.warn('    [!] @cspell/dict-ar غير مثبّتة — سيعتمد الإصلاح على المعجم الداخلي وحده.');
    return EMPTY;
  }

  const { importTrie, Trie } = await import('cspell-trie-lib');
  const text = zlib.gunzipSync(fs.readFileSync(triePath)).toString('utf8');
  const trie = new Trie(importTrie(text.split('\n')));

  /*
   * ذاكرة نتائج: خوارزمية الإصلاح تستعلم عن الكلمة نفسها آلاف
   * المرّات عبر الدورات الأربع، والاستعلام في الشجرة ليس مجانياً.
   */
  const cache = new Map();

  return {
    available: true,
    has(word) {
      let hit = cache.get(word);
      if (hit === undefined) {
        hit = trie.has(word);
        cache.set(word, hit);
      }
      return hit;
    },
  };
}
