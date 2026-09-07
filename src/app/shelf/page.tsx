import type { Metadata } from 'next';
import { getAllBooks } from '@/lib/books';
import { MyShelf } from '@/components/MyShelf';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'رفّي',
  description: 'ما بدأته من كتب عصام السالم وما علّمته من صفحاتها.',
  // رفّ خاص بكل متصفّح — لا معنى لفهرسته
  robots: { index: false, follow: true },
};

export default function ShelfPage() {
  return (
    <>
      <main className="mx-auto max-w-4xl px-6 pb-28 pt-20">
        <h1 className="font-display text-4xl text-gold-300 sm:text-5xl">رفّي</h1>
        <hr className="rule-gold mt-6" />
        <MyShelf books={getAllBooks()} />
      </main>
      <Footer />
    </>
  );
}
