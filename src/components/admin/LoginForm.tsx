'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'تعذّر تسجيل الدخول.');
        setBusy(false);
        return;
      }

      // refresh قبل push حتى تُقرأ الجلسة الجديدة في مكوّن الخادم
      router.refresh();
      router.push('/admin');
    } catch {
      setError('تعذّر الاتصال بالخادم.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-ink-700 bg-ink-900/80 p-8 shadow-2xl"
      >
        <h1 className="font-display text-3xl text-gold-300">لوحة الإدارة</h1>
        <hr className="rule-gold mt-4" />
        <p className="mt-5 font-ui text-[0.78rem] leading-relaxed text-ivory-dim">
          إدارة كتب المكتبة — الإضافة والتعديل والحذف.
        </p>

        <label
          htmlFor="password"
          className="mt-7 block font-ui text-[0.7rem] tracking-[0.18em] text-ivory-dim"
        >
          كلمة السرّ
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          dir="ltr"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded border border-ink-600 bg-ink-950 px-3 py-2.5 text-center font-ui text-ivory outline-none transition-colors focus:border-gold-700"
        />

        {error && (
          <p role="alert" className="mt-4 font-ui text-[0.78rem] text-copper">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="mt-6 w-full rounded bg-[image:var(--grad-gold-surface)] py-2.5 font-ui text-[0.8rem] font-semibold tracking-wide text-ink-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? '...' : 'دخول'}
        </button>
      </form>
    </main>
  );
}
