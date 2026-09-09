/**
 * مصادقة لوحة الإدارة
 * ===============================================================
 * اللوحة تُشغَّل على جهاز صاحب الموقع أو على سيرفر Node خاص به،
 * ومستخدمها واحد. فلا حاجة لقاعدة مستخدمين ولا لخدمة خارجية —
 * كلمة سرّ واحدة وجلسة موقَّعة في كوكي.
 *
 * الجلسة ليست معرّفاً يُبحث عنه في مخزن (لا مخزن أصلاً)، بل حمولة
 * موقّعة بـ HMAC-SHA256: `<تاريخ الانتهاء>.<التوقيع>`. الخادم يتحقّق
 * من التوقيع فيعرف أنه هو من أصدرها، ومن التاريخ فيعرف أنها حيّة.
 * تزوير الكوكي يتطلّب معرفة السرّ.
 *
 * الإعداد (كله اختياري — يعمل بلا أي متغيّر بيئة):
 *   ADMIN_PASSWORD  كلمة السرّ            (الافتراضي: 123456)
 *   ADMIN_SECRET    سرّ توقيع الجلسات      (يُشتقّ من كلمة السرّ إن غاب)
 *   ADMIN_SESSION_HOURS  عمر الجلسة بالساعات (الافتراضي: 12)
 *
 * ملاحظة أمان: كلمة السرّ الافتراضية `123456` مناسبة للتشغيل المحلي.
 * إن عرّضت اللوحة على الإنترنت فاضبط ADMIN_PASSWORD و ADMIN_SECRET في
 * ملف `.env.local`.
 */

import crypto from 'node:crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'esam_admin_session';

const DEFAULT_PASSWORD = '123456';
const SESSION_VERSION = 'v1';

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || DEFAULT_PASSWORD;
}

/** هل نعمل بكلمة السرّ الافتراضية؟ تعرضه اللوحة كتنبيه. */
export function isUsingDefaultPassword(): boolean {
  return adminPassword() === DEFAULT_PASSWORD;
}

/**
 * سرّ التوقيع. إن لم يُضبط اشتُقّ من كلمة السرّ — فتبطل كل الجلسات
 * تلقائياً عند تغييرها، وهو السلوك المرغوب.
 */
function signingSecret(): string {
  const explicit = process.env.ADMIN_SECRET?.trim();
  if (explicit) return explicit;
  return crypto.createHash('sha256').update(`esam-library:${adminPassword()}`).digest('hex');
}

function sessionHours(): number {
  const raw = Number(process.env.ADMIN_SESSION_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 12;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', signingSecret()).update(payload).digest('hex');
}

/** مقارنة ثابتة الزمن — المقارنة العادية تسرّب طول البادئة الصحيحة */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual يرمي عند اختلاف الطول، فنوحّده بالتجزئة أولاً
  const hashA = crypto.createHash('sha256').update(bufA).digest();
  const hashB = crypto.createHash('sha256').update(bufB).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function verifyPassword(candidate: unknown): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  return safeEqual(candidate, adminPassword());
}

function issueToken(): string {
  const expiresAt = Date.now() + sessionHours() * 3600_000;
  const payload = `${SESSION_VERSION}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [version, expiresAt, signature] = parts;
  if (version !== SESSION_VERSION) return false;
  if (!safeEqual(signature, sign(`${version}.${expiresAt}`))) return false;
  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}

/* ---------------------------------------------------------------
   الواجهة المستعملة في الصفحات ومسارات الـ API
   --------------------------------------------------------------- */

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return isValidToken(store.get(SESSION_COOKIE)?.value);
}

export async function startSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, issueToken(), {
    httpOnly: true,
    sameSite: 'lax',
    // على http://localhost لا يُقبل الكوكي الآمن، فنقصره على الإنتاج
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionHours() * 3600,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/* ---------------------------------------------------------------
   تحديد محاولات الدخول
   ---------------------------------------------------------------
   كلمة السرّ قصيرة، فبلا مهلة يمكن تجريبها آلياً. عدّاد في الذاكرة
   يكفي: العملية واحدة والمستخدم واحد، ولا نريد مخزناً لأجل هذا.
*/
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 5 * 60_000;

const attempts = new Map<string, { count: number; firstAt: number }>();

export function loginBlockedFor(key: string): number {
  const record = attempts.get(key);
  if (!record) return 0;
  if (Date.now() - record.firstAt > LOCKOUT_MS) {
    attempts.delete(key);
    return 0;
  }
  if (record.count < MAX_ATTEMPTS) return 0;
  return Math.ceil((LOCKOUT_MS - (Date.now() - record.firstAt)) / 1000);
}

export function recordFailedLogin(key: string): void {
  const record = attempts.get(key);
  if (!record || Date.now() - record.firstAt > LOCKOUT_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  record.count += 1;
}

export function clearLoginAttempts(key: string): void {
  attempts.delete(key);
}
