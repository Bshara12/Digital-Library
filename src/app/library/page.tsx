import type { Metadata } from 'next';
import { getAllBooks, getAllTags } from '@/lib/books';
import { LibraryGrid } from '@/components/LibraryGrid';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'المكتبة',
  description: 'كل أعمال المهندس عصام السالم — تُقرأ كاملة عبر الموقع.',
};

export default function LibraryPage() {
  return (
    <>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-20">
        <h1 className="font-display text-4xl text-gold-300 sm:text-5xl">المكتبة</h1>
        <hr className="rule-gold mt-6" />
        <LibraryGrid books={getAllBooks()} tags={getAllTags()} />
      </main>
      <Footer />
    </>
  );
}
