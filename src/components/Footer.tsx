import Link from 'next/link';

const LINKS = [
  { href: '/library', label: 'المكتبة' },
  { href: '/search', label: 'البحث' },
  { href: '/shelf', label: 'رفّي' },
  { href: '/author', label: 'عن الكاتب' },
];

export function Footer() {
  return (
    <footer className="mt-10 px-6 pb-14">
      <hr className="rule-gold mx-auto max-w-5xl" />
      <div className="mx-auto mt-10 flex max-w-5xl flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-start">
        <div>
          <p className="font-display text-lg text-gold-300">عصام السالم</p>
          <p className="mt-1.5 font-ui text-[0.65rem] tracking-[0.18em] text-ivory-dim">
            جميع الحقوق محفوظة للمؤلف
          </p>
        </div>

        <nav className="flex gap-7">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-body text-sm text-ivory-dim transition-colors duration-200 hover:text-gold-300"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
