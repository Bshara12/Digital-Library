/**
 * عميل GitHub — الكتابة على المستودع بدل القرص
 * ===============================================================
 * على Vercel نظام الملفات للقراءة فقط، فلا يمكن للوحة أن تحفظ
 * كتاباً كما تفعل محلياً. الحلّ: تودع التغيير في المستودع، فتلتقطه
 * Vercel وتُعيد النشر. المكتبة تبقى موقعاً ثابتاً بلا قاعدة بيانات،
 * وتاريخ Git يصير سجلّ التغييرات — بلا خدمة إضافية ولا تكلفة.
 *
 * نستعمل «Git Data API» لا واجهة المحتويات البسيطة، لأن إضافة كتاب
 * تلمس خمسة ملفات دفعة واحدة (الملف، السجلّ، البيانات، الصفحات،
 * الفهرس). واجهة المحتويات تكتب ملفاً واحداً لكل طلب — أي خمس
 * دفعات وخمس عمليات نشر، وحالة وسيطة مكسورة بينها. أما هنا فدفعة
 * واحدة ذرّية: إمّا أن تظهر كلها أو لا شيء.
 *
 * الإعداد (متغيّرات بيئة):
 *   GITHUB_TOKEN   رمز وصول بصلاحية الكتابة على المستودع
 *   GITHUB_REPO    "owner/repo"
 *   GITHUB_BRANCH  الفرع المنشور (الافتراضي: main)
 */

/**
 * قابل للتوجيه: GitHub Enterprise تستعمل نطاقاً آخر، والاختبارات
 * تُوجّهه إلى خادم محلّي يحاكي الواجهة.
 */
const API = process.env.GITHUB_API_URL?.trim().replace(/\/$/, '') || 'https://api.github.com';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export class GitHubError extends Error {}

/** يقرأ الإعداد من البيئة، أو يُرجع null إن لم يُضبط */
export function githubConfigFromEnv(): GitHubConfig | null {
  const token = process.env.GITHUB_TOKEN?.trim();
  const slug = process.env.GITHUB_REPO?.trim();
  if (!token || !slug) return null;

  const [owner, repo] = slug.split('/');
  if (!owner || !repo) {
    throw new GitHubError('GITHUB_REPO يجب أن يكون بصيغة owner/repo — مثال: Bshara12/Digital-Library');
  }
  return { token, owner, repo, branch: process.env.GITHUB_BRANCH?.trim() || 'main' };
}

