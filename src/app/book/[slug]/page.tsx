import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBookMeta, getBookSlugs, getAllBooks } from '@/lib/books';
import { BookCover } from '@/components/BookCover';
import { Footer } from '@/components/Footer';
import { Reveal } from '@/components/Reveal';
import { ContinueReading } from '@/components/ContinueReading';
import { DownloadBook } from '@/components/DownloadBook';

/** الكتب معروفة وقت البناء — كل الصفحات ثابتة */
export function generateStaticParams() {
  return getBookSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!getBookSlugs().includes(slug)) return {};
  const book = getBookMeta(slug);
  return {
    title: book.title,
    description: book.subtitle ?? book.description.slice(0, 160),
  };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getBookSlugs().includes(slug)) notFound();

  const book = getBookMeta(slug);
  const others = getAllBooks().filter((b) => b.slug !== slug);

  return (
    <>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <Link
          href="/library"
          className="font-ui text-[0.7rem] tracking-[0.2em] text-ivory-dim transition-colors hover:text-gold-300"
        >
          ← المكتبة
        </Link>

        <div className="mt-12 grid gap-14 md:grid-cols-[minmax(0,300px)_1fr] md:gap-20">
          {/* الغلاف معلّقاً بميلان ثابت */}
          <Reveal className="mx-auto w-[62%] max-w-[300px] md:w-full">
            <div className="card-3d">
              <div
                className="preserve-3d"
                style={{
                  transform: 'rotateY(-14deg)',
                  boxShadow: '0 40px 80px -30px rgba(0,0,0,0.9)',
                }}
              >
                <BookCover book={book} showSubtitle />
              </div>
            </div>
          </Reveal>

          <div>
            <Reveal>
              <h1 className="font-display text-4xl leading-tight text-gold-300 sm:text-5xl">
                {book.title}
              </h1>
              {book.subtitle && (
                <p className="mt-4 font-body text-lg leading-relaxed text-ivory/75">
                  {book.subtitle}
                </p>
              )}
            </Reveal>

            <Reveal delay={0.1}>
              <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
                {[
                  ['صفحة', book.pageCount],
                  ['كلمة', book.wordCount.toLocaleString('en-US')],
                  ['دقيقة قراءة', book.readingMinutes],
                  ['فصل', book.chapters.length],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dd className="font-latin text-2xl text-gold-300">{value}</dd>
                    <dt className="mt-0.5 font-ui text-[0.6rem] tracking-[0.2em] text-ivory-dim">
                      {label}
                    </dt>
                  </div>
                ))}
              </dl>
            </Reveal>

            <Reveal delay={0.15}>
              <hr className="rule-gold my-10" />
              <p className="font-body text-[1.05rem] leading-[2] text-ivory/85">
                {book.description}
              </p>
            </Reveal>

            <Reveal delay={0.2}>
              <div className="mt-11 flex flex-wrap items-center gap-4">
                <ContinueReading slug={book.slug} pageCount={book.pageCount} />
                <DownloadBook pdf={book.pdf} title={book.title} />
              </div>

              <div className="mt-6">
                <div className="flex flex-wrap items-center gap-2">
                  {book.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-ink-700 px-4 py-1.5 font-ui text-[0.7rem] text-copper"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        {/* الفهرس */}
        {book.chapters.length > 0 && (
          <section className="mt-24">
            <Reveal>
              <h2 className="font-display text-2xl text-gold-300">الفهرس</h2>
              {book.tocConfidence === 'suggested' && (
                <p className="mt-2 font-ui text-[0.7rem] text-ivory-dim">
                  هذا الكتاب لا يحتوي فهرساً في أصله — العناوين أدناه مستنتجة من بنية المتن.
                </p>
              )}
              <hr className="rule-gold mt-6" />
            </Reveal>

            <ol className="mt-4">
              {book.chapters.map((chapter, i) => (
                <Reveal key={`${chapter.page}-${i}`} delay={Math.min(i * 0.03, 0.4)}>
                  <li>
                    <Link
                      href={`/read/${book.slug}?p=${chapter.anchorPage}`}
                      className="group flex items-baseline gap-4 border-b border-ink-800 py-4 transition-colors hover:border-gold-700"
                    >
                      <span className="font-latin text-xs text-ivory-dim group-hover:text-gold-500">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="flex-1 font-body text-[1.02rem] leading-relaxed text-ivory/90 transition-colors group-hover:text-gold-300">
                        {chapter.title}
                      </span>
                      <span className="font-latin text-sm text-ivory-dim">{chapter.page}</span>
                    </Link>
                  </li>
                </Reveal>
              ))}
            </ol>
          </section>
        )}

        {/* أعمال أخرى */}
        <section className="mt-28">
          <Reveal>
            <h2 className="font-display text-2xl text-gold-300">أعمال أخرى للكاتب</h2>
            <hr className="rule-gold mt-6" />
          </Reveal>
          <ul className="mt-10 flex gap-6 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {others.map((other) => (
              <li key={other.slug} className="w-32 flex-none sm:w-36">
                <Link href={`/book/${other.slug}`} className="group block">
                  <div className="transition-transform duration-300 group-hover:-translate-y-1.5">
                    <BookCover book={other} />
                  </div>
                  <p className="mt-3 font-body text-xs leading-snug text-ivory-dim transition-colors group-hover:text-gold-300">
                    {other.title}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <Footer />
    </>
  );
}
