import { NextResponse } from 'next/server';
import {
  verifyPassword,
  startSession,
  loginBlockedFor,
  recordFailedLogin,
  clearLoginAttempts,
} from '@/lib/admin/auth';

/** الجلسات والملفّات تحتاج Node لا Edge */
export const runtime = 'nodejs';

/**
 * معرّف المحاوِل لتحديد المعدّل. خلف وكيل عكسي يأتي العنوان في
 * `x-forwarded-for`؛ محلياً لا رأس ولا عنوان، فنُرجع مفتاحاً واحداً
 * — وهو الصحيح هنا لأن المستخدم واحد على أي حال.
 */
function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
}

export async function POST(request: Request) {
  const key = clientKey(request);

  const blockedFor = loginBlockedFor(key);
  if (blockedFor > 0) {
    return NextResponse.json(
      { error: `محاولات كثيرة خاطئة. جرّب بعد ${Math.ceil(blockedFor / 60)} دقيقة.` },
      { status: 429 }
    );
  }

  let password: unknown;
  try {
    password = ((await request.json()) as { password?: unknown }).password;
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح.' }, { status: 400 });
  }

  if (!verifyPassword(password)) {
    recordFailedLogin(key);
    return NextResponse.json({ error: 'كلمة السرّ غير صحيحة.' }, { status: 401 });
  }

  clearLoginAttempts(key);
  await startSession();
  return NextResponse.json({ ok: true });
}
