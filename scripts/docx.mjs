/**
 * قارئ ملفات Word (.docx)
 * ===============================================================
 * ملف docx هو أرشيف ZIP يحتوي `word/document.xml`. لا نحتاج أي حزمة
 * خارجية: نفكّ الأرشيف بـ zlib (المضمّن في Node) ونقرأ الفقرات
 * بمطابقة نصّية مباشرة على XML.
 *
 * لماذا docx وليس PDF؟ الـ PDF ناتج طباعة: يُخرج نصاً مشوّهاً
 * (رباط لام-ألف، تطويل محاذاة مُقحم داخل الكلمات، فواصل أسطر
 * عشوائية). الـ docx هو النصّ الذي كتبه المؤلف فعلاً — نظيف،
 * ويحمل تنسيق العناوين بنفسه.
 */

import fs from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/* ---------------------------------------------------------------
   فكّ أرشيف ZIP
   ---------------------------------------------------------------
   نقرأ فهرس الأرشيف المركزي (End of Central Directory) لأنه المصدر
   الموثوق للأحجام — ترويسة الملف المحلّي قد تحمل أصفاراً حين يُكتب
   الحجم في «وصّاف البيانات» بعد المحتوى.
*/
const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

/** @returns {Map<string, Buffer>} اسم الملف داخل الأرشيف ← محتواه */
function unzip(filePath) {
  const buf = fs.readFileSync(filePath);

  // نبحث عن ترويسة النهاية من آخر الملف (قد يتبعها تعليق بطول ≤ 64KB)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('ليس ملف ZIP صالح (لم تُوجد ترويسة النهاية)');

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== CEN_SIG) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLength);

    // الترويسة المحلّية: 30 بايت ثابتة + الاسم + الحقول الإضافية
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buf.subarray(dataStart, dataStart + compressedSize);

    files.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/* ---------------------------------------------------------------
   قراءة XML
   --------------------------------------------------------------- */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/**
 * نصّ الفقرة.
 * `w:instrText` = شيفرة حقل (فهرس آلي، مرجع متقاطع) لا نصّ للقارئ،
 * فنتجاهله. `w:tab` تصير مسافة، أما `w:br` (كسر سطر يدوي) فتصير
 * سطراً جديداً: المؤلف يستعمله بديلاً عن فاصل الفقرة، وطمسه يلصق
 * بنود القوائم في فقرة واحدة.
 */
function paragraphText(xml) {
  let out = '';
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/?>|<w:noBreakHyphen\/>/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) out += decodeEntities(m[1]);
    else if (m[0].startsWith('<w:noBreakHyphen')) out += '-';
    else if (m[0].startsWith('<w:br')) out += '\n';
    else out += ' ';
  }
  return out;
}

/** خصائص الفقرة التي نحتاجها للتعرّف على العناوين */
function paragraphProps(xml) {
  const pPr = (xml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) ?? [''])[0];
  const runs = xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/g) ?? [];

  const isBoldTag = (s) => /<w:b\s*\/>|<w:b\s+w:val="(?:1|true|on)"/.test(s);
  const textRuns = (xml.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) ?? []).filter((r) =>
    /<w:t(?:\s[^>]*)?>/.test(r)
  );

  return {
    style: (xml.match(/<w:pStyle w:val="([^"]+)"/) ?? [])[1] ?? null,
    align: (pPr.match(/<w:jc w:val="([^"]+)"/) ?? [])[1] ?? null,
    size: Number((xml.match(/<w:sz w:val="(\d+)"/) ?? [])[1] ?? 0),
    /** كل مقاطع النصّ عريضة (لا بعضها) — العنوان عريض بكامله */
    bold:
      textRuns.length > 0
        ? textRuns.every((r) => isBoldTag(r))
        : runs.length > 0 && runs.every(isBoldTag),
    underline: /<w:u\s+w:val="(?!none)/.test(xml),
    listItem: /<w:numPr>/.test(pPr),
  };
}

/**
 * فقرات المستند بالترتيب، مع خصائص تنسيقها.
 * فقرات الجداول مشمولة (تظهر ضمن نفس التسلسل) — والترويسة والتذييل
 * ليستا من `document.xml` أصلاً فتُستثنيان تلقائياً.
 */
export function readDocx(filePath) {
  const files = unzip(filePath);
  const document = files.get('word/document.xml');
  if (!document) throw new Error('لا يحتوي الملف على word/document.xml');

  const xml = document.toString('utf8');
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) ?? [null, xml])[1];

  /*
   * نمرّ على الجسم بالتسلسل ونتتبّع دخولنا في جدول: فقرات الجداول
   * تنسيقها عريض غالباً لكنها ليست عناوين فصول، فنميّزها بعلامة.
   */
  const paragraphs = [];
  const nodes = body.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g) ?? [];
  for (const node of nodes) {
    if (node.startsWith('<w:tbl>')) {
      for (const p of node.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? []) {
        paragraphs.push({ text: paragraphText(p), ...paragraphProps(p), inTable: true });
      }
    } else {
      paragraphs.push({ text: paragraphText(node), ...paragraphProps(node), inTable: false });
    }
  }

  // الحواشي — تُلحق بآخر الكتاب كي لا تُفقد
  const notes = [];
  const footnotes = files.get('word/footnotes.xml');
  if (footnotes) {
    const fx = footnotes.toString('utf8');
    for (const note of fx.match(/<w:footnote\s[^>]*>[\s\S]*?<\/w:footnote>/g) ?? []) {
      const type = (note.match(/w:type="([^"]+)"/) ?? [])[1];
      if (type) continue; // separator / continuationSeparator وليست حاشية حقيقية
      const text = paragraphText(note).replace(/\s+/g, ' ').trim();
      if (text) notes.push(text);
    }
  }

  return { paragraphs, notes };
}
