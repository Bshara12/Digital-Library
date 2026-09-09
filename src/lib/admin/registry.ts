/**
 * سجلّ الكتب — القراءة والكتابة من جهة الخادم
 * ===============================================================
 * `data/books.registry.json` هو مصدر الحقيقة لأي كتاب في المكتبة:
 * منه تقرأ `scripts/books.config.mjs` وعليه تعتمد كل السكربتات.
 * لوحة الإدارة تعدّله عبر هذه الوحدة وحدها.
 *
 * الكتابة ذرّية (ملف مؤقّت ثم `rename`) لأن انقطاعاً في منتصف
 * الكتابة يترك JSON مقطوعاً — وذلك يُسقط الموقع كلّه لا كتاباً واحداً.
 */

import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
export const REGISTRY_PATH = path.join(ROOT, 'data', 'books.registry.json');
export const BOOKS_DIR = path.join(ROOT, 'books');
export const CONTENT_BOOKS_DIR = path.join(ROOT, 'content', 'books');
export const PDF_DIR = path.join(ROOT, 'public', 'books');

export interface RegistryOverrides {
  title?: string;
  subtitle?: string | null;
  description?: string;
}

export interface RegistryEntry {
  docx: string;
  slug: string;
  accent: string;
  tags: string[];
  order: number;
  overrides?: RegistryOverrides;
}

export function readRegistry(): RegistryEntry[] {
  const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) as RegistryEntry[];
  return raw.sort((a, b) => a.order - b.order);
}

export function writeRegistry(entries: RegistryEntry[]): void {
  const ordered = entries
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({
      docx: entry.docx,
      slug: entry.slug,
      accent: entry.accent,
      tags: entry.tags,
      order: entry.order,
      ...(entry.overrides && Object.keys(entry.overrides).length > 0
        ? { overrides: entry.overrides }
        : {}),
    }));

  const temp = `${REGISTRY_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, REGISTRY_PATH);
}

/** أوّل رقم ترتيب غير مستعمل — القيمة الافتراضية لكتاب جديد */
export function nextOrder(entries: RegistryEntry[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.order), 0) + 1;
}
