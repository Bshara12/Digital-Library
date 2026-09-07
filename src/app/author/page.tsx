import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getAllBooks } from '@/lib/books';
import { Footer } from '@/components/Footer';
import { Reveal } from '@/components/Reveal';
import { AuthorTimeline } from '@/components/AuthorTimeline';
import author from '@data/author.json';

export const metadata: Metadata = {
  title: 'عن الكاتب',
  description: `${author.name} — ${author.role}`,
};

export default function AuthorPage() {
  const books = getAllBooks();

  return (
    <>
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-20">
        <Reveal className="text-center">
          {/* إطار الصورة — المسار والنص البديل يأتيان من data/author.json */}
          {author.portrait ? (
            <div className="relative mx-auto h-40 w-40 overflow-hidden rounded-full border border-gold-500/40 bg-ink-800">
              <Image
                src={author.portrait}
                alt={author.portraitAlt}
                fill
                sizes="160px"
                priority
                className="object-cover object-top"
              />
            </div>
          ) : (
            <div className="mx-auto grid h-40 w-40 place-items-center rounded-full border border-gold-500/40 bg-ink-800">
              <span className="font-display text-4xl text-gold-500/45">ع&nbsp;س</span>
            </div>
          )}

          <h1 className="mt-10 font-display text-4xl text-gold-300 sm:text-5xl">{author.name}</h1>
          <p className="mt-3 font-ui text-[0.7rem] tracking-[0.3em] text-ivory-dim">{author.role}</p>
          <hr className="rule-gold mx-auto mt-8 w-48" />
        </Reveal>

        {author.isPlaceholder && (
          <Reveal delay={0.1}>
            <p className="mt-10 rounded-sm border border-gold-700/40 bg-gold-500/5 px-6 py-4 text-center font-ui text-xs leading-relaxed text-gold-300/80">
              نصّ مؤقّت — تُملأ السيرة والصورة من <code>data/author.json</code> دون تعديل الكود.
            </p>
          </Reveal>
        )}

        <div className="mt-12 space-y-7">
          {author.bio.map((paragraph, i) => (
            <Reveal key={i} delay={0.05 * i}>
              <p className="font-body text-[1.05rem] leading-[2.1] text-ivory/85">{paragraph}</p>
            </Reveal>
          ))}
        </div>

        <section className="mt-24">
          <Reveal>
            <h2 className="font-display text-2xl text-gold-300">الأعمال</h2>
            <hr className="rule-gold mt-6" />
          </Reveal>
          <AuthorTimeline books={books} />
        </section>

        <Reveal>
          <div className="mt-20 text-center">
            <Link
              href="/library"
              className="rounded-sm border border-gold-500/45 px-9 py-3.5 font-body text-sm text-gold-300 transition-colors hover:border-gold-500 hover:bg-gold-500/8"
            >
              تصفّح المكتبة
            </Link>
          </div>
        </Reveal>
      </main>
      <Footer />
    </>
  );
}