async function call<T>(
  config: GitHubConfig,
  method: string,
  path: string,
  body?: unknown,
  accept = 'application/vnd.github+json'
): Promise<T> {
  const response = await fetch(`${API}/repos/${config.owner}/${config.repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'esam-library-admin',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    // بيانات المستودع تتغيّر بين النداءات — لا تخزين
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new GitHubError(describeFailure(response.status, path, detail));
  }

  if (accept.includes('raw')) {
    return Buffer.from(await response.arrayBuffer()) as unknown as T;
  }
  return (await response.json()) as T;
}

/** رسائل بالعربية لأشيع أسباب الفشل — الرسالة الخام من GitHub بالإنجليزية وغير مفيدة للمستخدم */
function describeFailure(status: number, path: string, detail: string): string {
  if (status === 401) return 'رمز GitHub غير صالح أو منتهٍ — راجع GITHUB_TOKEN.';
  if (status === 403 && detail.includes('rate limit')) {
    return 'تجاوزت حدّ طلبات GitHub — انتظر قليلاً ثم أعد المحاولة.';
  }
  if (status === 403) return 'رمز GitHub لا يملك صلاحية الكتابة على هذا المستودع.';
  if (status === 404) {
    return `لم يُعثر على المسار في المستودع (${path}) — راجع GITHUB_REPO و GITHUB_BRANCH وصلاحيات الرمز.`;
  }
  if (status === 409) return 'تعارض: تغيّر الفرع أثناء الحفظ. أعد المحاولة.';
  if (status === 422) return `رفض GitHub الطلب: ${detail.slice(0, 300)}`;
  return `فشل الاتصال بـ GitHub (${status}): ${detail.slice(0, 300)}`;
}

/* ---------------------------------------------------------------
   القراءة
   --------------------------------------------------------------- */

/**
 * محتوى ملف من الفرع المنشور.
 * نقرأ من GitHub لا من القرص المنشور: نسخة Vercel قد تكون أقدم من
 * آخر حفظ (النشر يستغرق دقيقة)، والبناء على نسخة قديمة يمحو تعديلاً
 * سابقاً.
 */
export async function readFile(config: GitHubConfig, path: string): Promise<Buffer | null> {
  try {
    return await call<Buffer>(
      config,
      'GET',
      `/contents/${encodePath(path)}?ref=${encodeURIComponent(config.branch)}`,
      undefined,
      'application/vnd.github.raw'
    );
  } catch (error) {
    if (error instanceof GitHubError && error.message.includes('لم يُعثر')) return null;
    throw error;
  }
}

/** المسار يُرمَّز جزءاً جزءاً — أسماء الكتب عربية والشرطة المائلة فاصل حقيقي */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/* ---------------------------------------------------------------
   الكتابة — دفعة واحدة
   --------------------------------------------------------------- */

export interface FileChange {
  path: string;
  /** null = حذف الملف */
  content: Buffer | null;
}

export interface CommitResult {
  sha: string;
  url: string;
}

/**
 * يكتب كل التغييرات في إيداع واحد على رأس الفرع.
 *
 * الخطوات هي خطوات Git نفسها: نُنشئ كائناً لكل ملف (blob)، ثم شجرة
 * تعتمد على شجرة الإيداع الحالي (فلا نمسّ بقية الملفات)، ثم إيداعاً
 * يشير إليها، ثم نحرّك الفرع. الحذف يُمثَّل بمدخلة شجرة قيمتها null.
 */
export async function commitFiles(
  config: GitHubConfig,
  changes: FileChange[],
  message: string
): Promise<CommitResult> {
  if (changes.length === 0) throw new GitHubError('لا تغييرات لحفظها.');

  const ref = await call<{ object: { sha: string } }>(
    config,
    'GET',
    `/git/ref/heads/${encodeURIComponent(config.branch)}`
  );
  const parent = ref.object.sha;

  const baseCommit = await call<{ tree: { sha: string } }>(config, 'GET', `/git/commits/${parent}`);

  const tree: Array<Record<string, unknown>> = [];
  for (const change of changes) {
    if (change.content === null) {
      tree.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const blob = await call<{ sha: string }>(config, 'POST', '/git/blobs', {
      content: change.content.toString('base64'),
      encoding: 'base64',
    });
    tree.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const newTree = await call<{ sha: string }>(config, 'POST', '/git/trees', {
    base_tree: baseCommit.tree.sha,
    tree,
  });

  const commit = await call<{ sha: string; html_url: string }>(config, 'POST', '/git/commits', {
    message,
    tree: newTree.sha,
    parents: [parent],
  });

  await call(config, 'PATCH', `/git/refs/heads/${encodeURIComponent(config.branch)}`, {
    sha: commit.sha,
  });

  return { sha: commit.sha, url: commit.html_url };
}

/* ---------------------------------------------------------------
   كائنات مؤقّتة — لرفع الملفات الكبيرة على دفعات
   ---------------------------------------------------------------
   Vercel تحدّ جسم الطلب بـ ٤.٥ م.ب، وبعض ملفات Word أكبر. المتصفّح
   يرسلها مقاطع، وكل مقطع يصير كائناً في المستودع (blob) لا يشير
   إليه شيء. عند الحفظ نجمع المقاطع في الذاكرة ونُنشئ الملف الكامل.
   الكائنات غير المشار إليها لا تظهر في المستودع وتُنظّفها GitHub.
*/

export async function createBlob(config: GitHubConfig, chunk: Buffer): Promise<string> {
  const blob = await call<{ sha: string }>(config, 'POST', '/git/blobs', {
    content: chunk.toString('base64'),
    encoding: 'base64',
  });
  return blob.sha;
}

export async function readBlob(config: GitHubConfig, sha: string): Promise<Buffer> {
  const blob = await call<{ content: string; encoding: string }>(
    config,
    'GET',
    `/git/blobs/${sha}`
  );
  if (blob.encoding !== 'base64') throw new GitHubError('ترميز كائن غير متوقّع من GitHub.');
  return Buffer.from(blob.content, 'base64');
}
