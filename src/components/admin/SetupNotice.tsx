/**
 * شاشة «الإعداد ناقص»
 * ---------------------------------------------------------------
 * أشيع سبب لعطل اللوحة على Vercel هو غياب متغيّرات GitHub. صفحة
 * خطأ عامة تترك المستخدم يخمّن، فنقول ما ينقص وكيف يُضبط.
 */

export function SetupNotice({ message, onVercel }: { message: string; onVercel: boolean }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="font-display text-3xl text-gold-300">اللوحة تحتاج إعداداً</h1>
      <hr className="rule-gold mt-5" />

      <p className="mt-6 whitespace-pre-line rounded border border-copper/50 bg-copper/10 px-4 py-3 font-ui text-[0.82rem] leading-relaxed text-ivory">
        {message}
      </p>

      {onVercel && (
        <div className="mt-8 font-ui text-[0.8rem] leading-loose text-ivory-dim">
          <p className="text-ivory">الخطوات على Vercel:</p>
          <ol className="mt-3 list-inside list-decimal space-y-2">
            <li>
              أنشئ رمز وصول من GitHub:{' '}
              <span dir="ltr" className="text-gold-300">
                Settings ← Developer settings ← Personal access tokens
              </span>{' '}
              بصلاحية <span dir="ltr">Contents: Read and write</span> على المستودع.
            </li>
            <li>
              في Vercel:{' '}
              <span dir="ltr" className="text-gold-300">
                Project ← Settings ← Environment Variables
              </span>
            </li>
            <li>
              أضف <code dir="ltr">GITHUB_TOKEN</code> و <code dir="ltr">GITHUB_REPO</code> (بصيغة{' '}
              <span dir="ltr">owner/repo</span>) و <code dir="ltr">ADMIN_PASSWORD</code>.
            </li>
            <li>أعد النشر (Redeploy) ليقرأ المشروع المتغيّرات الجديدة.</li>
          </ol>
        </div>
      )}
    </main>
  );
}
