/**
 * مخزن اللوحة — القرص محلياً، المستودع على Vercel
 * ===============================================================
 * منطق إضافة كتاب وحذفه لا يتغيّر بتغيّر مكان الحفظ: في الحالتين
 * ينتج **مجموعة تغييرات على ملفات** (مسار ← محتوى، أو حذف). هذا
 * الملف يعرّف تلك الواجهة ويقدّم تطبيقين لها:
 *
 *   LocalStore   يكتب على القرص — للتشغيل على جهازك أو سيرفر Node.
 *   GitHubStore  يودع في المستودع — Vercel تلتقط الإيداع وتعيد النشر.
 *
 * الاختيار آلي: وُجد GITHUB_TOKEN و GITHUB_REPO ⇒ المستودع، وإلا
 * القرص. يمكن فرضه بـ ADMIN_STORAGE=local|github.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  GitHubError,
  commitFiles,
  createBlob,
  githubConfigFromEnv,
  readBlob,
  readFile,
  type FileChange,
  type GitHubConfig,
} from './github';
import type { RegistryEntry } from './registry';
import type { BookSummary } from '@/lib/books';

export type { FileChange };

export const REGISTRY_FILE = 'data/books.registry.json';
export const INDEX_FILE = 'content/index.json';

export interface ApplyResult {
  /** رابط الإيداع على GitHub — غائب في الوضع المحلي */
  commitUrl?: string;
  /** هل يحتاج الموقع إعادة نشر حتى يظهر التغيير؟ */
  deploying: boolean;
}

export interface Store {
  readonly kind: 'local' | 'github';
  /** هل يستطيع هذا المخزن توليد ملفات PDF؟ (يحتاج Word/LibreOffice على الجهاز) */
  readonly canGeneratePdf: boolean;

  readText(path: string): Promise<string | null>;
  readBinary(path: string): Promise<Buffer | null>;
  apply(changes: FileChange[], message: string): Promise<ApplyResult>;

  /** يحفظ مقطعاً من ملف كبير ويُعيد مرجعاً إليه */
  stageChunk(chunk: Buffer): Promise<string>;
  /** يجمع المقاطع بالترتيب في ملف واحد */
  assembleChunks(refs: string[]): Promise<Buffer>;
}

/* ---------------------------------------------------------------
   القرص المحلي
   --------------------------------------------------------------- */

/**
 * المقاطع المرفوعة تنتظر في الذاكرة حتى الحفظ. محلياً العملية واحدة
 * فالذاكرة تكفي — ولا نكتب مقاطع نصف مرفوعة على القرص.
 */
const pendingChunks = new Map<string, { bytes: Buffer; at: number }>();
const CHUNK_TTL_MS = 30 * 60_000;

function sweepChunks(): void {
  const now = Date.now();
  for (const [ref, entry] of pendingChunks) {
    if (now - entry.at > CHUNK_TTL_MS) pendingChunks.delete(ref);
  }
}

class LocalStore implements Store {
  readonly kind = 'local' as const;
  readonly canGeneratePdf = true;
  private readonly root = process.cwd();

