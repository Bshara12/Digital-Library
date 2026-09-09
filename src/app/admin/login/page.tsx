import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/admin/auth';
import { LoginForm } from '@/components/admin/LoginForm';

/** الجلسة تُقرأ من الكوكي، فالصفحة لا تُخزَّن مسبقاً */
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  if (await isAuthenticated()) redirect('/admin');
  return <LoginForm />;
}