  private resolve(relative: string): string {
    const target = path.resolve(this.root, relative);
    // حارس أخير ضدّ مسار يخرج من المشروع — المدخلات مُتحقَّق منها أصلاً
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new Error(`مسار خارج المشروع: ${relative}`);
    }
    return target;
  }

  async readText(relative: string): Promise<string | null> {
    const file = this.resolve(relative);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  }

  async readBinary(relative: string): Promise<Buffer | null> {
    const file = this.resolve(relative);
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  }

  async apply(changes: FileChange[]): Promise<ApplyResult> {
    /*
     * الكتابة ذرّية لكل ملف (ملف مؤقّت ثم rename): انقطاعٌ في منتصف
     * كتابة `index.json` يترك JSON مقطوعاً، وذلك يُسقط الموقع كلّه
     * لا كتاباً واحداً.
     */
    for (const change of changes) {
      const file = this.resolve(change.path);
      if (change.content === null) {
        fs.rmSync(file, { force: true });
        continue;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temp, change.content);
      fs.renameSync(temp, file);
    }
    // الملفات على القرص فوراً — لا نشر ولا انتظار
    return { deploying: false };
  }

  async stageChunk(chunk: Buffer): Promise<string> {
    sweepChunks();
    const ref = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    pendingChunks.set(ref, { bytes: chunk, at: Date.now() });
    return ref;
  }

  async assembleChunks(refs: string[]): Promise<Buffer> {
    const parts: Buffer[] = [];
    for (const ref of refs) {
      const entry = pendingChunks.get(ref);
      if (!entry) throw new Error('انتهت صلاحية الرفع — أعد اختيار الملف والمحاولة.');
      parts.push(entry.bytes);
    }
    for (const ref of refs) pendingChunks.delete(ref);
    return Buffer.concat(parts);
  }
}

/* ---------------------------------------------------------------
   مستودع GitHub
   --------------------------------------------------------------- */

class GitHubStore implements Store {
  readonly kind = 'github' as const;
  /** التحويل إلى PDF يحتاج Word أو LibreOffice مثبّتاً — لا وجود لهما هنا */
  readonly canGeneratePdf = false;

  constructor(private readonly config: GitHubConfig) {}

  async readText(relative: string): Promise<string | null> {
    const bytes = await readFile(this.config, relative);
    return bytes ? bytes.toString('utf8') : null;
  }

  readBinary(relative: string): Promise<Buffer | null> {
    return readFile(this.config, relative);
  }

  async apply(changes: FileChange[], message: string): Promise<ApplyResult> {
    const commit = await commitFiles(this.config, changes, message);
    return { commitUrl: commit.url, deploying: true };
  }

  stageChunk(chunk: Buffer): Promise<string> {
    return createBlob(this.config, chunk);
  }

  async assembleChunks(refs: string[]): Promise<Buffer> {
    const parts: Buffer[] = [];
    for (const ref of refs) {
      try {
        parts.push(await readBlob(this.config, ref));
      } catch (error) {
        /*
         * مقطع مفقود يعني رفعاً قديماً نظّفت GitHub كائناته، لا خللاً
         * في الإعداد — ورسالة «راجع GITHUB_TOKEN» هنا تُضلّل.
         */
        if (error instanceof GitHubError && error.message.includes('لم يُعثر')) {
          throw new Error('انتهت صلاحية الرفع — أعد اختيار الملف والمحاولة.');
        }
        throw error;
      }
    }
    return Buffer.concat(parts);
  }
}

/* ---------------------------------------------------------------
   الاختيار
   --------------------------------------------------------------- */

export class StoreUnavailableError extends Error {}

export function getStore(): Store {
  const forced = process.env.ADMIN_STORAGE?.trim().toLowerCase();
  const config = githubConfigFromEnv();

  if (forced === 'local') return new LocalStore();
  if (forced === 'github' || (!forced && config)) {
    if (!config) {
      throw new StoreUnavailableError(
        'ADMIN_STORAGE=github لكن GITHUB_TOKEN أو GITHUB_REPO غير مضبوط.'
      );
    }
    return new GitHubStore(config);
  }

  /*
   * على Vercel نظام الملفات للقراءة فقط، فالوضع المحلي سيفشل عند أوّل
   * كتابة برسالة EROFS غامضة. نوقفه هنا برسالة تقول ما ينقص فعلاً.
   */
  if (process.env.VERCEL) {
    throw new StoreUnavailableError(
      'اللوحة تعمل على Vercel بلا إعداد GitHub. اضبط GITHUB_TOKEN و GITHUB_REPO في ' +
        'إعدادات المشروع على Vercel (Settings ← Environment Variables) ثم أعد النشر.'
    );
  }

  return new LocalStore();
}

export { GitHubError };
